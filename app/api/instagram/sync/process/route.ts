import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { apifyService } from '@/services/apifyService';
import { SocialPlatform } from '@prisma/client';
import { analyzeSentiment, getSentimentWeight } from '@/services/sentimentUtils';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { runId, viewAsUserId, datasetId } = body;

        if (!datasetId) {
            return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const isAdminViewing = (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!viewAsUserId;

        // --- LOG DE DEPURAÇÃO ---
        console.log(`[SYNC] Iniciando processamento para dataset: ${datasetId}, viewAs: ${viewAsUserId}`);
        
        // 1. Get User's Social Profile for Instagram
        let user;
        try {
            user = isAdminViewing 
                ? await prisma.user.findUnique({
                    where: { id: viewAsUserId! },
                    include: { candidateProfile: { include: { socialProfiles: { where: { platform: SocialPlatform.INSTAGRAM } } } } },
                })
                : await prisma.user.findUnique({
                    where: { email: session.user.email },
                    include: { candidateProfile: { include: { socialProfiles: { where: { platform: SocialPlatform.INSTAGRAM } } } } },
                });
        } catch (dbError: any) {
            console.error('[SYNC] Erro ao buscar usuário no DB:', dbError.message);
            throw new Error(`Erro de acesso ao banco: ${dbError.message}`);
        }

        if (!user || !user.candidateProfile) {
            console.error('[SYNC] Candidato não encontrado para ID:', viewAsUserId || session.user.email);
            return NextResponse.json({ error: 'Perfil de candidato não encontrado.' }, { status: 404 });
        }

        const instagramProfile = user.candidateProfile.socialProfiles[0];
        if (!instagramProfile) {
            console.error('[SYNC] Perfil Instagram não vinculado para:', user.name);
            return NextResponse.json({ error: 'Perfil do Instagram não encontrado.' }, { status: 404 });
        }

        console.log(`[SYNC] Processando dados para @${instagramProfile.handle}...`);

        // Fetch scraped data
        const scrapedData = await apifyService.fetchRunItems(datasetId);

        // Update profile followers / posts
        if (scrapedData.profile) {
            await prisma.socialProfile.update({
                where: { id: instagramProfile.id },
                data: {
                    followers: scrapedData.profile.followers || instagramProfile.followers,
                    postsCount: scrapedData.profile.postsCount || instagramProfile.postsCount,
                }
            });
        }

        const recentPosts = scrapedData.posts;
        let syncedPostsCount = 0;
        let newPostsCount = 0;
        let updatedPostsCount = 0;
        let syncedCommentsCount = 0;
        let totalLikesAggregator = 0;
        let totalCommentsAggregator = 0;
        const newPostIds: string[] = [];

        // Snapshot antes do sync
        const followersBefore = instagramProfile.followers ?? 0;
        const likesBefore = (await prisma.mediaPost.aggregate({
            where: { socialProfileId: instagramProfile.id },
            _sum: { likesCount: true }
        }))._sum.likesCount ?? 0;
        const commentsBefore = (await prisma.mediaPost.aggregate({
            where: { socialProfileId: instagramProfile.id },
            _sum: { commentsCount: true }
        }))._sum.commentsCount ?? 0;

        // 3. Process each Post
        for (const post of recentPosts) {
            if (!post.id || post.id === 'undefined') continue;
            
            let postTimestamp = new Date(post.timestamp);
            if (isNaN(postTimestamp.getTime())) {
                postTimestamp = new Date();
            }

            totalLikesAggregator += post.like_count || 0;
            totalCommentsAggregator += post.comments_count || 0;
            const existing = await prisma.mediaPost.findUnique({ where: { metaMediaId: post.id } });
            const isNew = !existing;

            // Upsert Post
            const mediaPost = await prisma.mediaPost.upsert({
                where: { metaMediaId: post.id },
                create: {
                    socialProfileId: instagramProfile.id,
                    metaMediaId: post.id,
                    caption: post.caption,
                    mediaType: post.media_type,
                    mediaUrl: post.media_url || post.thumbnail_url,
                    permalink: post.permalink,
                    likesCount: post.like_count || 0,
                    commentsCount: post.comments_count || 0,
                    postedAt: postTimestamp,
                },
                update: {
                    socialProfileId: instagramProfile.id,
                    likesCount: post.like_count || 0,
                    commentsCount: post.comments_count || 0,
                    lastSyncedAt: new Date(),
                }
            });
            syncedPostsCount++;
            if (isNew) { newPostsCount++; newPostIds.push(post.id); } else { updatedPostsCount++; }

            let commentsList = post.latestComments || [];
            if (commentsList.length > 0) {
                for (const comment of commentsList) {
                    let authorUsername = comment.username || comment.ownerUsername || 'unknown';
                    let authorMetaId = comment.ownerId || null;
                    let commentTimestamp = comment.timestamp || comment.createdAt || new Date().toISOString();
                    let commentText = comment.text || comment.message || '';
                    // Prevent duplicate IDs if the scraper doesn't provide one
                    let commentId = comment.id || `manual-${authorUsername}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

                    const isCandidate = authorUsername === instagramProfile.handle;

                    try {
                        await prisma.comment.upsert({
                            where: { metaCommentId: commentId },
                            create: {
                                mediaPostId: mediaPost.id,
                                metaCommentId: commentId,
                                text: commentText,
                                likeCount: comment.likesCount || 0,
                                authorUsername: authorUsername,
                                authorMetaId: authorMetaId,
                                isFromCandidate: isCandidate,
                                isHidden: false,
                                createdAt: new Date(commentTimestamp),
                            },
                            update: {
                                likeCount: comment.likesCount || 0,
                            }
                        });
                        syncedCommentsCount++;

                        if (!isCandidate) {
                            const sentiment = analyzeSentiment(commentText);
                            const sentimentWeight = getSentimentWeight(sentiment);
                            
                            // Heurística de Influência: curtidas no comentário como multiplicador logarítmico
                            // Se o comentário tem 0 curtidas, multiplicador é 1. Se tem 100, multiplicador é ~3.
                            const influenceMultiplier = 1 + Math.log10((comment.likesCount || 0) + 1);
                            const engagementValue = Math.round(1 * sentimentWeight * influenceMultiplier);

                            console.log(`[SYNC] Comment Analysis (@${authorUsername}): Sentimento: ${sentiment.toFixed(1)}, Peso: ${sentimentWeight.toFixed(1)}, Influência: ${influenceMultiplier.toFixed(1)}, Score Final: +${engagementValue}`);

                            await prisma.userInteraction.upsert({
                                where: {
                                    username_candidateId: {
                                        username: authorUsername,
                                        candidateId: user.candidateProfile.id
                                    }
                                },
                                create: {
                                    username: authorUsername,
                                    metaUserId: authorMetaId,
                                    candidateId: user.candidateProfile.id,
                                    interactionScore: engagementValue,
                                    sentiment: sentiment, // Salvando o sentimento para análise futura
                                    lastInteractedAt: new Date(commentTimestamp)
                                },
                                update: {
                                    interactionScore: { increment: engagementValue },
                                    sentiment: sentiment,
                                    lastInteractedAt: new Date(commentTimestamp)
                                }
                            });
                        }
                    } catch (commentError: any) {
                        console.error(`[SYNC] Falha ao processar comentário de ${authorUsername}:`, commentError.message);
                        // Continuamos o loop para não quebrar o sync inteiro por causa de um comentário
                    }
                }
            }
        }

        // -------------------------------------------------------------

        if (recentPosts.length > 0) {
            const upToDateProfile = await prisma.socialProfile.findUnique({ where: { id: instagramProfile.id } });
            const currentFollowers = upToDateProfile?.followers && upToDateProfile.followers > 0 ? upToDateProfile.followers : 1;
            const avgInteractions = (totalLikesAggregator + totalCommentsAggregator) / recentPosts.length;
            const engagementRatePercent = (avgInteractions / currentFollowers) * 100;

            await prisma.socialProfile.update({
                where: { id: instagramProfile.id },
                data: {
                    engagement: engagementRatePercent,
                    avgLikes: totalLikesAggregator / recentPosts.length
                }
            });
        }

        // Snapshot pós-sync
        const profileAfter = await prisma.socialProfile.findUnique({ where: { id: instagramProfile.id } });
        const followersAfter = profileAfter?.followers ?? followersBefore;
        const likesAfter = (await prisma.mediaPost.aggregate({
            where: { socialProfileId: instagramProfile.id },
            _sum: { likesCount: true }
        }))._sum.likesCount ?? 0;
        const commentsAfter = (await prisma.mediaPost.aggregate({
            where: { socialProfileId: instagramProfile.id },
            _sum: { commentsCount: true }
        }))._sum.commentsCount ?? 0;

        return NextResponse.json({
            success: true,
            message: 'Processamento Apify concluído com sucesso.',
            stats: {
                syncedPosts: syncedPostsCount,
                newPosts: newPostsCount,
                updatedPosts: updatedPostsCount,
                newPostIds,
                syncedComments: syncedCommentsCount,
                followersChange: followersAfter - followersBefore,
                likesChange: likesAfter - likesBefore,
                commentsChange: commentsAfter - commentsBefore,
            }
        });

    } catch (error: any) {
        console.error('--- SYNC PROCESS ERROR ---');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        if (error.code) console.error('Prisma Error Code:', error.code);
        return NextResponse.json({ 
            error: 'Erro ao processar dataset.', 
            details: error.message,
            code: error.code 
        }, { status: 500 });
    }
}

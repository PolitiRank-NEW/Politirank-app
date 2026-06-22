import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { apifyService } from '@/services/apifyService';
import { SocialPlatform, Prisma } from '@prisma/client';
import { analyzeSentiment, getSentimentWeight } from '@/services/sentimentUtils';
import {
    APIFY_IG_POSTS_FOR_COMMENTS,
    APIFY_IG_COMMENTS_PER_POST,
} from '@/lib/apify-limits';
import { buildRankingFromDb } from '@/lib/engager-ranking';
import { resolveInstagramAnalyticsContext } from '@/lib/instagram-analytics-context';
import { resolveInstagramProfileFromCache, shouldSkipApifyCommentFetch } from '@/lib/tracked-cache';
import { buildLastIncremental, urlsForIncrementalComments, type SyncMode } from '@/lib/incremental-sync';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { runId, viewAsUserId, datasetId, ranking, meta, socialProfileId, igHandle, syncMode } = body;

        if (!datasetId) {
            return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;

        const ctx = await resolveInstagramAnalyticsContext(session.user, {
            viewAsUserId,
            socialProfileId,
            igHandle,
        });

        if (!ctx) {
            console.error('[SYNC] Candidato não encontrado para viewAs:', viewAsUserId || session.user.email);
            return NextResponse.json({ error: 'Perfil de candidato não encontrado.' }, { status: 404 });
        }

        const instagramProfile = ctx.socialProfile;
        const user = ctx.user;
        const candidateId = ctx.candidateProfile.id;

        console.log(`[SYNC] Processando dados para @${apifyService.cleanHandle(instagramProfile.handle)}...`);

        const cleanHandle = apifyService.cleanHandle(instagramProfile.handle);

        // Fetch scraped data
        const scrapedData = await apifyService.fetchRunItems(datasetId);

        // O scraper de posts nem sempre retorna seguidores — cache DB antes do Apify
        let profileFollowers = scrapedData.profile?.followers ?? null;
        let profilePostsCount = scrapedData.profile?.postsCount ?? null;

        if (!profileFollowers || profileFollowers <= 0) {
            const candidateRow = await prisma.candidateProfile.findUnique({
                where: { id: candidateId },
                select: { instagramFollowers: true },
            });
            const cached = resolveInstagramProfileFromCache(
                instagramProfile,
                candidateRow ?? undefined
            );
            if (cached?.followers) {
                profileFollowers = cached.followers;
                profilePostsCount = cached.postsCount ?? profilePostsCount;
                console.log(
                    `[SYNC] Seguidores do cache DB: ${profileFollowers} — pulando getProfileInfo.`
                );
            }
        }

        if (!profileFollowers || profileFollowers <= 0) {
            console.log(
                `[SYNC] Seguidores ausentes no dataset e no cache — buscando via getProfileInfo(@${cleanHandle})...`
            );
            const profileInfo = await apifyService.getProfileInfo(cleanHandle);
            if (profileInfo?.followers) {
                profileFollowers = profileInfo.followers;
                profilePostsCount = profileInfo.postsCount ?? profilePostsCount;
                console.log(`[SYNC] Seguidores obtidos via Apify: ${profileFollowers}`);
            }
        }

        // Update profile followers / posts (+ corrige handle se estiver como URL)
        const profileUpdate: Record<string, unknown> = {};
        if (cleanHandle && cleanHandle !== instagramProfile.handle) {
            profileUpdate.handle = cleanHandle;
        }
        if (profileFollowers || profilePostsCount) {
            profileUpdate.followers = profileFollowers ?? instagramProfile.followers;
            profileUpdate.postsCount = profilePostsCount ?? instagramProfile.postsCount;
        } else if (scrapedData.profile) {
            profileUpdate.followers = scrapedData.profile.followers || instagramProfile.followers;
            profileUpdate.postsCount = scrapedData.profile.postsCount || instagramProfile.postsCount;
        }
        if (Object.keys(profileUpdate).length > 0) {
            await prisma.socialProfile.update({
                where: { id: instagramProfile.id },
                data: profileUpdate,
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

                    const isCandidate = authorUsername === cleanHandle || authorUsername === instagramProfile.handle;

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
                                        candidateId: candidateId
                                    }
                                },
                                create: {
                                    username: authorUsername,
                                    metaUserId: authorMetaId,
                                    candidateId: candidateId,
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

        // Se o post-scraper não trouxe comentários, busca via Apify — exceto com ranking em cache recente
        const commentCache = shouldSkipApifyCommentFetch(instagramProfile.rawApiData, {
            hasNewPosts: newPostsCount > 0,
        });

        if (syncedCommentsCount === 0 && recentPosts.length > 0 && !commentCache.skip) {
            const postRows = recentPosts.map((p: { permalink?: string; id?: string }) => ({
                id: String(p.id || ''),
                url: p.permalink,
            }));

            const incrementalUrls =
                newPostsCount > 0
                    ? urlsForIncrementalComments(postRows, newPostIds, APIFY_IG_POSTS_FOR_COMMENTS)
                    : [];

            const topUrls = (
                incrementalUrls.length > 0
                    ? incrementalUrls
                    : (recentPosts
                          .map((p: { permalink?: string }) => p.permalink)
                          .filter(Boolean)
                          .slice(0, APIFY_IG_POSTS_FOR_COMMENTS) as string[])
            ).filter(Boolean);

            if (topUrls.length > 0) {
                console.log(
                    `[SYNC] Sem comentários no dataset — buscando via instagram-scraper (${topUrls.length} post${newPostsCount > 0 ? '(s) novos' : ''})...`
                );
                const fetched = await apifyService.fetchInstagramComments(
                    topUrls,
                    APIFY_IG_COMMENTS_PER_POST
                );

                for (const raw of fetched as Record<string, unknown>[]) {
                    const username = String(
                        raw.ownerUsername ||
                            (raw.owner as Record<string, unknown> | undefined)?.username ||
                            raw.username ||
                            ''
                    )
                        .trim()
                        .replace(/^@/, '');
                    if (!username || username.toLowerCase() === cleanHandle.toLowerCase()) continue;

                    const postUrl = String(raw.postUrl || raw.inputUrl || raw.url || '');
                    const shortCode = postUrl.match(/\/p\/([^/]+)/)?.[1];
                    if (!shortCode) continue;

                    const mediaPost = await prisma.mediaPost.findFirst({
                        where: {
                            socialProfileId: instagramProfile.id,
                            permalink: { contains: shortCode },
                        },
                    });
                    if (!mediaPost) continue;

                    const commentId = String(raw.id || `ig-${username}-${mediaPost.id}-${syncedCommentsCount}`);
                    const commentText = String(raw.text || raw.message || '');
                    const likes = Number(raw.likesCount ?? raw.likes ?? 0) || 0;
                    const commentTimestamp = String(
                        raw.timestamp || raw.createdAt || new Date().toISOString()
                    );

                    try {
                        await prisma.comment.upsert({
                            where: { metaCommentId: commentId },
                            create: {
                                mediaPostId: mediaPost.id,
                                metaCommentId: commentId,
                                text: commentText,
                                likeCount: likes,
                                authorUsername: username,
                                authorMetaId: String(raw.ownerId || '') || null,
                                isFromCandidate: false,
                                isHidden: false,
                                createdAt: new Date(commentTimestamp),
                            },
                            update: { likeCount: likes },
                        });
                        syncedCommentsCount++;
                    } catch (commentError: unknown) {
                        const msg = commentError instanceof Error ? commentError.message : 'erro';
                        console.error(`[SYNC] Falha ao salvar comentário de @${username}:`, msg);
                    }
                }
            }
        } else if (commentCache.skip) {
            console.log(
                `[SYNC] Ranking em cache (${commentCache.ranking?.length ?? 0} pessoas, ${commentCache.reason}) — pulando fetchInstagramComments.`
            );
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

        const existingRaw = (instagramProfile.rawApiData || {}) as Record<string, unknown>;
        const existingProfile = (existingRaw.profile || {}) as Record<string, unknown>;
        const existingFullName =
            typeof existingProfile.fullName === 'string' ? existingProfile.fullName : undefined;
        const upToDateForCache = await prisma.socialProfile.findUnique({ where: { id: instagramProfile.id } });

        let finalRanking = Array.isArray(ranking) && ranking.length > 0 ? ranking : [];
        let finalMeta =
            meta && typeof meta === 'object'
                ? (meta as Record<string, unknown>)
                : null;

        if (finalRanking.length === 0) {
            if (commentCache.skip) {
                const fromDb = await buildRankingFromDb(instagramProfile.id, cleanHandle);
                if (fromDb.ranking.length > 0) {
                    finalRanking = fromDb.ranking;
                    if (!finalMeta || !finalMeta.commentsAnalyzed) {
                        finalMeta = {
                            postsAnalyzed: syncedPostsCount || recentPosts.length,
                            commentsAnalyzed: fromDb.commentsAnalyzed || syncedCommentsCount,
                            uniqueEngagers: fromDb.uniqueEngagers,
                        };
                    }
                } else if (commentCache.ranking) {
                    finalRanking = commentCache.ranking;
                    if (!finalMeta && commentCache.meta) {
                        finalMeta = commentCache.meta;
                    }
                }
            } else {
                const fromDb = await buildRankingFromDb(instagramProfile.id, cleanHandle);
                finalRanking = fromDb.ranking;
                if (!finalMeta || !finalMeta.commentsAnalyzed) {
                    finalMeta = {
                        postsAnalyzed: syncedPostsCount || recentPosts.length,
                        commentsAnalyzed: fromDb.commentsAnalyzed || syncedCommentsCount,
                        uniqueEngagers: fromDb.uniqueEngagers,
                    };
                }
            }
        } else if (!finalMeta) {
            finalMeta = {
                postsAnalyzed: recentPosts.length,
                commentsAnalyzed: syncedCommentsCount,
                uniqueEngagers: finalRanking.length,
            };
        }

        await prisma.socialProfile.update({
            where: { id: instagramProfile.id },
            data: {
                rawApiData: {
                    ...existingRaw,
                    profile: {
                        username: cleanHandle,
                        fullName:
                            (scrapedData.profile as { fullName?: string } | undefined)?.fullName ??
                            existingFullName,
                        followers: upToDateForCache?.followers ?? profileFollowers,
                        postsCount: upToDateForCache?.postsCount ?? profilePostsCount,
                    },
                    lastRanking: finalRanking,
                    lastMeta: finalMeta as Prisma.InputJsonValue,
                    lastSyncedAt: new Date().toISOString(),
                    lastIncremental: buildLastIncremental(
                        (syncMode as SyncMode) || (newPostsCount > 0 || updatedPostsCount > 0 ? 'incremental' : 'full'),
                        newPostIds
                    ),
                },
            },
        });

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
                syncMode: syncMode || (newPostsCount > 0 ? 'incremental' : 'full'),
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

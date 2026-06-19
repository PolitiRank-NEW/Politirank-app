import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { SocialPlatform } from '@prisma/client';

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || 'politi_turk_secret_2026';

export async function POST(req: Request) {
    try {
        // Validation: Must be Authenticated via Session OR have valid x-api-key
        let isAuthorized = false;
        
        // Check API Key first
        const apiKey = req.headers.get('x-api-key');
        if (apiKey === SCRAPER_API_KEY) {
            isAuthorized = true;
        } else {
            // Check session
            const session = await auth();
            // @ts-ignore
            const userRole = session?.user?.role;
            if (session && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN')) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Acesso negado. Token inválido ou não autorizado.' }, { status: 403 });
        }

        const body = await req.json();
        const { candidateId, profileUsername, platform, followers, postsCount, posts } = body;

        // Determine the target candidate profile
        let candidateProfile = null;
        
        if (candidateId) {
            candidateProfile = await prisma.candidateProfile.findUnique({
                where: { id: candidateId },
                include: { socialProfiles: true }
            });
        } else if (profileUsername) {
            // If they only send the handle, find by handle in social profiles
            const socProfile = await prisma.socialProfile.findFirst({
                where: { 
                    handle: { equals: profileUsername, mode: 'insensitive' },
                    platform: platform ? (platform as SocialPlatform) : 'INSTAGRAM'
                },
                include: { candidate: { include: { socialProfiles: true } } }
            });
            if (socProfile) {
                candidateProfile = socProfile.candidate;
            }
        }

        if (!candidateProfile) {
            return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 });
        }

        const platformEnum = platform ? (platform.toUpperCase() as SocialPlatform) : 'INSTAGRAM';

        // Find or create social profile
        let socialProfile = candidateProfile.socialProfiles.find(p => p.platform === platformEnum);

        if (!socialProfile) {
            socialProfile = await prisma.socialProfile.create({
                data: {
                    candidateId: candidateProfile.id,
                    platform: platformEnum,
                    handle: profileUsername || `Manual_${platformEnum}`,
                    followers: followers !== undefined ? Number(followers) : 0,
                    postsCount: postsCount !== undefined ? Number(postsCount) : 0,
                    isManual: true
                }
            });
        } else {
            // Update basic metrics if provided
            await prisma.socialProfile.update({
                where: { id: socialProfile.id },
                data: {
                    followers: followers !== undefined ? Number(followers) : socialProfile.followers,
                    postsCount: postsCount !== undefined ? Number(postsCount) : socialProfile.postsCount,
                    isManual: true,
                    lastUpdate: new Date()
                }
            });
        }

        // Processing Posts Array
        if (posts && Array.isArray(posts) && posts.length > 0) {
            for (const post of posts) {
                // Ensure a unique metaMediaId exists (e.g. shortcode from scraper)
                if (!post.mediaId && !post.metaMediaId && !post.permalink) continue; 
                
                const metaMediaId = post.metaMediaId || post.mediaId || `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                const mediaPost = await prisma.mediaPost.upsert({
                    where: { metaMediaId: metaMediaId },
                    update: {
                        caption: post.caption || undefined,
                        mediaType: post.mediaType || undefined,
                        mediaUrl: post.mediaUrl || undefined,
                        permalink: post.permalink || undefined,
                        likesCount: post.likesCount !== undefined ? Number(post.likesCount) : undefined,
                        commentsCount: post.commentsCount !== undefined ? Number(post.commentsCount) : undefined,
                        lastSyncedAt: new Date()
                    },
                    create: {
                        socialProfileId: socialProfile.id,
                        metaMediaId: metaMediaId,
                        caption: post.caption || '',
                        mediaType: post.mediaType || 'IMAGE',
                        mediaUrl: post.mediaUrl || '',
                        permalink: post.permalink || '',
                        likesCount: post.likesCount !== undefined ? Number(post.likesCount) : 0,
                        commentsCount: post.commentsCount !== undefined ? Number(post.commentsCount) : 0,
                        postedAt: post.postedAt ? new Date(post.postedAt) : new Date(),
                    }
                });

                // Processing Comments Array
                if (post.comments && Array.isArray(post.comments)) {
                    for (const comment of post.comments) {
                        const metaCommentId = comment.metaCommentId || comment.commentId || `man_cmt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        const authorUsername = comment.authorUsername || comment.username || 'unknown_user';
                        
                        await prisma.comment.upsert({
                            where: { metaCommentId: metaCommentId },
                            update: {
                                text: comment.text,
                                likeCount: comment.likeCount !== undefined ? Number(comment.likeCount) : undefined,
                            },
                            create: {
                                mediaPostId: mediaPost.id,
                                metaCommentId: metaCommentId,
                                text: comment.text || '',
                                authorUsername: authorUsername,
                                likeCount: comment.likeCount !== undefined ? Number(comment.likeCount) : 0,
                                createdAt: comment.createdAt ? new Date(comment.createdAt) : new Date(),
                            }
                        });

                        // Calculate User Interaction
                        // We give +3 score for a comment imported this way
                        if (authorUsername && authorUsername !== 'unknown_user') {
                            const interactionScore = 3;
                            await prisma.userInteraction.upsert({
                                where: { 
                                    username_candidateId: {
                                        username: authorUsername,
                                        candidateId: candidateProfile.id
                                    }
                                },
                                update: {
                                    interactionScore: {
                                        increment: interactionScore
                                    },
                                    lastInteractedAt: new Date()
                                },
                                create: {
                                    username: authorUsername,
                                    candidateId: candidateProfile.id,
                                    interactionScore: interactionScore,
                                    lastInteractedAt: new Date()
                                }
                            });
                        }
                    } // end for comments
                }

                // Interaction for likers (if provided by scraper)
                if (post.likers && Array.isArray(post.likers)) {
                    for (const liker of post.likers) {
                        const likerUsername = typeof liker === 'string' ? liker : (liker.username || liker.handle);
                        if (!likerUsername) continue;

                        await prisma.userInteraction.upsert({
                            where: {
                                username_candidateId: {
                                    username: likerUsername,
                                    candidateId: candidateProfile.id
                                }
                            },
                            update: {
                                interactionScore: {
                                    increment: 1 // +1 for like
                                },
                                lastInteractedAt: new Date()
                            },
                            create: {
                                username: likerUsername,
                                candidateId: candidateProfile.id,
                                interactionScore: 1,
                                lastInteractedAt: new Date()
                            }
                        });
                    }
                }
            } // end for posts

            // Recalculate Engagement of the Social Profile roughly based on the newly inserted posts
            const allPosts = await prisma.mediaPost.findMany({
                where: { socialProfileId: socialProfile.id },
                orderBy: { postedAt: 'desc' },
                take: 30
            });

            if (allPosts.length > 0 && socialProfile.followers > 0) {
                let totalInteractions = 0;
                allPosts.forEach(p => {
                    totalInteractions += (p.likesCount + p.commentsCount);
                });
                const avgInteractions = totalInteractions / allPosts.length;
                const newEngagement = (avgInteractions / socialProfile.followers) * 100;

                await prisma.socialProfile.update({
                    where: { id: socialProfile.id },
                    data: {
                        engagement: Number(newEngagement.toFixed(2))
                    }
                });
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Ingestão profunda de métricas realizada com sucesso.' 
        });

    } catch (error: any) {
        console.error('[Deep Ingestion Error]:', error);
        return NextResponse.json({ error: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}

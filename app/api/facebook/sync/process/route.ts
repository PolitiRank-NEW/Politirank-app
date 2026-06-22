import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { facebookService, parseCount } from '@/services/facebookService';
import { SocialPlatform } from '@prisma/client';
import { sortAndLimitPosts, parsePostTimestamp, normalizePostTimestamp } from '@/lib/apify-limits';
import { resolveFacebookPageInfoFromCache } from '@/lib/tracked-cache';
import { buildLastIncremental, markPostsWithNewFlag, readLastIncremental, type SyncMode } from '@/lib/incremental-sync';

type RawApiData = {
    profile?: Record<string, unknown>;
    lastRanking?: unknown[];
    lastMeta?: Record<string, unknown>;
    lastSyncedAt?: string;
};

function parseFbDate(value: unknown): Date {
    const ms = parsePostTimestamp(value);
    return ms > 0 ? new Date(ms) : new Date();
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { viewAsUserId, datasetId, ranking, meta, syncMode } = body;

        if (!datasetId) {
            return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const isAdminViewing =
            (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!viewAsUserId;

        const user = isAdminViewing
            ? await prisma.user.findUnique({
                  where: { id: viewAsUserId! },
                  include: {
                      candidateProfile: {
                          include: {
                              socialProfiles: { where: { platform: SocialPlatform.FACEBOOK } },
                          },
                      },
                  },
              })
            : await prisma.user.findUnique({
                  where: { email: session.user.email },
                  include: {
                      candidateProfile: {
                          include: {
                              socialProfiles: { where: { platform: SocialPlatform.FACEBOOK } },
                          },
                      },
                  },
              });

        if (!user?.candidateProfile) {
            return NextResponse.json({ error: 'Perfil de candidato não encontrado.' }, { status: 404 });
        }

        const facebookProfile = user.candidateProfile.socialProfiles[0];
        if (!facebookProfile?.handle) {
            return NextResponse.json({ error: 'Página do Facebook não encontrada.' }, { status: 404 });
        }

        const cleanHandle = facebookService.cleanHandle(facebookProfile.handle);
        console.log(`[FB SYNC] Processando dataset ${datasetId} para ${cleanHandle}...`);

        const manualFollowers = user.candidateProfile.facebookFollowers ?? 0;

        const instagramProfile = await prisma.socialProfile.findFirst({
            where: {
                candidateId: user.candidateProfile.id,
                platform: SocialPlatform.INSTAGRAM,
            },
        });
        const instagramFollowers = instagramProfile?.followers ?? 0;

        const rawPosts = await facebookService.fetchDatasetItems(datasetId);
        const firstItem = rawPosts[0] as Record<string, unknown> | undefined;
        if (firstItem?.error && rawPosts.length === 1) {
            return NextResponse.json(
                {
                    error:
                        (firstItem.errorDescription as string) ||
                        'A página pode ser inexistente ou privada.',
                },
                { status: 404 }
            );
        }

        const validPosts = rawPosts.filter(
            (p: Record<string, unknown>) => p && (p.postId || p.url || p.postUrl || p.topLevelUrl)
        );

        const mappedPosts = sortAndLimitPosts(
            validPosts.map((p: Record<string, unknown>) => {
            const url = String(p.url || p.postUrl || p.topLevelUrl || p.facebookUrl || '');
            const isVideo =
                p.hasVideo || p.videoUrl || (Array.isArray(p.media) &&
                    p.media.some((m) => typeof m === 'object' && m !== null && (m as Record<string, unknown>).__typename === 'Video'));
            const isReel = p.isReel || p.reelFlag;
            return {
                id: String(p.postId || url),
                text: String(p.text || p.message || p.caption || ''),
                type: isReel ? 'Reel' : isVideo ? 'Vídeo' : 'Post',
                likes: parseCount(p.likes ?? p.likesCount ?? p.reactionsCount ?? p.reaction_count),
                comments: parseCount(p.comments ?? p.commentsCount ?? p.comment_count),
                shares: parseCount(p.shares ?? p.sharesCount ?? p.share_count),
                timestamp: normalizePostTimestamp(
                    p.time || p.timestamp || p.date || p.postedAt || null
                ),
                url,
                imageUrl: String(
                    (p as { image?: string }).image ||
                        (p as { images?: string[] }).images?.[0] ||
                        (p as { media?: { thumbnail?: string }[] }).media?.[0]?.thumbnail ||
                        ''
                ),
            };
        })
        );

        let profileFollowers = facebookProfile.followers ?? 0;
        let followersSource = 'existing';
        let pageName: string | undefined;

        const cachedPageInfo = resolveFacebookPageInfoFromCache(
            facebookProfile,
            user.candidateProfile,
            instagramFollowers
        );

        if (cachedPageInfo) {
            profileFollowers = cachedPageInfo.followers ?? profileFollowers;
            followersSource = cachedPageInfo.source;
            pageName = cachedPageInfo.name ?? undefined;
            console.log(
                `[FB SYNC] Seguidores do cache (${followersSource}): ${profileFollowers} — pulando Apify getPageInfo.`
            );
        } else {
            const pageInfo = await facebookService.getPageInfo(cleanHandle, manualFollowers);
            pageName = pageInfo?.name ?? undefined;
            if (pageInfo?.followers && pageInfo.followers > 0) {
                profileFollowers = pageInfo.followers;
                followersSource = 'apify';
            }
        }

        if (profileFollowers <= 0 && manualFollowers > 0) {
            profileFollowers = manualFollowers;
            followersSource = 'manual';
        } else if (profileFollowers <= 0 && instagramFollowers > 0) {
            profileFollowers = instagramFollowers;
            followersSource = 'instagram_estimate';
            console.log(
                `[FB] Seguidores do FB indisponíveis — usando Instagram como estimativa: ${instagramFollowers}`
            );
        }

        const existingRaw = (facebookProfile.rawApiData || {}) as RawApiData;

        const profileUpdate: Record<string, unknown> = {
            followers: profileFollowers,
            postsCount: mappedPosts.length || facebookProfile.postsCount,
            handle: cleanHandle,
            rawApiData: {
                ...existingRaw,
                profile: {
                    username: cleanHandle,
                    name: pageName || existingRaw.profile?.name || user.name,
                    followers: profileFollowers,
                    followersSource,
                    postsCount: mappedPosts.length,
                },
                ...(Array.isArray(ranking) ? { lastRanking: ranking } : {}),
                ...(meta && typeof meta === 'object' ? { lastMeta: meta } : {}),
                lastSyncedAt: new Date().toISOString(),
            },
        };

        if (profileFollowers > 0 && followersSource !== 'existing') {
            await prisma.candidateProfile.update({
                where: { id: user.candidateProfile.id },
                data: { facebookFollowers: profileFollowers },
            });
        }

        await prisma.socialProfile.update({
            where: { id: facebookProfile.id },
            data: profileUpdate,
        });

        const followersBefore = facebookProfile.followers ?? 0;
        const likesBefore =
            (
                await prisma.mediaPost.aggregate({
                    where: { socialProfileId: facebookProfile.id },
                    _sum: { likesCount: true },
                })
            )._sum.likesCount ?? 0;
        const commentsBefore =
            (
                await prisma.mediaPost.aggregate({
                    where: { socialProfileId: facebookProfile.id },
                    _sum: { commentsCount: true },
                })
            )._sum.commentsCount ?? 0;

        let syncedPostsCount = 0;
        let newPostsCount = 0;
        let updatedPostsCount = 0;
        const newPostIds: string[] = [];
        let totalLikes = 0;
        let totalComments = 0;

        for (const post of mappedPosts) {
            if (!post.id || post.id === 'undefined') continue;

            totalLikes += post.likes;
            totalComments += post.comments;

            const existing = await prisma.mediaPost.findUnique({ where: { metaMediaId: post.id } });
            const isNew = !existing;

            await prisma.mediaPost.upsert({
                where: { metaMediaId: post.id },
                create: {
                    socialProfileId: facebookProfile.id,
                    metaMediaId: post.id,
                    caption: post.text,
                    mediaType: post.type,
                    mediaUrl: post.imageUrl || null,
                    permalink: post.url || null,
                    likesCount: post.likes,
                    commentsCount: post.comments,
                    shares: post.shares,
                    postedAt: parseFbDate(post.timestamp),
                },
                update: {
                    socialProfileId: facebookProfile.id,
                    caption: post.text,
                    likesCount: post.likes,
                    commentsCount: post.comments,
                    shares: post.shares,
                    lastSyncedAt: new Date(),
                },
            });

            syncedPostsCount++;
            if (isNew) {
                newPostsCount++;
                newPostIds.push(post.id);
            } else {
                updatedPostsCount++;
            }
        }

        if (mappedPosts.length > 0 && profileFollowers > 0) {
            const avgInteractions =
                mappedPosts.reduce((acc, p) => acc + p.likes + p.comments + p.shares, 0) /
                mappedPosts.length;
            const engagementRate = (avgInteractions / profileFollowers) * 100;
            await prisma.socialProfile.update({
                where: { id: facebookProfile.id },
                data: {
                    engagement: engagementRate,
                    avgLikes: totalLikes / mappedPosts.length,
                },
            });
        }

        const profileAfter = await prisma.socialProfile.findUnique({
            where: { id: facebookProfile.id },
        });
        const followersAfter = profileAfter?.followers ?? followersBefore;
        const likesAfter =
            (
                await prisma.mediaPost.aggregate({
                    where: { socialProfileId: facebookProfile.id },
                    _sum: { likesCount: true },
                })
            )._sum.likesCount ?? 0;
        const commentsAfter =
            (
                await prisma.mediaPost.aggregate({
                    where: { socialProfileId: facebookProfile.id },
                    _sum: { commentsCount: true },
                })
            )._sum.commentsCount ?? 0;

        const profileForIncremental = await prisma.socialProfile.findUnique({
            where: { id: facebookProfile.id },
            select: { rawApiData: true },
        });
        const rawAfter = (profileForIncremental?.rawApiData || {}) as Record<string, unknown>;
        const resolvedSyncMode: SyncMode =
            syncMode === 'incremental' || syncMode === 'full'
                ? syncMode
                : newPostsCount > 0 || updatedPostsCount > 0
                  ? 'incremental'
                  : 'full';

        await prisma.socialProfile.update({
            where: { id: facebookProfile.id },
            data: {
                rawApiData: {
                    ...rawAfter,
                    lastIncremental: buildLastIncremental(resolvedSyncMode, newPostIds),
                },
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Sincronização do Facebook concluída.',
            stats: {
                syncedPosts: syncedPostsCount,
                newPosts: newPostsCount,
                updatedPosts: updatedPostsCount,
                newPostIds,
                syncedComments: 0,
                followersChange: followersAfter - followersBefore,
                likesChange: likesAfter - likesBefore,
                commentsChange: commentsAfter - commentsBefore,
                syncMode: resolvedSyncMode,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('[FB SYNC Process] Erro:', error);
        return NextResponse.json(
            { error: 'Erro ao processar dataset.', details: message },
            { status: 500 }
        );
    }
}

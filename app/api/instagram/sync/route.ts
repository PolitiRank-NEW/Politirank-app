import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { metaService } from '@/services/metaService';
import { apifyService } from '@/services/apifyService';
import { SocialPlatform } from '@prisma/client';
import { APIFY_POSTS_LIMIT } from '@/lib/apify-limits';
import { resolveInstagramAnalyticsContext } from '@/lib/instagram-analytics-context';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const { searchParams } = new URL(request.url);
        const ctx = await resolveInstagramAnalyticsContext(session.user, {
            viewAsUserId: searchParams.get('viewAs'),
            socialProfileId: searchParams.get('socialProfileId'),
            igHandle: searchParams.get('igHandle'),
        });

        if (!ctx) {
            return NextResponse.json({ error: 'Perfil de candidato não encontrado.' }, { status: 404 });
        }

        const instagramProfile = ctx.socialProfile;
        const user = ctx.user;

        if (!instagramProfile || (!instagramProfile.accessToken && !instagramProfile.handle)) {
            return NextResponse.json({ error: 'Perfil do Instagram ou Handle não encontrado. Conecte novamente.' }, { status: 404 });
        }

        const useApify = !instagramProfile.accessToken || !instagramProfile.instagramBusinessId || instagramProfile.isManual;
        
        let profileInfo: any = null;
        let recentPosts: any[] = [];
        
        if (useApify) {
            console.log(`Usando Apify Scraper p/ handle @${instagramProfile.handle}...`);
            try {
                const runId = await apifyService.startScrapeRun(instagramProfile.handle, {
                    resultsLimit: APIFY_POSTS_LIMIT,
                });
                // Return immediately so the frontend can poll the status!
                return NextResponse.json({
                    useApify: true,
                    status: 'RUNNING',
                    runId: runId
                });
            } catch (e: any) {
                console.error("Falha ao iniciar scraping via Apify:", e);
                return NextResponse.json({ error: 'Erro ao iniciar scraping do Apify: ' + e.message }, { status: 500 });
            }
        } else {
            // 1.5 Fetch latest Profile Info to update followers and posts metrics via Official API
            try {
                profileInfo = await metaService.getInstagramProfile(instagramProfile.instagramBusinessId!, instagramProfile.accessToken!);
                if (profileInfo) {
                    await prisma.socialProfile.update({
                        where: { id: instagramProfile.id },
                        data: {
                            followers: profileInfo.followers_count ?? instagramProfile.followers,
                            postsCount: profileInfo.media_count ?? instagramProfile.postsCount,
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to sync profile info (followers data):', e);
            }

            // 2. Fetch Recent Media (Posts) via Official API
            const mediaData = await metaService.getRecentMedia(instagramProfile.instagramBusinessId!, instagramProfile.accessToken!, 15);
            if (!mediaData || !mediaData.data) {
                return NextResponse.json({ error: 'Falha ao buscar postagens do Instagram (API Oficial).' }, { status: 500 });
            }
            recentPosts = mediaData.data;
        }

        let syncedPostsCount = 0;
        let newPostsCount = 0;
        let updatedPostsCount = 0;
        let syncedCommentsCount = 0;
        let totalLikesAggregator = 0;
        let totalCommentsAggregator = 0;
        const newPostIds: string[] = [];

        // Snapshot de seguidores antes do sync para calcular diff
        const profileBefore = await prisma.socialProfile.findUnique({ where: { id: instagramProfile.id } });
        const followersBefore = profileBefore?.followers ?? 0;
        const likesBefore = (await prisma.mediaPost.aggregate({
            where: { socialProfileId: instagramProfile.id },
            _sum: { likesCount: true }
        }))._sum.likesCount ?? 0;
        const commentsBefore = (await prisma.mediaPost.aggregate({
            where: { socialProfileId: instagramProfile.id },
            _sum: { commentsCount: true }
        }))._sum.commentsCount ?? 0;

        // 3. Process each Post — incremental: detecta posts novos vs atualizados
        for (const post of recentPosts) {
            totalLikesAggregator += post.like_count || 0;
            totalCommentsAggregator += post.comments_count || 0;

            const existing = await prisma.mediaPost.findUnique({ where: { metaMediaId: post.id } });
            const isNew = !existing;

            await prisma.mediaPost.upsert({
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
                    postedAt: new Date(post.timestamp),
                },
                update: {
                    socialProfileId: instagramProfile.id,
                    likesCount: post.like_count || 0,
                    commentsCount: post.comments_count || 0,
                    lastSyncedAt: new Date(),
                }
            });

            if (isNew) {
                newPostsCount++;
                newPostIds.push(post.id);
            } else {
                updatedPostsCount++;
            }
            syncedPostsCount++;
        }

        // Snapshot pós-sync para calcular diffs
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
            useApify: false,
            message: 'Sincronização de Deep Analytics concluída.',
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
        console.error('API Error during Deep Analytics Sync:', error);
        return NextResponse.json({ error: 'Erro interno ao sincronizar dados.', details: error.message }, { status: 500 });
    }
}

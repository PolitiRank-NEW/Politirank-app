import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { metaService } from '@/services/metaService';
import { apifyService } from '@/services/apifyService';
import { SocialPlatform } from '@prisma/client';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const { searchParams } = new URL(request.url);
        const viewAsUserId = searchParams.get('viewAs');

        const isAdminViewing = (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!viewAsUserId;

        // 1. Get User's Social Profile for Instagram
        const user = isAdminViewing 
            ? await prisma.user.findUnique({
                where: { id: viewAsUserId! },
                include: {
                    candidateProfile: {
                        include: {
                            socialProfiles: {
                                where: { platform: SocialPlatform.INSTAGRAM }
                            }
                        }
                    }
                },
            })
            : await prisma.user.findUnique({
                where: { email: session.user.email },
            include: {
                candidateProfile: {
                    include: {
                        socialProfiles: {
                            where: { platform: SocialPlatform.INSTAGRAM }
                        }
                    }
                }
            },
        });

        if (!user || !user.candidateProfile) {
            return NextResponse.json({ error: 'Perfil de candidato não encontrado.' }, { status: 404 });
        }

        const instagramProfile = user.candidateProfile.socialProfiles[0];

        if (!instagramProfile || (!instagramProfile.accessToken && !instagramProfile.handle)) {
            return NextResponse.json({ error: 'Perfil do Instagram ou Handle não encontrado. Conecte novamente.' }, { status: 404 });
        }

        const useApify = !instagramProfile.accessToken || !instagramProfile.instagramBusinessId || instagramProfile.isManual;
        
        let profileInfo: any = null;
        let recentPosts: any[] = [];
        
        if (useApify) {
            console.log(`Usando Apify Scraper p/ handle @${instagramProfile.handle}...`);
            try {
                // Sincronização inteligente: buscar menos posts se já temos dados recentes
                const dbPosts = await prisma.mediaPost.findMany({
                    where: { socialProfileId: instagramProfile.id },
                    orderBy: { postedAt: 'desc' },
                    take: 1
                });
                
                let limit = 15; // default inicial
                let oldestPostDate: string | undefined = undefined;
                
                if (dbPosts.length > 0) {
                    // Busca a data do último post sincronizado
                    const lastSync = dbPosts[0].postedAt || new Date();
                    
                    // Subtraímos 3 dias da data do último post para pegar atualizações recentes (likes/comments tardios)
                    const bufferDate = new Date(lastSync);
                    bufferDate.setDate(bufferDate.getDate() - 3);
                    oldestPostDate = bufferDate.toISOString();
                    
                    limit = 20; // Permite um limite maior já que estamos restringindo por data
                }

                const runId = await apifyService.startScrapeRun(instagramProfile.handle, { resultsLimit: limit, oldestPostDate });
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

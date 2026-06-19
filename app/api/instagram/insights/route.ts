import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { metaService } from '@/services/metaService';
import { SocialPlatform } from '@prisma/client';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const { searchParams } = new URL(request.url);
        const viewAsUserId = searchParams.get('viewAs');

        // Admin/SuperAdmin pode buscar dados de qualquer usuário via viewAs
        let targetId = viewAsUserId;
        if ((callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !viewAsUserId) {
             const firstCandidate = await prisma.user.findFirst({ 
                 where: { 
                     role: 'CANDIDATO',
                     candidateProfile: {
                         socialProfiles: {
                             some: { platform: 'INSTAGRAM' }
                         }
                     }
                 },
                 orderBy: { createdAt: 'desc' }
             });
             if (firstCandidate) {
                  targetId = firstCandidate.id;
             }
        }
        const isAdminViewing = (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!targetId;

        // 1. Get User's Social Profile for Instagram
        // Se admin está visualizando outro perfil, busca por userId. Senão, busca pelo e-mail do admin.
        const user = isAdminViewing
            ? await prisma.user.findUnique({
                where: { id: targetId! },
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

        if (!instagramProfile) {
            return NextResponse.json({ error: 'Link do Instagram não encontrado ou expirado. Conecte novamente.' }, { status: 404 });
        }

        // Require Token/BusinessId ONLY IF it's not a manual profile and we don't want to sync via scraper.
        // Since we are migrating to Scraper/Apify, any profile that has a `handle` should be supported!
        if (!instagramProfile.handle) {
            return NextResponse.json({ error: 'Handle do Instagram não encontrado.' }, { status: 404 });
        }

        // 2. Tentar recuperar dados cacheados do DB
        let profileData: any = {};
        let insightsData: any = {};
        let audienceData: any = {};

        if (instagramProfile.rawApiData) {
            const rawData = instagramProfile.rawApiData as any;
            profileData = rawData.profile || {};
            insightsData = rawData.insights || {};
            audienceData = rawData.audience || {};
        }

        const followers = instagramProfile.followers || profileData?.followers_count || 0;
        const following = instagramProfile.following || profileData?.follows_count || 0;

        const biography = profileData?.biography || user.candidateProfile.bio || '';
        const profilePictureUrl = profileData?.profile_picture_url || '';

        // Extract Insights
        let reach = 0; let impressions = 0; let profileViews = 0;
        if (insightsData && insightsData.data) {
            reach = insightsData.data.find((m: any) => m.name === 'reach')?.values[0]?.value || 0;
            impressions = insightsData.data.find((m: any) => m.name === 'impressions')?.values[0]?.value || 0;
            profileViews = insightsData.data.find((m: any) => m.name === 'profile_views')?.values[0]?.value || 0;
        }

        // 3. Post Aggregate from DB (This is the fix: use DB posts synced by the "Sincronizar" button)
        const dbPosts = await prisma.mediaPost.findMany({
            where: { socialProfileId: instagramProfile.id },
            orderBy: { postedAt: 'desc' },
            take: 15
        });

        // Se o número de postsCount estiver zerado no DB e rawApiData, usa o fallback dos dbPosts baixados
        let postsCount = instagramProfile.postsCount || profileData?.media_count || 0;
        if (postsCount === 0) postsCount = dbPosts.length;

        const recentPosts = dbPosts.map(p => ({
            id: p.metaMediaId,
            caption: p.caption,
            media_type: p.mediaType === 'CAROUSEL_ALBUM' ? 'CAROUSEL_ALBUM' : p.mediaType,
            media_url: p.mediaUrl,
            permalink: p.permalink,
            like_count: p.likesCount,
            comments_count: p.commentsCount,
            timestamp: p.postedAt.toISOString()
        }));

        let totalLikes = 0; let totalComments = 0;
        
        if (recentPosts.length > 0) {
            recentPosts.forEach((post) => {
                totalLikes += post.like_count || 0;
                totalComments += post.comments_count || 0;
            });
        } else if (instagramProfile.isManual && instagramProfile.rawApiData) {
            // Fallback for Manual Data
            const rawData = instagramProfile.rawApiData as any;
            totalLikes = rawData.manualLikes || 0;
            totalComments = rawData.manualComments || 0;
        }

        // Calcula o engajamento real ((Média de Interações por Post) / Seguidores) * 100
        let calculatedEngagementRate = instagramProfile.engagement || 0;
        if (followers > 0 && recentPosts.length > 0) {
            const avgInteractionsPerPost = (totalLikes + totalComments) / recentPosts.length;
            calculatedEngagementRate = (avgInteractionsPerPost / followers) * 100;
        } else if (followers > 0 && Number(instagramProfile.engagement) === 0 && (totalLikes > 0 || totalComments > 0)) {
            // Manual fallback engagement
            const avgInteractionsPerPost = (totalLikes + totalComments) / (postsCount > 0 ? postsCount : 1);
            calculatedEngagementRate = (avgInteractionsPerPost / followers) * 100;
        }

        // 5. Lideranças / SuperFans do Banco Real (alimentados via /api/instagram/sync)
        const topInteractors = await prisma.userInteraction.findMany({
            where: { candidateId: user.candidateProfile.id },
            orderBy: { interactionScore: 'desc' },
            take: 10,
            select: { username: true, interactionScore: true, lastInteractedAt: true }
        });

        // Se não tivermos posts no DB, significa que needsSync é true.
        const needsSync = dbPosts.length === 0;
        const lastSyncedAt = dbPosts.length > 0 ? dbPosts[0].lastSyncedAt?.toISOString() : null;

        return NextResponse.json({
            needsSync,
            profile: {
                username: profileData?.username || instagramProfile.handle,
                name: profileData?.name || user.name,
                biography: biography,
                profile_picture_url: profilePictureUrl,
                followers,
                following,
                postsCount,
                lastSyncedAt
            },
            insights: { reach, impressions, profileViews },
            engagement: {
                totalLikes,
                totalComments,
                avgLikes: recentPosts.length > 0 ? totalLikes / recentPosts.length : 0,
                engagementRate: calculatedEngagementRate
            },
            media: recentPosts,
            audience: {
                city: audienceData?.data?.find((m: any) => m.name === 'audience_city')?.values[0]?.value || {},
                country: audienceData?.data?.find((m: any) => m.name === 'audience_country')?.values[0]?.value || {},
                gender_age: audienceData?.data?.find((m: any) => m.name === 'audience_gender_age')?.values[0]?.value || {},
            },
            history: [],
            superFans: topInteractors
        }, { status: 200 });

    } catch (error: any) {
        console.error('API Error fetching Instagram Insights:', error);
        return NextResponse.json({ error: 'Erro ao buscar dados do Instagram.', details: error.message }, { status: 500 });
    }
}

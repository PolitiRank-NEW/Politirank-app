import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const { searchParams } = new URL(request.url);
        const viewAsUserId = searchParams.get('viewAs');

        let targetId = viewAsUserId;
        if ((callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !viewAsUserId) {
            const firstCandidate = await prisma.user.findFirst({
                where: {
                    role: 'CANDIDATO',
                    candidateProfile: {
                        socialProfiles: { some: { platform: 'FACEBOOK' } },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            if (firstCandidate) targetId = firstCandidate.id;
        }

        const isAdminViewing = (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!targetId;

        const user = isAdminViewing
            ? await prisma.user.findUnique({
                  where: { id: targetId! },
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
        if (!facebookProfile) {
            return NextResponse.json({ error: 'Página do Facebook não vinculada.' }, { status: 404 });
        }
        if (!facebookProfile.handle) {
            return NextResponse.json({ error: 'Handle do Facebook não encontrado.' }, { status: 404 });
        }

        let profileData: Record<string, unknown> = {};
        if (facebookProfile.rawApiData) {
            profileData = (facebookProfile.rawApiData as { profile?: Record<string, unknown> }).profile || {};
        }

        const biography = (profileData.biography as string) || user.candidateProfile.bio || '';

        const manualFollowers = user.candidateProfile.facebookFollowers ?? 0;
        const instagramProfile = await prisma.socialProfile.findFirst({
            where: {
                candidateId: user.candidateProfile.id,
                platform: SocialPlatform.INSTAGRAM,
            },
        });

        let followers =
            facebookProfile.followers ||
            (profileData.followers as number) ||
            manualFollowers ||
            instagramProfile?.followers ||
            0;

        const followersSource = (profileData.followersSource as string) || null;

        const dbPosts = await prisma.mediaPost.findMany({
            where: { socialProfileId: facebookProfile.id },
            orderBy: { postedAt: 'desc' },
            take: 15,
        });

        let postsCount = facebookProfile.postsCount || (profileData.postsCount as number) || 0;
        if (postsCount === 0) postsCount = dbPosts.length;

        const recentPosts = dbPosts.map((p) => ({
            id: p.metaMediaId,
            caption: p.caption,
            media_type: p.mediaType || 'Post',
            media_url: p.mediaUrl,
            permalink: p.permalink,
            like_count: p.likesCount,
            comments_count: p.commentsCount,
            shares_count: p.shares ?? 0,
            timestamp: p.postedAt.toISOString(),
        }));

        let totalLikes = 0;
        let totalComments = 0;
        let totalShares = 0;
        recentPosts.forEach((post) => {
            totalLikes += post.like_count || 0;
            totalComments += post.comments_count || 0;
            totalShares += post.shares_count || 0;
        });

        let calculatedEngagementRate = facebookProfile.engagement || 0;
        if (followers > 0 && recentPosts.length > 0) {
            const avgInteractions =
                (totalLikes + totalComments + totalShares) / recentPosts.length;
            calculatedEngagementRate = (avgInteractions / followers) * 100;
        }

        const needsSync = dbPosts.length === 0;
        const lastSyncedAt =
            dbPosts.length > 0 ? dbPosts[0].lastSyncedAt?.toISOString() : null;

        return NextResponse.json({
            needsSync,
            profile: {
                username: (profileData.username as string) || facebookProfile.handle,
                name: (profileData.name as string) || user.name,
                biography,
                followers,
                followersSource,
                postsCount,
                lastSyncedAt,
            },
            engagement: {
                totalLikes,
                totalComments,
                totalShares,
                avgLikes: recentPosts.length > 0 ? totalLikes / recentPosts.length : 0,
                engagementRate: calculatedEngagementRate,
            },
            media: recentPosts,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('[FB Insights] Erro:', error);
        return NextResponse.json(
            { error: 'Erro ao buscar dados do Facebook.', details: message },
            { status: 500 }
        );
    }
}

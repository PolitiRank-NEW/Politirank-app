import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { cleanInstagramHandle } from '@/lib/instagram-handle';
import { buildRankingFromDb } from '@/lib/engager-ranking';

type SessionUser = { email?: string | null; role?: string; id?: string };

export type InstagramAnalyticsContext = {
    user: {
        id: string;
        name: string | null;
        email: string | null;
    };
    candidateProfile: { id: string };
    socialProfile: {
        id: string;
        handle: string;
        followers: number;
        following: number;
        postsCount: number;
        engagement: number;
        isManual: boolean;
        rawApiData: unknown;
        accessToken: string | null;
        instagramBusinessId: string | null;
    };
    allInstagramProfiles: Array<{
        id: string;
        handle: string;
        followers: number;
        isManual: boolean;
        lastUpdate: Date;
    }>;
};

export type ResolveInstagramParams = {
    viewAsUserId?: string | null;
    socialProfileId?: string | null;
    igHandle?: string | null;
};

function pickInstagramProfile<T extends { id: string; handle: string }>(
    profiles: T[],
    params: Pick<ResolveInstagramParams, 'socialProfileId' | 'igHandle'>
): T | null {
    if (!profiles.length) return null;

    if (params.socialProfileId) {
        const byId = profiles.find((p) => p.id === params.socialProfileId);
        if (byId) return byId;
    }

    if (params.igHandle) {
        const target = cleanInstagramHandle(params.igHandle).toLowerCase();
        const byHandle = profiles.find(
            (p) => cleanInstagramHandle(p.handle).toLowerCase() === target
        );
        if (byHandle) return byHandle;
    }

    return profiles[0];
}

export async function resolveInstagramAnalyticsContext(
    sessionUser: SessionUser,
    params: ResolveInstagramParams = {}
): Promise<InstagramAnalyticsContext | null> {
    if (!sessionUser.email) return null;

    const callerRole = sessionUser.role;
    const isAdmin = callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN';

    let targetUserId = params.viewAsUserId || null;
    if (isAdmin && !targetUserId) {
        const firstCandidate = await prisma.user.findFirst({
            where: {
                role: 'CANDIDATO',
                candidateProfile: {
                    socialProfiles: { some: { platform: SocialPlatform.INSTAGRAM } },
                },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });
        if (firstCandidate) targetUserId = firstCandidate.id;
    }

    const isAdminViewing = isAdmin && !!targetUserId;

    const user = isAdminViewing
        ? await prisma.user.findUnique({
              where: { id: targetUserId! },
              include: {
                  candidateProfile: {
                      include: {
                          socialProfiles: {
                              where: { platform: SocialPlatform.INSTAGRAM },
                              orderBy: { lastUpdate: 'desc' },
                          },
                      },
                  },
              },
          })
        : await prisma.user.findUnique({
              where: { email: sessionUser.email },
              include: {
                  candidateProfile: {
                      include: {
                          socialProfiles: {
                              where: { platform: SocialPlatform.INSTAGRAM },
                              orderBy: { lastUpdate: 'desc' },
                          },
                      },
                  },
              },
          });

    if (!user?.candidateProfile) return null;

    const profiles = user.candidateProfile.socialProfiles;
    const socialProfile = pickInstagramProfile(profiles, params);
    if (!socialProfile?.handle) return null;

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
        candidateProfile: { id: user.candidateProfile.id },
        socialProfile,
        allInstagramProfiles: profiles.map((p) => ({
            id: p.id,
            handle: p.handle,
            followers: p.followers,
            isManual: p.isManual,
            lastUpdate: p.lastUpdate,
        })),
    };
}

export function buildQuerySuffix(params: {
    viewAsUserId?: string | null;
    socialProfileId?: string | null;
}): string {
    const q = new URLSearchParams();
    if (params.viewAsUserId) q.set('viewAs', params.viewAsUserId);
    if (params.socialProfileId) q.set('socialProfileId', params.socialProfileId);
    const s = q.toString();
    return s ? `?${s}` : '';
}

export async function getSuperFansForProfile(socialProfileId: string, excludeHandle?: string) {
    const comments = await prisma.comment.findMany({
        where: {
            mediaPost: { socialProfileId },
            isFromCandidate: false,
        },
        select: { authorUsername: true, likeCount: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });

    if (comments.length > 0) {
        const map = new Map<string, { interactionScore: number; lastInteractedAt: Date }>();
        for (const c of comments) {
            const username = c.authorUsername?.trim();
            if (!username) continue;
            const key = username.toLowerCase();
            if (excludeHandle && key === cleanInstagramHandle(excludeHandle).toLowerCase()) continue;

            const scoreAdd = 1 + Math.log10((c.likeCount || 0) + 1);
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { interactionScore: scoreAdd, lastInteractedAt: c.createdAt });
            } else {
                existing.interactionScore += scoreAdd;
                if (c.createdAt > existing.lastInteractedAt) {
                    existing.lastInteractedAt = c.createdAt;
                }
            }
        }

        return Array.from(map.entries())
            .map(([key, data]) => {
                const original = comments.find(
                    (c) => c.authorUsername?.toLowerCase() === key
                )?.authorUsername;
                return {
                    username: original || key,
                    interactionScore: Math.round(data.interactionScore),
                    lastInteractedAt: data.lastInteractedAt,
                };
            })
            .sort((a, b) => b.interactionScore - a.interactionScore)
            .slice(0, 10);
    }

    const fromDb = await buildRankingFromDb(socialProfileId, excludeHandle);
    return fromDb.ranking.slice(0, 10).map((r) => ({
        username: r.username || r.name || '',
        interactionScore: Math.round(r.score),
        lastInteractedAt: new Date(),
    }));
}

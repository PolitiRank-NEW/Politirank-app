import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { APIFY_POSTS_LIMIT } from '@/lib/apify-limits';

type RawApiData = {
    profile?: Record<string, unknown>;
    lastRanking?: unknown[];
    lastMeta?: Record<string, unknown>;
    lastSyncedAt?: string;
};

export type CachedPageInfo = {
    username: string;
    name: string | null;
    followers: number | null;
    likes: number | null;
    category: string | null;
    verified: boolean;
    source: 'db' | 'rawApiData' | 'manual' | 'instagram_estimate';
};

/** Lê seguidores/nome do FB já salvos — evita chamar Apify no sync. */
export function resolveFacebookPageInfoFromCache(
    facebookProfile: {
        handle: string;
        followers: number;
        rawApiData: unknown;
    },
    candidateProfile: {
        facebookFollowers: number | null;
        name?: string | null;
    },
    instagramFollowers = 0
): CachedPageInfo | null {
    const raw = (facebookProfile.rawApiData || {}) as RawApiData;
    const rawProfile = raw.profile || {};
    const cleanHandle = facebookProfile.handle.replace(/^@/, '').trim();

    let followers: number | null = null;
    let source: CachedPageInfo['source'] = 'db';

    if (facebookProfile.followers > 0) {
        followers = facebookProfile.followers;
    } else {
        const fromRaw = Number(rawProfile.followers);
        if (fromRaw > 0) {
            followers = fromRaw;
            source = 'rawApiData';
        } else if (candidateProfile.facebookFollowers && candidateProfile.facebookFollowers > 0) {
            followers = candidateProfile.facebookFollowers;
            source = 'manual';
        } else if (instagramFollowers > 0) {
            followers = instagramFollowers;
            source = 'instagram_estimate';
        }
    }

    if (!followers || followers <= 0) return null;

    const name =
        (typeof rawProfile.name === 'string' && rawProfile.name) ||
        candidateProfile.name ||
        null;

    const likesRaw = rawProfile.likes ?? rawProfile.likesCount;
    const likes = typeof likesRaw === 'number' && likesRaw > 0 ? likesRaw : null;

    return {
        username: cleanHandle,
        name,
        followers,
        likes,
        category: (typeof rawProfile.category === 'string' && rawProfile.category) || null,
        verified: Boolean(rawProfile.verified),
        source,
    };
}

/** Lê seguidores do IG já salvos — evita getProfileInfo no Apify durante sync. */
export function resolveInstagramProfileFromCache(
    instagramProfile: {
        handle: string;
        followers: number;
        postsCount: number;
        rawApiData: unknown;
    },
    candidateProfile?: { instagramFollowers?: number | null }
): { followers: number | null; postsCount: number | null; fullName: string | null } | null {
    const raw = (instagramProfile.rawApiData || {}) as RawApiData;
    const rawProfile = raw.profile || {};

    let followers: number | null = null;
    if (instagramProfile.followers > 0) {
        followers = instagramProfile.followers;
    } else {
        const fromRaw = Number(rawProfile.followers ?? rawProfile.followersCount);
        if (fromRaw > 0) followers = fromRaw;
        else if (candidateProfile?.instagramFollowers && candidateProfile.instagramFollowers > 0) {
            followers = candidateProfile.instagramFollowers;
        }
    }

    if (!followers || followers <= 0) return null;

    let postsCount: number | null = null;
    if (instagramProfile.postsCount > 0) postsCount = instagramProfile.postsCount;
    else {
        const fromRaw = Number(rawProfile.postsCount ?? rawProfile.mediaCount);
        if (fromRaw > 0) postsCount = fromRaw;
    }

    const fullName =
        (typeof rawProfile.fullName === 'string' && rawProfile.fullName) ||
        (typeof rawProfile.name === 'string' && rawProfile.name) ||
        null;

    return { followers, postsCount, fullName };
}

/** Ranking de engajadores considerado "fresco" por 24h (sem refetch de comentários no Apify). */
export const CACHED_RANKING_TTL_MS = 24 * 60 * 60 * 1000;

/** Mínimo de pessoas no ranking para confiar no cache. */
export const CACHED_RANKING_MIN_ENGAGERS = 3;

export type CachedRankingDecision = {
    skip: boolean;
    reason?: string;
    ranking?: unknown[];
    meta?: Record<string, unknown>;
};

export function parseRawApiData(rawApiData: unknown): RawApiData {
    return (rawApiData || {}) as RawApiData;
}

/**
 * Evita fetch de comentários no Apify quando já existe lastRanking recente no MongoDB.
 * Refaz a busca se houver posts novos neste sync ou se o cache expirou.
 */
export function shouldSkipApifyCommentFetch(
    rawApiData: unknown,
    options?: {
        forceRefresh?: boolean;
        hasNewPosts?: boolean;
        minEngagers?: number;
        maxAgeMs?: number;
    }
): CachedRankingDecision {
    if (options?.forceRefresh) {
        return { skip: false, reason: 'force_refresh' };
    }
    if (options?.hasNewPosts) {
        return { skip: false, reason: 'posts_novos' };
    }

    const raw = parseRawApiData(rawApiData);
    const ranking = raw.lastRanking;
    const minEngagers = options?.minEngagers ?? CACHED_RANKING_MIN_ENGAGERS;

    if (!Array.isArray(ranking) || ranking.length < minEngagers) {
        return { skip: false, reason: 'ranking_vazio' };
    }

    const syncedAt = raw.lastSyncedAt ? new Date(raw.lastSyncedAt).getTime() : 0;
    const maxAge = options?.maxAgeMs ?? CACHED_RANKING_TTL_MS;
    if (!syncedAt || Number.isNaN(syncedAt) || Date.now() - syncedAt > maxAge) {
        return { skip: false, reason: 'ranking_expirado' };
    }

    return {
        skip: true,
        reason: 'ranking_em_cache',
        ranking,
        meta: raw.lastMeta,
    };
}

export async function resolveFollowersForFacebook(
    facebookProfile: { followers: number; rawApiData: unknown },
    candidateProfile: { facebookFollowers: number | null; id: string }
): Promise<number | null> {
    const raw = (facebookProfile.rawApiData || {}) as RawApiData;
    const fromProfile = raw.profile?.followers as number | undefined;

    if (facebookProfile.followers > 0) return facebookProfile.followers;
    if (fromProfile && fromProfile > 0) return fromProfile;
    if (candidateProfile.facebookFollowers && candidateProfile.facebookFollowers > 0) {
        return candidateProfile.facebookFollowers;
    }

    const ig = await prisma.socialProfile.findFirst({
        where: { candidateId: candidateProfile.id, platform: SocialPlatform.INSTAGRAM },
    });
    if (ig?.followers && ig.followers > 0) return ig.followers;

    return null;
}

export function buildPostsFromDb(
    dbPosts: {
        metaMediaId: string;
        caption: string | null;
        mediaType: string | null;
        permalink: string | null;
        likesCount: number;
        commentsCount: number;
        shares: number | null;
        postedAt: Date;
    }[],
    platform: 'instagram' | 'facebook'
) {
    return dbPosts.map((p) => {
        const timestamp = p.postedAt.toISOString();
        const base = {
            id: p.metaMediaId,
            type: p.mediaType || (platform === 'facebook' ? 'Post' : 'Imagem'),
            likes: p.likesCount,
            comments: p.commentsCount,
            timestamp,
            url: p.permalink || '',
        };
        if (platform === 'facebook') {
            return { ...base, text: p.caption || '', shares: p.shares ?? 0 };
        }
        return { ...base, caption: p.caption || '' };
    });
}

type DbMediaPost = Parameters<typeof buildPostsFromDb>[0][number];

export function readCachedTracker(
    socialProfile: {
        handle: string;
        followers: number;
        postsCount: number;
        rawApiData: unknown;
    },
    dbPosts: DbMediaPost[],
    platform: 'instagram' | 'facebook',
    extras: {
        followers: number | null;
        name?: string | null;
        fullName?: string | null;
    }
) {
    const raw = (socialProfile.rawApiData || {}) as RawApiData;
    const posts = buildPostsFromDb(dbPosts, platform);
    const ranking = (raw.lastRanking || []) as unknown[];
    const meta = (raw.lastMeta || {
        postsAnalyzed: posts.length,
        commentsAnalyzed: 0,
    }) as Record<string, unknown>;

    const lastSyncedAt = raw.lastSyncedAt || null;

    return {
        hasCachedData: posts.length > 0,
        profile: {
            username: (raw.profile?.username as string) || socialProfile.handle,
            name: extras.name ?? (raw.profile?.name as string) ?? null,
            fullName: extras.fullName ?? (raw.profile?.fullName as string) ?? null,
            followers: extras.followers,
            postsCount: socialProfile.postsCount || posts.length,
        },
        posts,
        ranking,
        meta,
        lastSyncedAt,
    };
}

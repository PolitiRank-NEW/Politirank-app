import { prisma } from '@/app/lib/prisma';

export type SyncMode = 'full' | 'incremental';

export type LastIncrementalMeta = {
    syncMode: SyncMode;
    newPostIds: string[];
    newPostsCount: number;
    at: string;
};

type RawWithIncremental = {
    lastIncremental?: LastIncrementalMeta;
};

/** Já existe baseline no Mongo (1º sync feito). */
export async function hasBaselineSync(socialProfileId: string): Promise<boolean> {
    const count = await prisma.mediaPost.count({ where: { socialProfileId } });
    return count > 0;
}

/** Separa IDs de posts novos vs já salvos. */
export async function partitionNewPostIds(socialProfileId: string, postIds: string[]) {
    const unique = [...new Set(postIds.filter(Boolean))];
    if (unique.length === 0) {
        return { newPostIds: [] as string[], existingPostIds: [] as string[] };
    }

    const existing = await prisma.mediaPost.findMany({
        where: { socialProfileId, metaMediaId: { in: unique } },
        select: { metaMediaId: true },
    });
    const existingSet = new Set(existing.map((row) => row.metaMediaId));
    const newPostIds = unique.filter((id) => !existingSet.has(id));
    const existingPostIds = unique.filter((id) => existingSet.has(id));

    return { newPostIds, existingPostIds };
}

export function readLastIncremental(rawApiData: unknown): LastIncrementalMeta | null {
    const raw = (rawApiData || {}) as RawWithIncremental;
    const inc = raw.lastIncremental;
    if (!inc || !Array.isArray(inc.newPostIds)) return null;
    return inc;
}

export function markPostsWithNewFlag<T extends { id: string }>(
    posts: T[],
    newPostIds: string[]
): (T & { isNew: boolean })[] {
    const newSet = new Set(newPostIds);
    return posts.map((post) => ({ ...post, isNew: newSet.has(post.id) }));
}

/** URLs de posts novos para buscar comentários (economia pós-1º sync). */
export function urlsForIncrementalComments(
    posts: { id: string; url?: string }[],
    newPostIds: string[],
    maxPosts: number
): string[] {
    if (newPostIds.length === 0) return [];
    const newSet = new Set(newPostIds);
    return posts
        .filter((p) => newSet.has(p.id) && p.url)
        .slice(0, maxPosts)
        .map((p) => p.url as string);
}

export function buildLastIncremental(
    syncMode: SyncMode,
    newPostIds: string[]
): LastIncrementalMeta {
    return {
        syncMode,
        newPostIds,
        newPostsCount: newPostIds.length,
        at: new Date().toISOString(),
    };
}

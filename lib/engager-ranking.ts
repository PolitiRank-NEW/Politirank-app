import { prisma } from '@/app/lib/prisma';

export interface EngagerRankEntry {
    username?: string;
    name?: string;
    profileUrl?: string | null;
    comments: number;
    commentLikes: number;
    score: number;
}

export interface EngagerMeta {
    postsAnalyzed: number;
    commentsAnalyzed: number;
    uniqueEngagers: number;
}

function parseCommentUsername(c: Record<string, unknown>): string {
    const owner = c.owner as Record<string, unknown> | undefined;
    return String(c.ownerUsername || owner?.username || c.username || c.profileName || c.name || '')
        .trim()
        .replace(/^@/, '');
}

function parseCommentLikes(c: Record<string, unknown>): number {
    return Number(c.likesCount ?? c.like_count ?? c.likes ?? 0) || 0;
}

/** Extrai comentários embutidos em um item de post do Apify (vários formatos). */
export function extractCommentsFromIgPost(raw: Record<string, unknown>): { username: string; likes: number }[] {
    const out: { username: string; likes: number }[] = [];
    const lists = [raw.latestComments, raw.comments, raw.latest_comments].filter(Array.isArray);

    for (const list of lists) {
        for (const item of list as Record<string, unknown>[]) {
            const username = parseCommentUsername(item);
            if (!username) continue;
            out.push({ username, likes: parseCommentLikes(item) });
        }
    }
    return out;
}

/** Extrai comentários de itens retornados pelo modo `resultsType: comments`. */
export function extractCommentsFromIgCommentItems(
    items: Record<string, unknown>[]
): { username: string; likes: number }[] {
    return items
        .map((c) => ({ username: parseCommentUsername(c), likes: parseCommentLikes(c) }))
        .filter((c) => c.username.length > 0);
}

export function buildEngagerRanking(
    commentItems: { username: string; likes: number }[],
    excludeHandle?: string,
    platform: 'instagram' | 'facebook' = 'instagram'
): EngagerRankEntry[] {
    const exclude = excludeHandle?.replace('@', '').trim().toLowerCase();
    const engagers: Record<string, EngagerRankEntry> = {};

    for (const { username, likes } of commentItems) {
        const key = username.toLowerCase();
        if (exclude && key === exclude) continue;

        if (!engagers[key]) {
            engagers[key] =
                platform === 'facebook'
                    ? { name: username, comments: 0, commentLikes: 0, score: 0 }
                    : { username, comments: 0, commentLikes: 0, score: 0 };
        }
        engagers[key].comments += 1;
        engagers[key].commentLikes += likes;
        engagers[key].score += 1 + Math.log10(likes + 1);
    }

    return Object.values(engagers)
        .map((e) => ({ ...e, score: Number(e.score.toFixed(2)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 100);
}

/** Reconstrói ranking a partir dos comentários salvos no banco. */
export async function buildRankingFromDb(
    socialProfileId: string,
    excludeHandle?: string
): Promise<{ ranking: EngagerRankEntry[]; commentsAnalyzed: number; uniqueEngagers: number }> {
    const comments = await prisma.comment.findMany({
        where: {
            mediaPost: { socialProfileId },
            isFromCandidate: false,
        },
        select: { authorUsername: true, likeCount: true },
    });

    const items = comments.map((c) => ({
        username: c.authorUsername,
        likes: c.likeCount,
    }));

    const ranking = buildEngagerRanking(items, excludeHandle, 'instagram');

    return {
        ranking,
        commentsAnalyzed: comments.length,
        uniqueEngagers: ranking.length,
    };
}

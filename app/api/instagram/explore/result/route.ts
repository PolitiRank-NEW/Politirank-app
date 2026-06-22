import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apifyService } from '@/services/apifyService';
import { SocialPlatform } from '@prisma/client';
import { resolveCandidateSocialProfile } from '@/lib/resolve-candidate-social';
import { shouldSkipApifyCommentFetch } from '@/lib/tracked-cache';
import {
    sortAndLimitPosts,
    APIFY_IG_POSTS_FOR_COMMENTS,
    APIFY_IG_COMMENTS_PER_POST,
} from '@/lib/apify-limits';
import {
    extractCommentsFromIgPost,
    extractCommentsFromIgCommentItems,
    buildEngagerRanking,
} from '@/lib/engager-ranking';
import {
    partitionNewPostIds,
    markPostsWithNewFlag,
    urlsForIncrementalComments,
    type SyncMode,
} from '@/lib/incremental-sync';

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    let datasetId = '';
    let handle = '';
    let viewAsUserId: string | null = null;
    let syncMode: SyncMode = 'full';

    try {
        const body = await request.json();
        datasetId = (body?.datasetId || '').toString();
        handle = (body?.handle || '').toString().replace('@', '').trim().toLowerCase();
        viewAsUserId = (body?.viewAsUserId || null) as string | null;
        if (body?.syncMode === 'incremental') syncMode = 'incremental';
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    const resolved = await resolveCandidateSocialProfile(
        sessionUser,
        SocialPlatform.INSTAGRAM,
        viewAsUserId
    );

    if (!resolved) {
        return NextResponse.json({ error: 'Perfil do Instagram não vinculado.' }, { status: 404 });
    }

    if (!datasetId) {
        return NextResponse.json({ error: 'datasetId é obrigatório.' }, { status: 400 });
    }

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
        return NextResponse.json({ error: 'Token do Apify não configurado.' }, { status: 500 });
    }

    try {
        const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
        if (!res.ok) {
            return NextResponse.json({ error: 'Falha ao buscar os dados do Apify.' }, { status: 502 });
        }

        const items = await res.json();
        const rawPosts: Record<string, unknown>[] = Array.isArray(items) ? items : [];

        const firstItem = rawPosts[0];
        if (firstItem?.error) {
            return NextResponse.json(
                {
                    error:
                        (firstItem.errorDescription as string) ||
                        'O perfil pode ser privado ou inexistente.',
                },
                { status: 404 }
            );
        }

        const validPosts = rawPosts.filter((p) => p && (p.id || p.shortCode));

        const posts = sortAndLimitPosts(
            validPosts.map((p) => ({
                id: String(p.id || p.shortCode),
                caption: String(p.caption || ''),
                type: p.type === 'Video' ? 'Vídeo' : p.type === 'Sidecar' ? 'Carrossel' : 'Imagem',
                likes: Number(p.likesCount || 0),
                comments: Number(p.commentsCount || 0),
                timestamp: p.timestamp || null,
                url: String(p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '')),
            }))
        );

        let profile: Record<string, unknown> | null = null;
        const fp = posts[0]
            ? validPosts.find((p) => String(p.id || p.shortCode) === posts[0].id)
            : validPosts[0];
        if (fp) {
            profile = {
                username: fp.ownerUsername || handle,
                fullName: fp.ownerFullName || null,
                followers: fp.ownerFollowers ?? firstItem?.followersCount ?? null,
                postsCount: fp.ownerPostsCount ?? firstItem?.postsCount ?? null,
            };
        }

        const commentItems: { username: string; likes: number }[] = [];
        for (const post of posts) {
            const raw = validPosts.find((p) => String(p.id || p.shortCode) === post.id);
            if (raw) commentItems.push(...extractCommentsFromIgPost(raw));
        }

        const postIds = posts.map((p) => p.id).filter(Boolean);
        const { newPostIds } = await partitionNewPostIds(resolved.socialProfile.id, postIds);
        const hasNewPosts = newPostIds.length > 0;
        const postsWithFlags = markPostsWithNewFlag(posts, newPostIds);

        const commentCache = shouldSkipApifyCommentFetch(resolved.socialProfile.rawApiData, {
            hasNewPosts,
        });

        let commentsFetchedViaApify = false;

        if (commentItems.length === 0) {
            let urlsToFetch: string[] = [];

            if (hasNewPosts) {
                urlsToFetch = urlsForIncrementalComments(
                    posts,
                    newPostIds,
                    APIFY_IG_POSTS_FOR_COMMENTS
                );
            } else if (!commentCache.skip) {
                urlsToFetch = posts
                    .filter((p) => p.url)
                    .slice(0, APIFY_IG_POSTS_FOR_COMMENTS)
                    .map((p) => p.url);
            }

            if (urlsToFetch.length > 0) {
                console.log(
                    `[IG Explore] Comentários Apify — ${urlsToFetch.length} post(s)${hasNewPosts ? ' novos' : ''}.`
                );
                const fetched = await apifyService.fetchInstagramComments(
                    urlsToFetch,
                    APIFY_IG_COMMENTS_PER_POST
                );
                commentItems.push(
                    ...extractCommentsFromIgCommentItems(fetched as Record<string, unknown>[])
                );
                commentsFetchedViaApify = true;
            } else if (!hasNewPosts && commentCache.skip) {
                console.log(
                    `[IG Explore] Incremental sem novidades — ranking em cache (${commentCache.ranking?.length ?? 0} pessoas).`
                );
            }
        }

        const ranking =
            commentItems.length > 0
                ? buildEngagerRanking(commentItems, handle, 'instagram')
                : commentCache.skip && Array.isArray(commentCache.ranking)
                  ? (commentCache.ranking as ReturnType<typeof buildEngagerRanking>)
                  : [];

        const cachedMeta = commentCache.meta as
            | { postsAnalyzed?: number; commentsAnalyzed?: number; uniqueEngagers?: number }
            | undefined;

        return NextResponse.json({
            profile,
            posts: postsWithFlags,
            ranking,
            meta: {
                postsAnalyzed: posts.length,
                commentsAnalyzed:
                    commentItems.length > 0
                        ? commentItems.length
                        : (cachedMeta?.commentsAnalyzed ?? ranking.length),
                uniqueEngagers:
                    ranking.length > 0 ? ranking.length : (cachedMeta?.uniqueEngagers ?? 0),
                rankingFromCache: commentCache.skip && commentItems.length === 0,
                syncMode,
                newPostsCount: newPostIds.length,
                newPostIds,
                updatedPostsCount: postIds.length - newPostIds.length,
                skippedApifyComments: !commentsFetchedViaApify && commentItems.length === 0,
            },
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erro ao processar os dados.';
        console.error('[Explore Result] Erro ao processar dataset:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

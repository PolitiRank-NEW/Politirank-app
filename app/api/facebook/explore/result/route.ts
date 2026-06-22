import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { facebookService, parseCount } from '@/services/facebookService';
import { SocialPlatform } from '@prisma/client';
import { resolveCandidateSocialProfile } from '@/lib/resolve-candidate-social';
import {
    APIFY_FB_POSTS_FOR_COMMENTS,
    APIFY_FB_COMMENTS_PER_POST,
    normalizePostTimestamp,
    sortAndLimitPosts,
} from '@/lib/apify-limits';
import { resolveFollowersForFacebook, shouldSkipApifyCommentFetch } from '@/lib/tracked-cache';
import {
    partitionNewPostIds,
    markPostsWithNewFlag,
    urlsForIncrementalComments,
    type SyncMode,
} from '@/lib/incremental-sync';

interface RankedEngager {
    name: string;
    profileUrl: string | null;
    comments: number;
    commentLikes: number;
    score: number;
}

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    let datasetId = '';
    let viewAsUserId: string | null = null;
    let syncMode: SyncMode = 'full';

    try {
        const body = await request.json();
        datasetId = (body?.datasetId || '').toString();
        viewAsUserId = (body?.viewAsUserId || null) as string | null;
        if (body?.syncMode === 'incremental') syncMode = 'incremental';
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    const resolved = await resolveCandidateSocialProfile(
        sessionUser,
        SocialPlatform.FACEBOOK,
        viewAsUserId
    );

    if (!resolved) {
        return NextResponse.json({ error: 'Página do Facebook não vinculada.' }, { status: 404 });
    }

    const { socialProfile, candidateProfile, user } = resolved;

    if (!datasetId) {
        return NextResponse.json({ error: 'datasetId é obrigatório.' }, { status: 400 });
    }

    try {
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
            (p: Record<string, unknown>) =>
                p && (p.postId || p.url || p.postUrl || p.topLevelUrl)
        );

        const posts = sortAndLimitPosts(
            validPosts.map((p: Record<string, unknown>) => {
                const url = String(
                    p.url || p.postUrl || p.topLevelUrl || p.facebookUrl || ''
                );
                const isVideo =
                    p.hasVideo ||
                    !!p.videoUrl ||
                    (p.media as { __typename?: string }[] | undefined)?.some?.(
                        (m) => m.__typename === 'Video'
                    );
                const isReel = p.isReel || p.reelFlag;
                return {
                    id: String(p.postId || url),
                    text: String(p.text || p.message || p.caption || ''),
                    type: isReel ? 'Reel' : isVideo ? 'Vídeo' : 'Post',
                    likes: parseCount(
                        p.likes ?? p.likesCount ?? p.reactionsCount ?? p.reaction_count
                    ),
                    comments: parseCount(p.comments ?? p.commentsCount ?? p.comment_count),
                    shares: parseCount(p.shares ?? p.sharesCount ?? p.share_count),
                    timestamp: normalizePostTimestamp(
                        p.time || p.timestamp || p.date || p.postedAt || null
                    ),
                    url,
                };
            })
        );

        const postIds = posts.map((p) => p.id).filter(Boolean);
        const { newPostIds } = await partitionNewPostIds(socialProfile.id, postIds);
        const hasNewPosts = newPostIds.length > 0;
        const postsWithFlags = markPostsWithNewFlag(posts, newPostIds);

        const commentCache = shouldSkipApifyCommentFetch(socialProfile.rawApiData, {
            hasNewPosts,
        });

        let ranking: RankedEngager[] = [];
        let commentsAnalyzed = 0;
        let postsScrapedForComments = 0;
        let commentsFetchedViaApify = false;

        if (commentCache.skip && !hasNewPosts && Array.isArray(commentCache.ranking)) {
            console.log(
                `[FB Explore] Incremental sem novidades — ranking em cache (${commentCache.ranking.length} pessoas).`
            );
            ranking = commentCache.ranking as RankedEngager[];
            const cachedMeta = commentCache.meta as { commentsAnalyzed?: number } | undefined;
            commentsAnalyzed = cachedMeta?.commentsAnalyzed ?? ranking.length;
        } else {
            let urlsToFetch: string[] = [];

            if (hasNewPosts) {
                urlsToFetch = urlsForIncrementalComments(
                    posts,
                    newPostIds,
                    APIFY_FB_POSTS_FOR_COMMENTS
                );
            } else if (!commentCache.skip) {
                urlsToFetch = posts
                    .filter((p) => p.url)
                    .slice(0, APIFY_FB_POSTS_FOR_COMMENTS)
                    .map((p) => p.url);
            }

            if (urlsToFetch.length > 0) {
                postsScrapedForComments = urlsToFetch.length;
                console.log(
                    `[FB Explore] Comentários Apify — ${urlsToFetch.length} post(s)${hasNewPosts ? ' novos' : ''}.`
                );
                const rawComments = await facebookService.fetchComments(
                    urlsToFetch,
                    APIFY_FB_COMMENTS_PER_POST
                );
                commentsFetchedViaApify = true;

                const engagers: Record<string, RankedEngager> = {};

                for (const c of rawComments as Record<string, unknown>[]) {
                    const name = (c.profileName || c.name || '').toString().trim();
                    if (!name) continue;

                    const key = (c.profileId || name).toString();
                    const likes = parseCount(c.likesCount ?? c.likes);
                    commentsAnalyzed++;

                    if (!engagers[key]) {
                        engagers[key] = {
                            name,
                            profileUrl:
                                (c.profileUrl as string) ||
                                (c.profileId
                                    ? `https://www.facebook.com/${c.profileId}`
                                    : null),
                            comments: 0,
                            commentLikes: 0,
                            score: 0,
                        };
                    }
                    engagers[key].comments += 1;
                    engagers[key].commentLikes += likes;
                    engagers[key].score += 1 + Math.log10(likes + 1);
                }

                ranking = Object.values(engagers)
                    .map((e) => ({ ...e, score: Number(e.score.toFixed(2)) }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 100);

                if (commentCache.skip && Array.isArray(commentCache.ranking) && ranking.length > 0) {
                    const merged = new Map<string, RankedEngager>();
                    for (const row of commentCache.ranking as RankedEngager[]) {
                        merged.set(row.name.toLowerCase(), { ...row });
                    }
                    for (const row of ranking) {
                        const key = row.name.toLowerCase();
                        const prev = merged.get(key);
                        if (prev) {
                            prev.comments += row.comments;
                            prev.commentLikes += row.commentLikes;
                            prev.score = Number((prev.score + row.score).toFixed(2));
                        } else {
                            merged.set(key, { ...row });
                        }
                    }
                    ranking = [...merged.values()]
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 100);
                }
            } else if (commentCache.skip && Array.isArray(commentCache.ranking)) {
                ranking = commentCache.ranking as RankedEngager[];
                const cachedMeta = commentCache.meta as { commentsAnalyzed?: number } | undefined;
                commentsAnalyzed = cachedMeta?.commentsAnalyzed ?? ranking.length;
            }
        }

        const followers = await resolveFollowersForFacebook(socialProfile, candidateProfile);

        return NextResponse.json({
            profile: {
                username: socialProfile.handle,
                name: user.name,
                followers,
                postsCount: posts.length,
            },
            posts: postsWithFlags,
            ranking,
            meta: {
                postsAnalyzed: posts.length,
                postsScrapedForComments,
                commentsAnalyzed,
                uniqueEngagers: ranking.length,
                rankingFromCache: commentCache.skip && !commentsFetchedViaApify,
                syncMode,
                newPostsCount: newPostIds.length,
                newPostIds,
                updatedPostsCount: postIds.length - newPostIds.length,
                skippedApifyComments: !commentsFetchedViaApify,
            },
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erro ao processar os dados.';
        console.error('[FB Explore Result] Erro:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { resolveCandidateSocialProfile } from '@/lib/resolve-candidate-social';
import { APIFY_POSTS_LIMIT } from '@/lib/apify-limits';
import { readCachedTracker } from '@/lib/tracked-cache';
import { buildRankingFromDb } from '@/lib/engager-ranking';
import { markPostsWithNewFlag, readLastIncremental } from '@/lib/incremental-sync';

export async function GET(request: Request) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const viewAsUserId = searchParams.get('viewAsUserId');

    const resolved = await resolveCandidateSocialProfile(
        sessionUser,
        SocialPlatform.INSTAGRAM,
        viewAsUserId
    );

    if (!resolved) {
        return NextResponse.json({ error: 'Perfil do Instagram não vinculado.' }, { status: 404 });
    }

    const { socialProfile, candidateProfile } = resolved;

    const dbPosts = await prisma.mediaPost.findMany({
        where: { socialProfileId: socialProfile.id },
        orderBy: { postedAt: 'desc' },
        take: APIFY_POSTS_LIMIT,
    });

    const followers =
        socialProfile.followers > 0
            ? socialProfile.followers
            : candidateProfile.instagramFollowers ?? null;

    let cached = readCachedTracker(socialProfile, dbPosts, 'instagram', {
        followers,
        fullName: resolved.user.name,
    });

    const savedRanking = (cached.ranking || []) as unknown[];
    if (savedRanking.length === 0 && dbPosts.length > 0) {
        const fromDb = await buildRankingFromDb(socialProfile.id, socialProfile.handle);
        if (fromDb.ranking.length > 0) {
            cached = {
                ...cached,
                ranking: fromDb.ranking,
                meta: {
                    ...cached.meta,
                    commentsAnalyzed: fromDb.commentsAnalyzed,
                    uniqueEngagers: fromDb.uniqueEngagers,
                },
            };
        }
    }

    const lastInc = readLastIncremental(socialProfile.rawApiData);
    const postsWithNew =
        lastInc && lastInc.newPostIds.length > 0
            ? markPostsWithNewFlag(cached.posts as { id: string }[], lastInc.newPostIds)
            : cached.posts;

    return NextResponse.json({
        ...cached,
        posts: postsWithNew,
        lastIncremental: lastInc,
    });
}

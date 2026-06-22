import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { resolveCandidateSocialProfile } from '@/lib/resolve-candidate-social';
import { APIFY_POSTS_LIMIT } from '@/lib/apify-limits';
import { resolveFollowersForFacebook, readCachedTracker } from '@/lib/tracked-cache';
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
        SocialPlatform.FACEBOOK,
        viewAsUserId
    );

    if (!resolved) {
        return NextResponse.json({ error: 'Página do Facebook não vinculada.' }, { status: 404 });
    }

    const { socialProfile, candidateProfile } = resolved;

    const dbPosts = await prisma.mediaPost.findMany({
        where: { socialProfileId: socialProfile.id },
        orderBy: { postedAt: 'desc' },
        take: APIFY_POSTS_LIMIT,
    });

    const followers = await resolveFollowersForFacebook(socialProfile, candidateProfile);

    const cached = readCachedTracker(socialProfile, dbPosts, 'facebook', {
        followers,
        name: resolved.user.name,
    });

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

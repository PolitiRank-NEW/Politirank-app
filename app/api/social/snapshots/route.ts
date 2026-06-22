import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { resolveCandidateSocialProfile } from '@/lib/resolve-candidate-social';
import { createSocialSnapshot } from '@/lib/social-snapshots';

function parsePlatform(value: string | null): SocialPlatform | null {
    if (value === 'instagram') return SocialPlatform.INSTAGRAM;
    if (value === 'facebook') return SocialPlatform.FACEBOOK;
    return null;
}

export async function GET(request: Request) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const platform = parsePlatform(searchParams.get('platform'));
    const viewAsUserId = searchParams.get('viewAsUserId');

    if (!platform) {
        return NextResponse.json({ error: 'platform é obrigatório (instagram ou facebook).' }, { status: 400 });
    }

    const resolved = await resolveCandidateSocialProfile(sessionUser, platform, viewAsUserId);
    if (!resolved) {
        return NextResponse.json({ error: 'Perfil não vinculado.' }, { status: 404 });
    }

    const snapshots = await prisma.socialSyncSnapshot.findMany({
        where: { socialProfileId: resolved.socialProfile.id },
        orderBy: { syncedAt: 'desc' },
        select: {
            id: true,
            syncedAt: true,
            platform: true,
            meta: true,
            profile: true,
        },
    });

    return NextResponse.json({
        snapshots: snapshots.map((s) => {
            const meta = (s.meta || {}) as Record<string, unknown>;
            const profile = (s.profile || {}) as Record<string, unknown>;
            return {
                id: s.id,
                syncedAt: s.syncedAt.toISOString(),
                platform: s.platform,
                postsAnalyzed: meta.postsAnalyzed,
                commentsAnalyzed: meta.commentsAnalyzed,
                followers: profile.followers ?? null,
            };
        }),
    });
}

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // @ts-ignore
    if (sessionUser.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Apenas SUPER_ADMIN pode salvar snapshots.' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    const platform = parsePlatform(String(body.platform || ''));
    const viewAsUserId = (body.viewAsUserId as string) || null;

    if (!platform) {
        return NextResponse.json({ error: 'platform inválido.' }, { status: 400 });
    }

    const resolved = await resolveCandidateSocialProfile(sessionUser, platform, viewAsUserId);
    if (!resolved) {
        return NextResponse.json({ error: 'Perfil não vinculado.' }, { status: 404 });
    }

    const { profile, posts, ranking, meta } = body;
    if (!profile || !Array.isArray(posts)) {
        return NextResponse.json({ error: 'profile e posts são obrigatórios.' }, { status: 400 });
    }

    const snapshot = await createSocialSnapshot(
        resolved.socialProfile.id,
        resolved.candidateProfile.id,
        platform,
        {
            profile,
            posts,
            ranking: Array.isArray(ranking) ? ranking : [],
            meta: meta && typeof meta === 'object' ? meta : {},
        },
        // @ts-ignore
        sessionUser.id
    );

    return NextResponse.json({
        success: true,
        snapshot: {
            id: snapshot.id,
            syncedAt: snapshot.syncedAt.toISOString(),
        },
    });
}

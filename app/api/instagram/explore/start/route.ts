import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apifyService } from '@/services/apifyService';
import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';
import { APIFY_POSTS_LIMIT, APIFY_INCREMENTAL_POSTS_LIMIT } from '@/lib/apify-limits';
import {
    normalizeSocialHandle,
    resolveCandidateSocialProfile,
} from '@/lib/resolve-candidate-social';
import { hasBaselineSync, type SyncMode } from '@/lib/incremental-sync';
import { resolveInstagramProfileFromCache } from '@/lib/tracked-cache';

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const sessionUser = session?.user;

    if (!session || !sessionUser?.email) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    let viewAsUserId: string | null = null;
    let requestedHandle = '';

    try {
        const body = await request.json();
        viewAsUserId = (body?.viewAsUserId || null) as string | null;
        requestedHandle = (body?.handle || '').toString();
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    const resolved = await resolveCandidateSocialProfile(
        sessionUser,
        SocialPlatform.INSTAGRAM,
        viewAsUserId
    );

    if (!resolved) {
        return NextResponse.json(
            { error: 'Perfil do Instagram não vinculado a este candidato.' },
            { status: 404 }
        );
    }

    const handle = resolved.socialProfile.handle;
    const cleanHandle = apifyService.cleanHandle(handle);

    if (requestedHandle.trim()) {
        const cleanRequested = normalizeSocialHandle(SocialPlatform.INSTAGRAM, requestedHandle);
        if (cleanRequested !== normalizeSocialHandle(SocialPlatform.INSTAGRAM, handle)) {
            return NextResponse.json(
                { error: 'Só é possível analisar o perfil do Instagram vinculado ao candidato.' },
                { status: 403 }
            );
        }
    }

    try {
        const incremental = await hasBaselineSync(resolved.socialProfile.id);
        const syncMode: SyncMode = incremental ? 'incremental' : 'full';
        const resultsLimit = incremental ? APIFY_INCREMENTAL_POSTS_LIMIT : APIFY_POSTS_LIMIT;

        console.log(
            `[IG Explore Start] Modo ${syncMode} — ${resultsLimit} posts${incremental ? ' (só recentes)' : ''}.`
        );

        const runId = await apifyService.startScrapeRun(handle, { resultsLimit });

        let profile: Record<string, unknown> | null = null;

        if (syncMode === 'incremental') {
            const candidateRow = await prisma.candidateProfile.findUnique({
                where: { id: resolved.candidateProfile.id },
                select: { instagramFollowers: true },
            });
            const cached = resolveInstagramProfileFromCache(
                resolved.socialProfile,
                candidateRow ?? undefined
            );
            if (cached?.followers) {
                console.log('[IG Explore Start] Seguidores do cache — pulando getProfileInfo.');
                profile = {
                    username: cleanHandle,
                    fullName: cached.fullName,
                    followers: cached.followers,
                    postsCount: cached.postsCount,
                };
            }
        }

        if (!profile) {
            profile = await apifyService.getProfileInfo(cleanHandle);
        }

        return NextResponse.json({ runId, handle: cleanHandle, profile, syncMode });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao iniciar a análise.';
        console.error('[IG Explore Start] Erro:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

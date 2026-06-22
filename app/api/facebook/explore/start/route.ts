import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { facebookService } from '@/services/facebookService';
import { SocialPlatform } from '@prisma/client';
import { APIFY_POSTS_LIMIT, APIFY_INCREMENTAL_POSTS_LIMIT } from '@/lib/apify-limits';
import {
    normalizeSocialHandle,
    resolveCandidateSocialProfile,
} from '@/lib/resolve-candidate-social';
import { hasBaselineSync, type SyncMode } from '@/lib/incremental-sync';

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
        SocialPlatform.FACEBOOK,
        viewAsUserId
    );

    if (!resolved) {
        return NextResponse.json(
            { error: 'Página do Facebook não vinculada a este candidato.' },
            { status: 404 }
        );
    }

    const handle = resolved.socialProfile.handle;
    const cleanHandle = facebookService.cleanHandle(handle);

    if (requestedHandle.trim()) {
        const cleanRequested = normalizeSocialHandle(SocialPlatform.FACEBOOK, requestedHandle);
        if (cleanRequested !== normalizeSocialHandle(SocialPlatform.FACEBOOK, handle)) {
            return NextResponse.json(
                { error: 'Só é possível analisar a página do Facebook vinculada ao candidato.' },
                { status: 403 }
            );
        }
    }

    try {
        const incremental = await hasBaselineSync(resolved.socialProfile.id);
        const syncMode: SyncMode = incremental ? 'incremental' : 'full';
        const resultsLimit = incremental ? APIFY_INCREMENTAL_POSTS_LIMIT : APIFY_POSTS_LIMIT;

        console.log(
            `[FB Explore Start] Modo ${syncMode} — ${resultsLimit} posts${incremental ? ' (só recentes)' : ''}.`
        );

        const runId = await facebookService.startPostsRun(handle, resultsLimit);

        return NextResponse.json({
            runId,
            handle: cleanHandle,
            profile: { username: cleanHandle, name: null, followers: null },
            syncMode,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao iniciar a análise.';
        console.error('[FB Explore Start] Erro:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

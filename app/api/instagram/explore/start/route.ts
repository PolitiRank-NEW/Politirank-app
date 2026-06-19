import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apifyService } from '@/services/apifyService';

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const role = session?.user?.role;

    if (!session || role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Acesso restrito ao Super Admin.' }, { status: 403 });
    }

    let handle = '';
    try {
        const body = await request.json();
        handle = (body?.handle || '').toString();
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    if (!handle.trim()) {
        return NextResponse.json({ error: 'Informe um @ válido.' }, { status: 400 });
    }

    try {
        // 1. Inicia a coleta dos posts (assíncrona; roda em background no Apify)
        const runId = await apifyService.startScrapeRun(handle, { resultsLimit: 30 });

        // 2. Em paralelo, busca os dados do perfil (seguidores, nome, etc.).
        // A chamada de posts já está rodando no Apify enquanto esperamos esta.
        const profile = await apifyService.getProfileInfo(handle);

        return NextResponse.json({ runId, handle: apifyService.cleanHandle(handle), profile });
    } catch (e: any) {
        console.error('[Explore Start] Erro ao iniciar Apify:', e);
        return NextResponse.json({ error: e.message || 'Falha ao iniciar a análise.' }, { status: 500 });
    }
}

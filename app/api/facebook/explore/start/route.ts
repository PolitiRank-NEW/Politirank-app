import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { facebookService } from '@/services/facebookService';

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
        return NextResponse.json({ error: 'Informe a página/usuário do Facebook.' }, { status: 400 });
    }

    try {
        // 1. Inicia coleta dos posts (assíncrona; roda em background no Apify)
        const runId = await facebookService.startPostsRun(handle, 30);

        // 2. Em paralelo, busca dados da página (seguidores, nome)
        const profile = await facebookService.getPageInfo(handle);

        return NextResponse.json({ runId, handle: facebookService.cleanHandle(handle), profile });
    } catch (e: any) {
        console.error('[FB Explore Start] Erro:', e);
        return NextResponse.json({ error: e.message || 'Falha ao iniciar a análise.' }, { status: 500 });
    }
}

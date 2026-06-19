import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { facebookService } from '@/services/facebookService';

export async function GET(request: Request) {
    const session = await auth();
    // @ts-ignore
    const role = session?.user?.role;

    if (!session || role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Acesso restrito ao Super Admin.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    if (!runId) {
        return NextResponse.json({ error: 'runId é obrigatório.' }, { status: 400 });
    }

    try {
        const runStatus = await facebookService.getRunStatus(runId);
        return NextResponse.json({ status: runStatus.status, datasetId: runStatus.datasetId });
    } catch (e: any) {
        console.error('[FB Explore Status] Erro:', e);
        return NextResponse.json({ error: 'Erro ao verificar status.' }, { status: 500 });
    }
}

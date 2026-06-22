import { NextResponse } from 'next/server';
import { facebookService } from '@/services/facebookService';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const runId = searchParams.get('runId');

        if (!runId) {
            return NextResponse.json({ error: 'runId is required' }, { status: 400 });
        }

        const runStatus = await facebookService.getRunStatus(runId);

        return NextResponse.json({
            success: true,
            status: runStatus.status,
            datasetId: runStatus.datasetId,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('[FB SYNC Status] Erro:', error);
        return NextResponse.json(
            { error: 'Erro ao verificar status.', details: message },
            { status: 500 }
        );
    }
}

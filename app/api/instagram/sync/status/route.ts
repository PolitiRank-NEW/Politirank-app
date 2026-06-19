import { NextResponse } from 'next/server';
import { apifyService } from '@/services/apifyService';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const runId = searchParams.get('runId');

        if (!runId) {
            return NextResponse.json({ error: 'runId is required' }, { status: 400 });
        }

        const runStatus = await apifyService.getRunStatus(runId);
        
        return NextResponse.json({ 
            success: true, 
            status: runStatus.status,
            datasetId: runStatus.datasetId
        });

    } catch (error: any) {
        console.error('API Error checking Apify status:', error);
        return NextResponse.json({ error: 'Erro ao verificar status.', details: error.message }, { status: 500 });
    }
}

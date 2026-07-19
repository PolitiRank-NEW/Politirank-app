import { NextResponse } from 'next/server';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { EvolutionService, evolutionService } from '@/services/evolutionService';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const instanceName = access.profile.evolutionInstanceName;
        if (!instanceName) {
            return NextResponse.json({
                success: true,
                configured: false,
                state: 'not_configured',
                instanceName: null,
            });
        }

        const data = await evolutionService.getConnectionState(instanceName);
        const state = EvolutionService.extractConnectionState(data);

        return NextResponse.json({
            success: true,
            configured: true,
            instanceName,
            state,
            connected: state === 'open',
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}

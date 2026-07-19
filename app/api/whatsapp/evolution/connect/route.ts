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
            return NextResponse.json(
                { error: 'Instância não configurada. Chame POST /api/whatsapp/evolution/create primeiro.' },
                { status: 400 }
            );
        }

        const data = await evolutionService.connectInstance(instanceName);
        const qrBase64 = EvolutionService.extractQrBase64(data);
        const state = EvolutionService.extractConnectionState(data);

        return NextResponse.json({
            success: true,
            instanceName,
            state,
            qrBase64,
            raw: process.env.NODE_ENV === 'development' ? data : undefined,
        });
    } catch (error: unknown) {
        const axiosStatus = (error as { response?: { status?: number; data?: unknown } })?.response
            ?.status;
        const axiosData = (error as { response?: { data?: unknown } })?.response?.data;
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[Evolution connect]', axiosData || message);
        return NextResponse.json(
            {
                error:
                    axiosStatus === 403
                        ? 'Instância já existe. Use "Gerar QR Code" para reconectar.'
                        : 'Evolution API indisponível. Verifique se o Docker está rodando em localhost:8080.',
            },
            { status: 502 }
        );
    }
}

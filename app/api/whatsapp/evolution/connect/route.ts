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

        let data;
        try {
            data = await evolutionService.connectInstance(instanceName);
        } catch (connectError: unknown) {
            const connectStatus = (connectError as { response?: { status?: number; data?: { message?: string | string[] } } })
                ?.response?.status;
            const connectBody = (connectError as { response?: { data?: { message?: string | string[] } } })?.response
                ?.data;
            const connectMsg = Array.isArray(connectBody?.message)
                ? connectBody.message.join(' ')
                : String(connectBody?.message || (connectError instanceof Error ? connectError.message : ''));

            const missingOnServer =
                connectStatus === 404 || /does not exist|not found|não existe/i.test(connectMsg);

            if (!missingOnServer) throw connectError;

            // Mongo tem o nome, mas a Evolution na Contabo é nova (sem a instância).
            try {
                await evolutionService.createInstance(instanceName);
            } catch (createError: unknown) {
                const createBody = (createError as { response?: { data?: { message?: string | string[] } } })?.response
                    ?.data;
                const createMsg = Array.isArray(createBody?.message)
                    ? createBody.message.join(' ')
                    : String(createBody?.message || (createError instanceof Error ? createError.message : ''));
                const alreadyExists = /already exists|already in use|já existe|duplicate/i.test(createMsg);
                if (!alreadyExists) throw createError;
            }

            data = await evolutionService.connectInstance(instanceName);
        }

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
        const target = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
        console.error('[Evolution connect]', { target, axiosStatus, axiosData, message });
        return NextResponse.json(
            {
                error:
                    axiosStatus === 403
                        ? 'Instância já existe. Use "Gerar QR Code" para reconectar.'
                        : !process.env.EVOLUTION_API_URL
                          ? 'EVOLUTION_API_URL não configurada na Vercel. Defina a URL da Contabo e faça Redeploy.'
                          : `Evolution API indisponível em ${target}. Confira Docker na VPS e a chave EVOLUTION_API_KEY.`,
            },
            { status: 502 }
        );
    }
}

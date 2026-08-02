import { NextResponse } from 'next/server';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { runLightHourlySync } from '@/lib/whatsapp-group-live-sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Sync leve sob demanda (1 candidato) — usado pelo botão Verificar
 * quando a diferença Evolution × app passa do limiar.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const candidateId = body?.candidateId as string | undefined;
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
                { error: 'WhatsApp ainda não conectado.' },
                { status: 400 }
            );
        }

        if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
            return NextResponse.json(
                { error: 'EVOLUTION_API_URL / EVOLUTION_API_KEY não configurados.' },
                { status: 500 }
            );
        }

        const started = Date.now();
        const result = await runLightHourlySync(candidateId, instanceName);

        return NextResponse.json({
            ok: true,
            elapsedMs: Date.now() - started,
            result,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[evolution/light-sync]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

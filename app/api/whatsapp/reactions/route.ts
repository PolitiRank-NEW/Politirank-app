import { NextResponse } from 'next/server';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { listReactionsJson } from '@/lib/whatsapp-reactions';

export const dynamic = 'force-dynamic';

/**
 * GET ?candidateId=&groupId=&take=
 * Reações (emoji) em JSON estruturado.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        const groupId = searchParams.get('groupId');
        const take = Number(searchParams.get('take') || '100');

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const data = await listReactionsJson({
            candidateId,
            groupId: groupId || null,
            take: Number.isFinite(take) ? take : 100,
        });

        return NextResponse.json({ success: true, ...data });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[whatsapp/reactions GET]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

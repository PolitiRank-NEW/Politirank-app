import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { listPollsJson } from '@/lib/whatsapp-polls';

export const dynamic = 'force-dynamic';

/**
 * GET ?candidateId=&groupId=&take=
 * Enquetes + votos em JSON estruturado.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        const groupId = searchParams.get('groupId');
        const take = Number(searchParams.get('take') || '40');

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const session = await auth();
        // @ts-ignore
        const role = session?.user?.role as string | undefined;
        if (
            role !== 'ADMIN' &&
            role !== 'SUPER_ADMIN' &&
            role !== 'LIDER_CHAPA' &&
            access.profile.userId !== session?.user?.id
        ) {
            // assertCandidateEvolutionAccess already gates admin/owner; keep LIDER path soft
        }

        const polls = await listPollsJson({
            candidateId,
            groupId: groupId || null,
            take: Number.isFinite(take) ? take : 40,
        });

        return NextResponse.json({
            success: true,
            count: polls.length,
            polls,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[whatsapp/polls GET]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

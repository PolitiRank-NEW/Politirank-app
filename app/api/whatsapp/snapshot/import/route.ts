import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { applyMembershipSnapshot } from '@/lib/whatsapp-snapshot-import';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST { candidateId, rows } — aplica snapshot CSV (diff automático de membros).
 * Autenticação: sessão (admin/líder) OU Authorization: Bearer CRON_SECRET (automação).
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const candidateId = body?.candidateId as string | undefined;
        const rows = Array.isArray(body?.rows) ? body.rows : [];

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Nenhuma linha no CSV.' }, { status: 400 });
        }
        if (rows.length > 20000) {
            return NextResponse.json({ error: 'Máximo 20.000 linhas por snapshot.' }, { status: 400 });
        }

        const secret = process.env.CRON_SECRET;
        const authHeader = req.headers.get('authorization') || '';
        const bearerOk = Boolean(secret && authHeader === `Bearer ${secret}`);

        let isSuperAdmin = false;

        if (!bearerOk) {
            const session = await auth();
            if (!session?.user) {
                return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
            }
            // @ts-ignore
            const role = session.user.role as string;
            if (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'LIDER_CHAPA') {
                return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
            }
            isSuperAdmin = role === 'SUPER_ADMIN';

            const access = await assertCandidateEvolutionAccess(candidateId);
            if ('error' in access) {
                return NextResponse.json({ error: access.error }, { status: access.status });
            }
        }

        const result = await applyMembershipSnapshot(candidateId, rows as Record<string, unknown>[], {
            preserveManual: body.preserveManual !== false,
            isSuperAdmin,
        });

        return NextResponse.json({
            success: true,
            result,
            message: `Snapshot: ${result.groupsTouched} grupos · +${result.membersCreated} / -${result.membersRemoved} membros · únicos ${result.uniqueMembers}.`,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[snapshot/import]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** Modelo mínimo do CSV de snapshot */
export async function GET() {
    const csv = `grupo,telefone,nome
grupo_Exemplo #1,5511999999999,Fulano
grupo_Exemplo #1,5511888888888,Beltrano
`;
    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="modelo-snapshot-whatsapp.csv"',
        },
    });
}

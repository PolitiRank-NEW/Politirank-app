import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getGroupWithAccess } from '@/lib/whatsapp-utils';
import { importMembersToGroup } from '@/lib/whatsapp-import-service';
import { MEMBER_CSV_TEMPLATE } from '@/lib/whatsapp-export';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { groupId } = await params;
        // @ts-ignore
        const userRole = session.user.role;
        const isSuperAdmin = userRole === 'SUPER_ADMIN';
        // @ts-ignore
        const { group, allowed, reason, readOnly } = await getGroupWithAccess(groupId, session.user);

        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed || readOnly) {
            return NextResponse.json({ error: 'Sem permissão para importar membros.' }, { status: 403 });
        }

        const body = await req.json();
        const rows = Array.isArray(body.rows) ? body.rows : [];

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Nenhuma linha para importar.' }, { status: 400 });
        }
        if (rows.length > 2000) {
            return NextResponse.json({ error: 'Máximo de 2000 linhas por importação.' }, { status: 400 });
        }

        const result = await importMembersToGroup(groupId, rows, {
            skipDuplicates: body.skipDuplicates !== false,
            updateExisting: body.updateExisting === true,
            isSuperAdmin,
            existingMembers: group.members,
        });

        const parts = [`${result.created} adicionados`];
        if (result.updated > 0) parts.push(`${result.updated} atualizados`);
        parts.push(`${result.skipped} ignorados`);

        return NextResponse.json({
            success: true,
            ...result,
            total: rows.length,
            errors: result.errors.slice(0, 20),
            message: `Importação concluída: ${parts.join(', ')}.`,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ groupId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { groupId } = await params;
        // @ts-ignore
        const { group, allowed, reason } = await getGroupWithAccess(groupId, session.user);

        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed) return NextResponse.json({ error: reason }, { status: 403 });

        return new NextResponse(MEMBER_CSV_TEMPLATE, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="modelo-membros-grupo.csv"',
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

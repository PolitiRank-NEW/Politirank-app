import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { importMembersToGroup, resolveGroupIdByName } from '@/lib/whatsapp-import-service';
import { mapCsvRowToMember } from '@/lib/whatsapp-csv-import';
import { MEMBER_CSV_TEMPLATE } from '@/lib/whatsapp-export';

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        // @ts-ignore
        const userRole = session.user.role;
        const isSuperAdmin = userRole === 'SUPER_ADMIN';

        if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'LIDER_CHAPA') {
            return NextResponse.json({ error: 'Sem permissão para importar.' }, { status: 403 });
        }

        const body = await req.json();
        const candidateId = body.candidateId as string | undefined;
        const defaultGroupId = body.groupId as string | undefined;
        const rows = Array.isArray(body.rows) ? body.rows : [];

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Nenhuma linha para importar.' }, { status: 400 });
        }
        if (rows.length > 5000) {
            return NextResponse.json({ error: 'Máximo de 5000 linhas por importação.' }, { status: 400 });
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: string[] = [];
        const groupCache = new Map<string, string>();

        for (let i = 0; i < rows.length; i++) {
            const mapped = mapCsvRowToMember(rows[i] as Record<string, unknown>);
            const groupName = mapped.groupName.trim();
            let groupId = defaultGroupId || null;

            if (!groupId && groupName) {
                const cacheKey = groupName.toLowerCase();
                if (groupCache.has(cacheKey)) {
                    groupId = groupCache.get(cacheKey)!;
                } else {
                    groupId = await resolveGroupIdByName(candidateId, groupName);
                    if (groupId) groupCache.set(cacheKey, groupId);
                }
            }

            if (!groupId) {
                skipped++;
                errors.push(`Linha ${i + 2}: grupo não informado ou não encontrado ("${groupName || ''}").`);
                continue;
            }

            const result = await importMembersToGroup(groupId, [rows[i] as Record<string, unknown>], {
                skipDuplicates: body.skipDuplicates !== false,
                updateExisting: body.updateExisting === true,
                isSuperAdmin,
            });

            created += result.created;
            updated += result.updated;
            skipped += result.skipped;
            errors.push(...result.errors.map((e) => e.replace('Linha 2:', `Linha ${i + 2}:`)));
        }

        const parts = [`${created} adicionados`];
        if (updated > 0) parts.push(`${updated} atualizados`);
        parts.push(`${skipped} ignorados`);

        return NextResponse.json({
            success: true,
            created,
            updated,
            skipped,
            total: rows.length,
            errors: errors.slice(0, 30),
            message: `Importação concluída: ${parts.join(', ')}.`,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET() {
    return new NextResponse(MEMBER_CSV_TEMPLATE, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="modelo-membros-whatsapp.csv"',
        },
    });
}

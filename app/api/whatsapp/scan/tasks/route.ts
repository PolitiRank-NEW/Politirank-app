import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { buildComplianceRows, parsePhonesList } from '@/lib/whatsapp-scan';

/**
 * GET  ?candidateId=&groupId=  — tarefas + compliance por telefone
 * POST { candidateId, expectedCaption, groupId?, title?, expectedPhones?, matchMode?, requireMedia? }
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        const groupId = searchParams.get('groupId');

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const tasks = await prisma.whatsappScanTask.findMany({
            where: {
                candidateId,
                ...(groupId
                    ? { OR: [{ groupId }, { groupId: null }] }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                hits: {
                    orderBy: { matchedAt: 'desc' },
                    take: 50,
                    include: {
                        group: { select: { id: true, name: true } },
                    },
                },
                _count: { select: { hits: true } },
            },
        });

        // Membros do grupo (ou de todos os grupos das tarefas) para cruzar telefone
        const groupIds = new Set<string>();
        if (groupId) groupIds.add(groupId);
        for (const t of tasks) {
            if (t.groupId) groupIds.add(t.groupId);
        }

        const members = groupIds.size
            ? await prisma.whatsappGroupMember.findMany({
                  where: { groupId: { in: [...groupIds] } },
                  select: { id: true, phone: true, waLid: true, name: true, groupId: true },
              })
            : [];

        const enriched = tasks.map((task) => {
            const scopeMembers = task.groupId
                ? members.filter((m) => m.groupId === task.groupId)
                : groupId
                  ? members.filter((m) => m.groupId === groupId)
                  : members;

            const compliance = buildComplianceRows(
                task.expectedPhones || [],
                scopeMembers,
                task.hits
            );
            const done = compliance.filter((c) => c.status === 'done').length;
            const pending = compliance.filter((c) => c.status === 'pending').length;

            return {
                ...task,
                compliance,
                summary: { done, pending, total: compliance.length },
            };
        });

        return NextResponse.json({ success: true, tasks: enriched });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[scan/tasks GET]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            candidateId,
            expectedCaption,
            groupId,
            title,
            expectedPhones,
            matchMode = 'CONTAINS',
            requireMedia = true,
        } = body as {
            candidateId?: string;
            expectedCaption?: string;
            groupId?: string | null;
            title?: string;
            expectedPhones?: string | string[];
            matchMode?: string;
            requireMedia?: boolean;
        };

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }
        if (!expectedCaption?.trim()) {
            return NextResponse.json({ error: 'expectedCaption é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (groupId) {
            const group = await prisma.whatsappGroup.findFirst({
                where: { id: groupId, candidateId },
                select: { id: true },
            });
            if (!group) {
                return NextResponse.json(
                    { error: 'Grupo não encontrado para este candidato.' },
                    { status: 404 }
                );
            }
        }

        const mode = matchMode === 'EXACT' ? 'EXACT' : 'CONTAINS';
        const phones = parsePhonesList(expectedPhones);

        const task = await prisma.whatsappScanTask.create({
            data: {
                candidateId,
                groupId: groupId || null,
                title: title?.trim() || null,
                expectedCaption: expectedCaption.trim(),
                expectedPhones: phones,
                matchMode: mode,
                requireMedia: Boolean(requireMedia),
                status: 'OPEN',
            },
        });

        return NextResponse.json({ success: true, task }, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[scan/tasks POST]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

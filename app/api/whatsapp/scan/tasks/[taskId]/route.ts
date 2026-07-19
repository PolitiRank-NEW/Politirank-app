import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';

/** PATCH — fechar/reabrir tarefa. DELETE — remover. */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ taskId: string }> }
) {
    try {
        const { taskId } = await params;
        const body = await req.json();
        const { status, candidateId } = body as { status?: string; candidateId?: string };

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const existing = await prisma.whatsappScanTask.findFirst({
            where: { id: taskId, candidateId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
        }

        const nextStatus = status === 'CLOSED' ? 'CLOSED' : status === 'OPEN' ? 'OPEN' : null;
        if (!nextStatus) {
            return NextResponse.json({ error: 'status deve ser OPEN ou CLOSED.' }, { status: 400 });
        }

        const task = await prisma.whatsappScanTask.update({
            where: { id: taskId },
            data: { status: nextStatus },
        });

        return NextResponse.json({ success: true, task });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ taskId: string }> }
) {
    try {
        const { taskId } = await params;
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const existing = await prisma.whatsappScanTask.findFirst({
            where: { id: taskId, candidateId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
        }

        await prisma.whatsappScanTask.delete({ where: { id: taskId } });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

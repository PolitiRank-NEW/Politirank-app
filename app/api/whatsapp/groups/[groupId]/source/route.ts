import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { getGroupWithAccess } from '@/lib/whatsapp-utils';

/**
 * PATCH { isSource: true|false }
 * Só um grupo Source por candidato.
 */
export async function PATCH(
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
        const { group, allowed, reason, readOnly } = await getGroupWithAccess(
            groupId,
            session.user
        );
        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed) return NextResponse.json({ error: reason }, { status: 403 });
        if (readOnly) {
            return NextResponse.json(
                { error: 'Sem permissão para alterar o Source.' },
                { status: 403 }
            );
        }

        const body = await req.json();
        const isSource = Boolean(body?.isSource);

        if (isSource) {
            await prisma.whatsappGroup.updateMany({
                where: { candidateId: group.candidateId, isSource: true },
                data: { isSource: false },
            });
        }

        const updated = await prisma.whatsappGroup.update({
            where: { id: groupId },
            data: { isSource },
        });

        return NextResponse.json({
            success: true,
            group: {
                id: updated.id,
                name: updated.name,
                isSource: updated.isSource,
            },
            message: isSource
                ? `"${updated.name}" agora é o grupo Source. Posts com imagem+legenda viram referência.`
                : `"${updated.name}" deixou de ser Source.`,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[groups PATCH source]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

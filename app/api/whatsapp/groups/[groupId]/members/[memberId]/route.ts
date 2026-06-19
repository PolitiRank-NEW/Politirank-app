import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { getGroupWithAccess, normalizeIgHandle, parseOptionalNumber } from '@/lib/whatsapp-utils';

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ groupId: string; memberId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { groupId, memberId } = await params;
        // @ts-ignore
        const userRole = session.user.role;
        const isSuperAdmin = userRole === 'SUPER_ADMIN';

        // @ts-ignore
        const { group, allowed, reason, readOnly } = await getGroupWithAccess(groupId, session.user);

        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed || readOnly) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

        const existing = await prisma.whatsappGroupMember.findFirst({
            where: { id: memberId, groupId },
        });
        if (!existing) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });

        const body = await req.json();
        const { name, phone, instagramHandle, facebookHandle, pollVotes } = body;

        const data: Record<string, unknown> = { updatedAt: new Date() };

        if (name !== undefined) data.name = name || null;
        if (phone !== undefined) data.phone = phone || null;

        // Liderança e admin podem editar IG/FB
        if (instagramHandle !== undefined) {
            data.instagramHandle = normalizeIgHandle(instagramHandle) || (instagramHandle ? String(instagramHandle).replace('@', '') : null);
            data.igMatched = false;
            data.igUsername = null;
            data.igInteractionScore = null;
        }
        if (facebookHandle !== undefined) {
            data.facebookHandle = facebookHandle ? String(facebookHandle).replace(/^@/, '') : null;
        }

        // Apenas SUPER_ADMIN altera votos em enquete
        if (pollVotes !== undefined) {
            if (!isSuperAdmin) {
                return NextResponse.json({ error: 'Apenas SUPER_ADMIN pode editar votos em enquete.' }, { status: 403 });
            }
            const pv = parseOptionalNumber(pollVotes);
            if (pv !== undefined) data.pollVotes = pv;
        }

        const member = await prisma.whatsappGroupMember.update({
            where: { id: memberId },
            data,
        });

        return NextResponse.json({ success: true, member });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ groupId: string; memberId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { groupId, memberId } = await params;
        // @ts-ignore
        const userRole = session.user.role;
        const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

        // @ts-ignore
        const { group, allowed, reason, readOnly } = await getGroupWithAccess(groupId, session.user);

        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed || readOnly) {
            if (!isAdmin) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
        }

        const existing = await prisma.whatsappGroupMember.findFirst({
            where: { id: memberId, groupId },
        });
        if (!existing) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });

        await prisma.whatsappGroupMember.delete({ where: { id: memberId } });

        await prisma.whatsappGroup.update({
            where: { id: groupId },
            data: {
                currentMembers: { decrement: 1 },
                lastUpdate: new Date(),
            },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

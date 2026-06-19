import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { getGroupWithAccess, normalizeIgHandle } from '@/lib/whatsapp-utils';

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

        return NextResponse.json({ success: true, members: group.members, groupName: group.name });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

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
        // @ts-ignore
        const { group, allowed, reason, readOnly } = await getGroupWithAccess(groupId, session.user);

        if (!group) return NextResponse.json({ error: reason }, { status: 404 });
        if (!allowed || readOnly) return NextResponse.json({ error: 'Sem permissão para adicionar membros.' }, { status: 403 });

        const body = await req.json();
        const { name, phone, instagramHandle, facebookHandle } = body;

        if (!name && !phone) {
            return NextResponse.json({ error: 'Informe pelo menos nome ou telefone.' }, { status: 400 });
        }

        const member = await prisma.whatsappGroupMember.create({
            data: {
                groupId,
                name: name || null,
                phone: phone || null,
                instagramHandle: normalizeIgHandle(instagramHandle) || (instagramHandle ? instagramHandle.replace('@', '') : null),
                facebookHandle: facebookHandle ? facebookHandle.replace(/^@/, '') : null,
                isManual: true,
            },
        });

        // Atualiza contagem de membros do grupo (incrementa, não sobrescreve)
        await prisma.whatsappGroup.update({
            where: { id: groupId },
            data: {
                currentMembers: { increment: 1 },
                lastUpdate: new Date(),
            },
        });

        return NextResponse.json({ success: true, member }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { buildMembersCsv } from '@/lib/whatsapp-export';

export async function GET(req: Request) {
    try {
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!session || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'LIDER_CHAPA' && userRole !== 'CANDIDATO')) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        const groupId = searchParams.get('groupId');

        if (!candidateId && !groupId) {
            return NextResponse.json({ error: 'candidateId ou groupId é obrigatório.' }, { status: 400 });
        }

        const where: { groupId?: string; group?: { candidateId: string } } = {};
        if (groupId) where.groupId = groupId;
        else if (candidateId) where.group = { candidateId };

        const members = await prisma.whatsappGroupMember.findMany({
            where,
            include: {
                group: { include: { lideranca: true } },
            },
            orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
        });

        const csv = buildMembersCsv(members);
        const filename = groupId ? `whatsapp-grupo-${groupId}.csv` : `whatsapp-candidato-${candidateId}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

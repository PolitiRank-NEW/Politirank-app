import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';

function csvEscape(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

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

        const where: any = {};
        if (groupId) where.groupId = groupId;
        else where.group = { candidateId };

        const members = await prisma.whatsappGroupMember.findMany({
            where,
            include: {
                group: { include: { lideranca: true } },
            },
            orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
        });

        const headers = [
            'Liderança',
            'Grupo',
            'Nome',
            'Telefone',
            'Instagram',
            'Facebook',
            'Votos Enquete',
            'IG Cruzado',
            'IG Username Match',
            'IG Score Interação',
        ];

        const rows = members.map((m) => [
            m.group.lideranca?.name || '',
            m.group.name,
            m.name || '',
            m.phone || '',
            m.instagramHandle ? `@${m.instagramHandle}` : '',
            m.facebookHandle ? `@${m.facebookHandle}` : '',
            m.pollVotes,
            m.igMatched ? 'Sim' : 'Não',
            m.igUsername || '',
            m.igInteractionScore ?? '',
        ]);

        const csv = [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
        const filename = groupId ? `whatsapp-grupo-${groupId}.csv` : `whatsapp-candidato-${candidateId}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

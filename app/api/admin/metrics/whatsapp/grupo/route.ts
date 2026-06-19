import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { parseOptionalNumber } from '@/lib/whatsapp-utils';

// Buscar todos os grupos de uma liderança
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const liderancaId = searchParams.get('liderancaId');
        const candidateId = searchParams.get('candidateId');

        if (!liderancaId && !candidateId) {
            return NextResponse.json({ error: 'Lideranca ID ou Candidate ID é obrigatório.' }, { status: 400 });
        }

        // Se passar liderança id, pega apenas dela. 
        // Se passar candidateId, pega todos os grupos do candidato.
        const whereClause: any = {};
        if (liderancaId) whereClause.liderancaId = liderancaId;
        if (candidateId) whereClause.candidateId = candidateId;

        const grupos = await prisma.whatsappGroup.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }
        });

        return NextResponse.json({ success: true, grupos });

    } catch (error: any) {
        console.error('Error fetching whatsapp grups:', error);
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

// Inserir/Atualizar um grupo manualmente via Mechanical Turk
export async function POST(req: Request) {
    try {
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!session || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });
        }

        const body = await req.json();
        const { 
            candidateId, liderancaId, grupoId, name, entryCount, exitCount, currentMembers, duplicateMembers,
            inviteLink, groupLeaderName, groupLeaderPhone, groupType, category, locationRegion, description,
            pollsCount
        } = body;

        if (!candidateId || !liderancaId || (!grupoId && !name)) {
            return NextResponse.json({ error: 'Candidate ID, Liderança ID e Nome/ID do Grupo são obrigatórios.' }, { status: 400 });
        }

        let grupo;

        if (grupoId) {
            const updateData: Record<string, unknown> = {
                isManual: true,
                lastUpdate: new Date(),
            };

            if (name) updateData.name = name;
            if (inviteLink !== undefined) updateData.inviteLink = inviteLink || null;
            if (groupLeaderName !== undefined) updateData.groupLeaderName = groupLeaderName || null;
            if (groupLeaderPhone !== undefined) updateData.groupLeaderPhone = groupLeaderPhone || null;
            if (groupType !== undefined) updateData.groupType = groupType;
            if (category !== undefined) updateData.category = category || null;
            if (locationRegion !== undefined) updateData.locationRegion = locationRegion || null;
            if (description !== undefined) updateData.description = description || null;
            if (candidateId) updateData.candidateId = candidateId;

            const ec = parseOptionalNumber(entryCount);
            const ex = parseOptionalNumber(exitCount);
            const cm = parseOptionalNumber(currentMembers);
            const dm = parseOptionalNumber(duplicateMembers);
            const pc = parseOptionalNumber(pollsCount);

            if (ec !== undefined) updateData.entryCount = ec;
            if (ex !== undefined) updateData.exitCount = ex;
            if (cm !== undefined) updateData.currentMembers = cm;
            if (dm !== undefined) updateData.duplicateMembers = dm;
            if (pc !== undefined && userRole === 'SUPER_ADMIN') updateData.pollsCount = pc;

            grupo = await prisma.whatsappGroup.update({
                where: { id: grupoId },
                data: updateData,
            });
        } else {
            // Create new
            grupo = await prisma.whatsappGroup.create({
                data: {
                    candidateId,
                    liderancaId,
                    name,
                    entryCount: parseOptionalNumber(entryCount) ?? 0,
                    exitCount: parseOptionalNumber(exitCount) ?? 0,
                    currentMembers: parseOptionalNumber(currentMembers) ?? 0,
                    duplicateMembers: parseOptionalNumber(duplicateMembers) ?? 0,
                    pollsCount: userRole === 'SUPER_ADMIN' ? (parseOptionalNumber(pollsCount) ?? 0) : 0,
                    inviteLink: inviteLink || null,
                    groupLeaderName: groupLeaderName || null,
                    groupLeaderPhone: groupLeaderPhone || null,
                    groupType: groupType || "ABERTO",
                    category: category || null,
                    locationRegion: locationRegion || null,
                    description: description || null,
                    isManual: true
                }
            });
        }

        return NextResponse.json({ success: true, grupo });

    } catch (error: any) {
        console.error('Error updating whatsapp group:', error);
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

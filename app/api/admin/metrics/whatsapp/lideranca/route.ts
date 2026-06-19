import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { parseOptionalNumber } from '@/lib/whatsapp-utils';

// Buscar todas as liderancas do candidato X ou Todas do Sistema (Para Admins)
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!candidateId && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Candidate ID é obrigatório para não-administradores.' }, { status: 400 });
        }

        const whereClause: any = candidateId ? { candidateIds: { has: candidateId } } : {};

        const liderancas = await (prisma.whatsappLideranca.findMany as any)({
            where: whereClause,
            orderBy: { name: 'asc' },
            include: { candidates: { include: { user: true } } } // Inclui infos dos candidatos vinculados
        });

        return NextResponse.json({ success: true, liderancas });

    } catch (error: any) {
        console.error('Error fetching whatsapp liderancas:', error);
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

// Inserir/Atualizar uma lideranca manualmente via Mechanical Turk
export async function POST(req: Request) {
    try {
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!session) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
        const isLider = userRole === 'LIDER_CHAPA';

        if (!isAdmin && !isLider) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const body = await req.json();
        const { 
            candidateId, liderancaId, name, entryCount, exitCount, currentMembers, duplicateMembers,
            whatsappHandle, instagramHandle, phone, email, profileImageUrl, region, neighborhood, segment, profession, influenceLevel, status
        } = body;

        if (!candidateId || (!liderancaId && !name)) {
            return NextResponse.json({ error: 'Candidate ID e Nome/ID da liderança são obrigatórios.' }, { status: 400 });
        }

        let lideranca;

        if (liderancaId) {
            // Update existing
            const existing = await (prisma.whatsappLideranca.findUnique as any)({ where: { id: liderancaId } });
            if (!existing) return NextResponse.json({ error: 'Liderança não encontrada.' }, { status: 404 });

            // REGRA: Apenas admin ou super admin pode mexer com as lideranças com múltiplos candidatos
            if (!isAdmin && (existing.candidateIds?.length || 0) > 1) {
                return NextResponse.json({ error: 'Apenas administradores podem gerenciar lideranças vinculadas a múltiplos candidatos.' }, { status: 403 });
            }

            lideranca = await (prisma.whatsappLideranca.update as any)({
                where: { id: liderancaId },
                data: {
                    name: name || undefined,
                    entryCount: parseOptionalNumber(entryCount),
                    exitCount: parseOptionalNumber(exitCount),
                    currentMembers: parseOptionalNumber(currentMembers),
                    duplicateMembers: parseOptionalNumber(duplicateMembers),
                    whatsappHandle: whatsappHandle !== undefined ? whatsappHandle : undefined,
                    instagramHandle: instagramHandle !== undefined ? instagramHandle : undefined,
                    phone: phone !== undefined ? phone : undefined,
                    email: email !== undefined ? email : undefined,
                    profileImageUrl: profileImageUrl !== undefined ? profileImageUrl : undefined,
                    region: region !== undefined ? region : undefined,
                    neighborhood: neighborhood !== undefined ? neighborhood : undefined,
                    segment: segment !== undefined ? segment : undefined,
                    profession: profession !== undefined ? profession : undefined,
                    influenceLevel: influenceLevel !== undefined ? Number(influenceLevel) : undefined,
                    status: status !== undefined ? status : undefined,
                    isManual: true,
                    lastUpdate: new Date(),
                    // Se estivermos mudando o candidato (raro mas possível), o líder só pode deixar com 1 se não for admin.
                    // Se for admin, garantimos que o candidateId enviado está na lista.
                    candidateIds: isAdmin 
                        ? { set: Array.from(new Set([...(existing.candidateIds || []), candidateId])) }
                        : [candidateId]
                }
            });

            // Sincronizar o outro lado da relação (CandidateProfile) para consistência no MongoDB
            if (candidateId) {
                try {
                    await prisma.candidateProfile.update({
                        where: { id: candidateId },
                        data: { whatsappLiderancaIds: { push: lideranca.id } }
                    });
                } catch(e) { /* Pode falhar se já existir, tudo bem em MongoDB/Prisma push dependendo da versão */ }
            }
        } else {
            // Create new
            lideranca = await (prisma.whatsappLideranca.create as any)({
                data: {
                    candidateIds: [candidateId],
                    name,
                    entryCount: parseOptionalNumber(entryCount) ?? 0,
                    exitCount: parseOptionalNumber(exitCount) ?? 0,
                    currentMembers: parseOptionalNumber(currentMembers) ?? 0,
                    duplicateMembers: parseOptionalNumber(duplicateMembers) ?? 0,
                    whatsappHandle: whatsappHandle || null,
                    instagramHandle: instagramHandle || null,
                    phone: phone || null,
                    email: email || null,
                    profileImageUrl: profileImageUrl || null,
                    region: region || null,
                    neighborhood: neighborhood || null,
                    segment: segment || null,
                    profession: profession || null,
                    influenceLevel: influenceLevel ? Number(influenceLevel) : null,
                    status: status || "ATIVO",
                    isManual: true
                }
            });

            // Sincronizar o outro lado da relação (CandidateProfile)
            await prisma.candidateProfile.update({
                where: { id: candidateId },
                data: { whatsappLiderancaIds: { push: lideranca.id } }
            });
        }

        return NextResponse.json({ success: true, lideranca });

    } catch (error: any) {
        console.error('Error updating whatsapp lideranca:', error);
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
    }
}

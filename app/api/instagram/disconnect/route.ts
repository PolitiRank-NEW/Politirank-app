import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export async function POST() {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const userId = session.user.id;

        // Tentar encontrar o perfil do candidato primeiro
        const candidateProfile = await prisma.candidateProfile.findUnique({
            where: { userId }
        });

        if (!candidateProfile) {
            return NextResponse.json({ error: 'Perfil de candidato não encontrado' }, { status: 404 });
        }

        // Deletar o perfil social associado
        await prisma.socialProfile.deleteMany({
            where: {
                candidateId: candidateProfile.id,
                platform: 'INSTAGRAM'
            }
        });

        // Limpar as lideranças geradas pra não sujar o dashboard
        await prisma.userInteraction.deleteMany({
            where: {
                candidateId: candidateProfile.id
            }
        });

        return NextResponse.json({ success: true, message: 'Conta desconectada com sucesso' });
    } catch (error) {
        console.error('Erro ao desconectar conta do Instagram:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

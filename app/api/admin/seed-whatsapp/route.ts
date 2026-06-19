import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { seedWhatsappMockData } from '@/lib/whatsapp-seed-data';

export async function POST(req: Request) {
  try {
    const session = await auth();
    // @ts-ignore
    const userRole = session?.user?.role;

    if (!session || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN')) {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas administradores podem executar este seed.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { candidateProfileId } = body;

    if (!candidateProfileId || typeof candidateProfileId !== 'string') {
      return NextResponse.json(
        { error: 'candidateProfileId é obrigatório.' },
        { status: 400 }
      );
    }

    // Injeta o singleton do Next.js para evitar múltiplas conexões
    const summary = await seedWhatsappMockData(candidateProfileId, prisma);

    return NextResponse.json({
      success: true,
      message: `Seed concluído: ${summary.liderancasCriadas} lideranças, ${summary.gruposCriados} grupos e ${summary.membrosCriados} pessoas criadas.`,
      summary,
    });
  } catch (error: any) {
    console.error('[seed-whatsapp] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';

export async function assertCandidateEvolutionAccess(candidateId: string) {
    const session = await auth();
    // @ts-expect-error next-auth session extension
    const userRole = session?.user?.role as string | undefined;
    // @ts-expect-error next-auth session extension
    const userId = session?.user?.id as string | undefined;

    if (!session || !userId) {
        return { error: 'Não autenticado.', status: 401 as const };
    }

    const profile = await prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        select: { id: true, userId: true, evolutionInstanceName: true },
    });

    if (!profile) {
        return { error: 'Candidato não encontrado.', status: 404 as const };
    }

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const isOwner = profile.userId === userId;

    if (!isAdmin && !isOwner) {
        return { error: 'Acesso negado.', status: 403 as const };
    }

    return { session, profile, isAdmin };
}

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { facebookService } from '@/services/facebookService';
import { SocialPlatform } from '@prisma/client';
import { APIFY_POSTS_LIMIT } from '@/lib/apify-limits';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const { searchParams } = new URL(request.url);
        const viewAsUserId = searchParams.get('viewAs');
        const isAdminViewing =
            (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!viewAsUserId;

        const user = isAdminViewing
            ? await prisma.user.findUnique({
                  where: { id: viewAsUserId! },
                  include: {
                      candidateProfile: {
                          include: {
                              socialProfiles: { where: { platform: SocialPlatform.FACEBOOK } },
                          },
                      },
                  },
              })
            : await prisma.user.findUnique({
                  where: { email: session.user.email },
                  include: {
                      candidateProfile: {
                          include: {
                              socialProfiles: { where: { platform: SocialPlatform.FACEBOOK } },
                          },
                      },
                  },
              });

        if (!user?.candidateProfile) {
            return NextResponse.json({ error: 'Perfil de candidato não encontrado.' }, { status: 404 });
        }

        const facebookProfile = user.candidateProfile.socialProfiles[0];
        if (!facebookProfile?.handle) {
            return NextResponse.json(
                { error: 'Página do Facebook não vinculada. Configure o handle primeiro.' },
                { status: 404 }
            );
        }

        const cleanHandle = facebookService.cleanHandle(facebookProfile.handle);

        console.log(`[FB SYNC] Iniciando Apify para ${cleanHandle} (limit=${APIFY_POSTS_LIMIT})...`);
        const runId = await facebookService.startPostsRun(cleanHandle, APIFY_POSTS_LIMIT);

        return NextResponse.json({
            useApify: true,
            status: 'RUNNING',
            runId,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('[FB SYNC] Erro ao iniciar:', error);
        return NextResponse.json(
            { error: 'Erro ao iniciar sincronização do Facebook.', details: message },
            { status: 500 }
        );
    }
}

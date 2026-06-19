import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { SocialPlatform } from '@prisma/client';

export async function POST(req: Request) {
    try {
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!session || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem inserir dados manualmente.' }, { status: 403 });
        }

        const body = await req.json();
        const { candidateId, platform, followers, postsCount, engagement, likes, comments, handle } = body;

        if (!candidateId || !platform) {
            return NextResponse.json({ error: 'Candidate ID e Platform são obrigatórios.' }, { status: 400 });
        }

        // Identify platform
        const platformEnum = platform.toUpperCase() as SocialPlatform;

        // Find candidate profile
        const candidateProfile = await prisma.candidateProfile.findUnique({
            where: { id: candidateId }
        });

        if (!candidateProfile) {
            return NextResponse.json({ error: 'Candidato não encontrado.' }, { status: 404 });
        }

        // Update or Create Manual Profile
        let socialProfile = await prisma.socialProfile.findFirst({
            where: {
                candidateId: candidateId,
                platform: platformEnum
            }
        });

        if (socialProfile) {
            // Atualiza perfil existente para os dados manuais
            socialProfile = await prisma.socialProfile.update({
                where: { id: socialProfile.id },
                data: {
                    handle: handle ? handle : socialProfile.handle,
                    followers: followers !== undefined ? Number(followers) : socialProfile.followers,
                    postsCount: postsCount !== undefined ? Number(postsCount) : socialProfile.postsCount,
                    engagement: engagement !== undefined ? Number(engagement) : socialProfile.engagement,
                    avgLikes: likes !== undefined ? Number(likes) : socialProfile.avgLikes,
                    isManual: true, // Mark as touched by Turk
                    lastUpdate: new Date()
                }
            });

            // Se há likes e comments manuais, podemos forçar um mock ou salvar JSON para o dashboard buscar, 
            // ou inserir posts dummy. A solução mais fácil é apenas salvar na flag rawApiData
            if (likes !== undefined || comments !== undefined) {
                const rawData = (socialProfile.rawApiData as any) || {};
                await prisma.socialProfile.update({
                    where: { id: socialProfile.id },
                    data: {
                        rawApiData: {
                            ...rawData,
                            manualLikes: likes !== undefined ? Number(likes) : rawData.manualLikes,
                            manualComments: comments !== undefined ? Number(comments) : rawData.manualComments,
                        }
                    }
                });
            }

        } else {
            // Create new profile for that platform manually
            socialProfile = await prisma.socialProfile.create({
                data: {
                    candidateId: candidateId,
                    platform: platformEnum,
                    handle: handle ? handle : `Manual_${platformEnum}`,
                    followers: followers !== undefined ? Number(followers) : 0,
                    postsCount: postsCount !== undefined ? Number(postsCount) : 0,
                    engagement: engagement !== undefined ? Number(engagement) : 0,
                    avgLikes: likes !== undefined ? Number(likes) : 0,
                    isManual: true,
                    rawApiData: {
                        manualLikes: likes !== undefined ? Number(likes) : 0,
                        manualComments: comments !== undefined ? Number(comments) : 0,
                    }
                }
            });
        }

        // Se for whatsapp, sincroniza no perfil mestre pra manter retro-compatibilidade do dashboard
        if (platformEnum === 'WHATSAPP' && followers !== undefined) {
            await prisma.candidateProfile.update({
                where: { id: candidateProfile.id },
                data: { whatsappMessages: Number(followers) } // Usamos followers do form mas representa msgs no antigo design
            });
        }

        return NextResponse.json({ success: true, socialProfile });

    } catch (error: any) {
        console.error('Error on mechanical turk api:', error);
        return NextResponse.json({ error: error.message || 'Erro interno do servidor.' }, { status: 500 });
    }
}

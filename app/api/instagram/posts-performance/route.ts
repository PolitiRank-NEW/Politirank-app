import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-ignore
        const callerRole = session?.user?.role;
        const { searchParams } = new URL(request.url);
        const viewAsUserId = searchParams.get('viewAs');
        
        let targetId = viewAsUserId;
        if ((callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !viewAsUserId) {
             const firstCandidate = await prisma.user.findFirst({ 
                 where: { 
                     role: 'CANDIDATO',
                     candidateProfile: {
                         socialProfiles: {
                             some: { platform: 'INSTAGRAM' }
                         }
                     }
                 },
                 orderBy: { createdAt: 'desc' }
             });
             if (firstCandidate) {
                  targetId = firstCandidate.id;
             }
        }
        const isAdminViewing = (callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN') && !!targetId;

        const user = isAdminViewing
            ? await prisma.user.findUnique({
                where: { id: targetId! },
                include: { candidateProfile: { include: { socialProfiles: { where: { platform: SocialPlatform.INSTAGRAM } } } } },
            })
            : await prisma.user.findUnique({
                where: { email: session.user.email },
                include: { candidateProfile: { include: { socialProfiles: { where: { platform: SocialPlatform.INSTAGRAM } } } } },
            });

        if (!user || !user.candidateProfile || user.candidateProfile.socialProfiles.length === 0) {
            return NextResponse.json({ error: 'Perfil do Instagram não configurado.' }, { status: 404 });
        }

        const instagramProfile = user.candidateProfile.socialProfiles[0];

        // Fetch top posts sorted by Comments + Likes
        const topPosts = await prisma.mediaPost.findMany({
            where: { socialProfileId: instagramProfile.id },
            orderBy: [
                { commentsCount: 'desc' },
                { likesCount: 'desc' }
            ],
            take: 15, // Let's bring top 15
            select: {
                id: true,
                metaMediaId: true,
                caption: true,
                mediaType: true,
                mediaUrl: true,
                permalink: true,
                likesCount: true,
                commentsCount: true,
                postedAt: true
            }
        });

        return NextResponse.json({
            success: true,
            topPosts
        });

    } catch (error: any) {
        console.error('API Error fetching post performance:', error);
        return NextResponse.json({ error: 'Erro interno ao buscar performance de posts.' }, { status: 500 });
    }
}

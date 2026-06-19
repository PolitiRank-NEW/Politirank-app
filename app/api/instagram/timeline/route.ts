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

        // Fetch recent posts to build timeline
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const posts = await prisma.mediaPost.findMany({
            where: {
                socialProfileId: instagramProfile.id
            },
            orderBy: { postedAt: 'asc' },
            select: {
                likesCount: true,
                commentsCount: true,
                postedAt: true
            }
        });

        // Aggregate by date (YYYY-MM-DD)
        const timelineMap = new Map<string, { dateStr: string, likes: number, comments: number, total: number }>();

        posts.forEach((post: any) => {
            const dateObj = new Date(post.postedAt);
            // Format as DD/MM snippet for charts
            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

            if (!timelineMap.has(dateStr)) {
                timelineMap.set(dateStr, { dateStr, likes: 0, comments: 0, total: 0 });
            }

            const entry = timelineMap.get(dateStr)!;
            entry.likes += post.likesCount;
            entry.comments += post.commentsCount;
            entry.total += (post.likesCount + post.commentsCount);
        });

        const timeline = Array.from(timelineMap.values());

        return NextResponse.json({
            success: true,
            timeline
        });

    } catch (error: any) {
        console.error('API Error fetching timeline:', error);
        return NextResponse.json({ error: 'Erro interno ao buscar timeline.' }, { status: 500 });
    }
}

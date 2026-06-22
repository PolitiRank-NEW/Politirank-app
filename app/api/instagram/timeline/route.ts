import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { resolveInstagramAnalyticsContext } from '@/lib/instagram-analytics-context';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const ctx = await resolveInstagramAnalyticsContext(session.user, {
            viewAsUserId: searchParams.get('viewAs'),
            socialProfileId: searchParams.get('socialProfileId'),
            igHandle: searchParams.get('igHandle'),
        });

        if (!ctx) {
            return NextResponse.json({ error: 'Perfil do Instagram não configurado.' }, { status: 404 });
        }

        const posts = await prisma.mediaPost.findMany({
            where: { socialProfileId: ctx.socialProfile.id },
            orderBy: { postedAt: 'asc' },
            select: {
                likesCount: true,
                commentsCount: true,
                postedAt: true,
            },
        });

        const timelineMap = new Map<
            string,
            { dateStr: string; likes: number; comments: number; total: number }
        >();

        posts.forEach((post) => {
            const dateObj = new Date(post.postedAt);
            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

            if (!timelineMap.has(dateStr)) {
                timelineMap.set(dateStr, { dateStr, likes: 0, comments: 0, total: 0 });
            }

            const entry = timelineMap.get(dateStr)!;
            entry.likes += post.likesCount;
            entry.comments += post.commentsCount;
            entry.total += post.likesCount + post.commentsCount;
        });

        return NextResponse.json({
            success: true,
            timeline: Array.from(timelineMap.values()),
            socialProfileId: ctx.socialProfile.id,
            selectedHandle: ctx.socialProfile.handle,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('API Error fetching timeline:', message);
        return NextResponse.json({ error: 'Erro interno ao buscar timeline.' }, { status: 500 });
    }
}

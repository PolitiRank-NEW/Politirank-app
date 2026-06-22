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

        const topPosts = await prisma.mediaPost.findMany({
            where: { socialProfileId: ctx.socialProfile.id },
            orderBy: [{ commentsCount: 'desc' }, { likesCount: 'desc' }],
            take: 15,
            select: {
                id: true,
                metaMediaId: true,
                caption: true,
                mediaType: true,
                mediaUrl: true,
                permalink: true,
                likesCount: true,
                commentsCount: true,
                postedAt: true,
            },
        });

        return NextResponse.json({
            success: true,
            topPosts,
            socialProfileId: ctx.socialProfile.id,
            selectedHandle: ctx.socialProfile.handle,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('API Error fetching post performance:', message);
        return NextResponse.json({ error: 'Erro interno ao buscar performance de posts.' }, { status: 500 });
    }
}

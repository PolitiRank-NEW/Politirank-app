import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { facebookService, parseCount } from '@/services/facebookService';

interface RankedEngager {
    name: string;
    profileUrl: string | null;
    comments: number;
    commentLikes: number;
    score: number;
}

// Quantos posts (mais recentes) terão os comentários coletados para o ranking.
const POSTS_FOR_COMMENTS = 12;

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const role = session?.user?.role;

    if (!session || role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Acesso restrito ao Super Admin.' }, { status: 403 });
    }

    let datasetId = '';
    try {
        const body = await request.json();
        datasetId = (body?.datasetId || '').toString();
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    if (!datasetId) {
        return NextResponse.json({ error: 'datasetId é obrigatório.' }, { status: 400 });
    }

    try {
        const rawPosts = await facebookService.fetchDatasetItems(datasetId);

        const firstItem: any = rawPosts[0];
        if (firstItem?.error && rawPosts.length === 1) {
            return NextResponse.json(
                { error: firstItem.errorDescription || 'A página pode ser inexistente ou privada.' },
                { status: 404 }
            );
        }

        const validPosts = rawPosts.filter((p: any) => p && (p.postId || p.url || p.postUrl || p.topLevelUrl));

        // Publicações (sem fotos): texto, reações, comentários, compartilhamentos, data, link
        const posts = validPosts.map((p: any) => {
            const url = p.url || p.postUrl || p.topLevelUrl || p.facebookUrl || '';
            const isVideo = p.hasVideo || !!p.videoUrl || p.media?.some?.((m: any) => m.__typename === 'Video');
            const isReel = p.isReel || p.reelFlag;
            return {
                id: String(p.postId || url),
                text: p.text || p.message || p.caption || '',
                type: isReel ? 'Reel' : isVideo ? 'Vídeo' : 'Post',
                likes: parseCount(p.likes ?? p.likesCount ?? p.reactionsCount ?? p.reaction_count),
                comments: parseCount(p.comments ?? p.commentsCount ?? p.comment_count),
                shares: parseCount(p.shares ?? p.sharesCount ?? p.share_count),
                timestamp: p.time || p.timestamp || p.date || p.postedAt || null,
                url,
            };
        });

        // Coleta comentários dos posts mais recentes para montar o ranking
        const topPostUrls = posts
            .filter((p) => p.url)
            .slice(0, POSTS_FOR_COMMENTS)
            .map((p) => p.url);

        const rawComments = await facebookService.fetchComments(topPostUrls, 50);

        const engagers: Record<string, RankedEngager> = {};
        let commentsAnalyzed = 0;

        for (const c of rawComments as any[]) {
            const name = (c.profileName || c.name || '').toString().trim();
            if (!name) continue;

            const key = (c.profileId || name).toString();
            const likes = parseCount(c.likesCount ?? c.likes);
            commentsAnalyzed++;

            if (!engagers[key]) {
                engagers[key] = {
                    name,
                    profileUrl: c.profileUrl || (c.profileId ? `https://www.facebook.com/${c.profileId}` : null),
                    comments: 0,
                    commentLikes: 0,
                    score: 0,
                };
            }
            engagers[key].comments += 1;
            engagers[key].commentLikes += likes;
            engagers[key].score += 1 + Math.log10(likes + 1);
        }

        const ranking = Object.values(engagers)
            .map((e) => ({ ...e, score: Number(e.score.toFixed(2)) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 100);

        return NextResponse.json({
            posts,
            ranking,
            meta: {
                postsAnalyzed: posts.length,
                postsScrapedForComments: topPostUrls.length,
                commentsAnalyzed,
                uniqueEngagers: Object.keys(engagers).length,
            },
        });
    } catch (e: any) {
        console.error('[FB Explore Result] Erro:', e);
        return NextResponse.json({ error: e.message || 'Erro ao processar os dados.' }, { status: 500 });
    }
}

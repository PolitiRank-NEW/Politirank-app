import { NextResponse } from 'next/server';
import { auth } from '@/auth';

interface RankedEngager {
    username: string;
    comments: number;
    commentLikes: number;
    score: number;
}

export async function POST(request: Request) {
    const session = await auth();
    // @ts-ignore
    const role = session?.user?.role;

    if (!session || role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Acesso restrito ao Super Admin.' }, { status: 403 });
    }

    let datasetId = '';
    let handle = '';
    try {
        const body = await request.json();
        datasetId = (body?.datasetId || '').toString();
        handle = (body?.handle || '').toString().replace('@', '').trim().toLowerCase();
    } catch {
        return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
    }

    if (!datasetId) {
        return NextResponse.json({ error: 'datasetId é obrigatório.' }, { status: 400 });
    }

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
        return NextResponse.json({ error: 'Token do Apify não configurado.' }, { status: 500 });
    }

    try {
        const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
        if (!res.ok) {
            return NextResponse.json({ error: 'Falha ao buscar os dados do Apify.' }, { status: 502 });
        }

        const items = await res.json();
        const rawPosts: any[] = Array.isArray(items) ? items : [];

        const firstItem = rawPosts[0];
        if (firstItem?.error) {
            return NextResponse.json(
                { error: firstItem.errorDescription || 'O perfil pode ser privado ou inexistente.' },
                { status: 404 }
            );
        }

        const validPosts = rawPosts.filter((p) => p && (p.id || p.shortCode));

        // Dados do perfil (extraídos do primeiro post disponível)
        let profile: any = null;
        const fp = validPosts[0];
        if (fp) {
            profile = {
                username: fp.ownerUsername || handle,
                fullName: fp.ownerFullName || null,
                followers: fp.ownerFollowers ?? firstItem?.followersCount ?? null,
                postsCount: fp.ownerPostsCount ?? firstItem?.postsCount ?? null,
            };
        }

        // Publicações (sem foto): legenda, curtidas, comentários, data, link
        const posts = validPosts.map((p) => ({
            id: String(p.id || p.shortCode),
            caption: p.caption || '',
            type: p.type === 'Video' ? 'Vídeo' : p.type === 'Sidecar' ? 'Carrossel' : 'Imagem',
            likes: p.likesCount || 0,
            comments: p.commentsCount || 0,
            timestamp: p.timestamp || null,
            url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
        }));

        // Ranking de engajadores a partir dos comentários extraídos
        const engagers: Record<string, RankedEngager> = {};
        let commentsAnalyzed = 0;

        for (const p of validPosts) {
            const comments: any[] = p.latestComments || [];
            for (const c of comments) {
                const username = (c.ownerUsername || c.owner?.username || '').toString();
                if (!username || username.toLowerCase() === handle) continue;

                const likes = c.likesCount || 0;
                commentsAnalyzed++;

                if (!engagers[username]) {
                    engagers[username] = { username, comments: 0, commentLikes: 0, score: 0 };
                }
                engagers[username].comments += 1;
                engagers[username].commentLikes += likes;
                // Peso: 1 ponto por comentário + bônus logarítmico pelas curtidas no comentário
                engagers[username].score += 1 + Math.log10(likes + 1);
            }
        }

        const ranking = Object.values(engagers)
            .map((e) => ({ ...e, score: Number(e.score.toFixed(2)) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 100);

        return NextResponse.json({
            profile,
            posts,
            ranking,
            meta: {
                postsAnalyzed: posts.length,
                commentsAnalyzed,
                uniqueEngagers: Object.keys(engagers).length,
            },
        });
    } catch (e: any) {
        console.error('[Explore Result] Erro ao processar dataset:', e);
        return NextResponse.json({ error: e.message || 'Erro ao processar os dados.' }, { status: 500 });
    }
}

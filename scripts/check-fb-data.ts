import { PrismaClient, SocialPlatform } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

async function main() {
    const handleFilter = process.argv[2]?.toLowerCase();

    const profiles = await prisma.socialProfile.findMany({
        where: {
            platform: SocialPlatform.FACEBOOK,
            ...(handleFilter ? { handle: { contains: handleFilter, mode: 'insensitive' } } : {}),
        },
        include: {
            candidate: { include: { user: { select: { name: true, email: true } } } },
        },
    });

    if (profiles.length === 0) {
        console.log('Nenhum perfil Facebook encontrado.');
        return;
    }

    for (const p of profiles) {
        const postCount = await prisma.mediaPost.count({
            where: { socialProfileId: p.id },
        });

        const commentCount = await prisma.comment.count({
            where: { mediaPost: { socialProfileId: p.id }, isFromCandidate: false },
        });

        const raw = (p.rawApiData || {}) as Record<string, unknown>;
        const profileRaw = (raw.profile || {}) as Record<string, unknown>;
        const ranking = Array.isArray(raw.lastRanking) ? raw.lastRanking : [];
        const meta = (raw.lastMeta || {}) as Record<string, unknown>;

        console.log('---');
        console.log('Candidato:', p.candidate?.user?.name, '|', p.candidate?.user?.email);
        console.log('Handle:', p.handle);
        console.log('Seguidores (socialProfile):', p.followers);
        console.log('Seguidores (rawApiData):', profileRaw.followers);
        console.log('Fonte seguidores:', profileRaw.followersSource);
        console.log('Posts salvos (mediaPost):', postCount);
        console.log('Posts no perfil (campo):', p.postsCount);
        console.log('Comentarios salvos (Comment):', commentCount);
        console.log('Ranking no cache (lastRanking):', ranking.length, 'pessoas');
        console.log('lastMeta.commentsAnalyzed:', meta.commentsAnalyzed);
        console.log('lastMeta.postsAnalyzed:', meta.postsAnalyzed);
        console.log('lastSyncedAt:', raw.lastSyncedAt);

        if (ranking.length > 0) {
            console.log('Top 3 engajadores:', JSON.stringify(ranking.slice(0, 3)));
        }

        const posts = await prisma.mediaPost.findMany({
            where: { socialProfileId: p.id },
            include: { _count: { select: { comments: true } } },
            orderBy: { postedAt: 'desc' },
            take: 5,
        });

        console.log('Posts recentes:');
        for (const post of posts) {
            const date = post.postedAt.toISOString().slice(0, 10);
            console.log(
                `  - ${date} | likes: ${post.likesCount} | comments IG field: ${post.commentsCount} | comentarios DB: ${post._count.comments} | ${(post.caption || 'sem texto').slice(0, 40)}`
            );
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

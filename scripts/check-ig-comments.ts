import { PrismaClient, SocialPlatform } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

async function main() {
    const handleFilter = process.argv[2]?.toLowerCase();

    const profiles = await prisma.socialProfile.findMany({
        where: {
            platform: SocialPlatform.INSTAGRAM,
            ...(handleFilter ? { handle: { contains: handleFilter, mode: 'insensitive' } } : {}),
        },
        include: {
            candidate: { include: { user: { select: { name: true, email: true } } } },
        },
    });

    if (profiles.length === 0) {
        console.log('Nenhum perfil Instagram encontrado.');
        return;
    }

    for (const p of profiles) {
        const commentCount = await prisma.comment.count({
            where: { mediaPost: { socialProfileId: p.id }, isFromCandidate: false },
        });

        const raw = (p.rawApiData || {}) as Record<string, unknown>;
        const ranking = Array.isArray(raw.lastRanking) ? raw.lastRanking : [];
        const meta = (raw.lastMeta || {}) as Record<string, unknown>;

        console.log('---');
        console.log('Candidato:', p.candidate?.user?.name, '|', p.candidate?.user?.email);
        console.log('Handle:', p.handle);
        console.log('Posts no perfil:', p.postsCount);
        console.log('Comentarios salvos (Comment):', commentCount);
        console.log('Ranking no cache (lastRanking):', ranking.length, 'pessoas');
        console.log('lastMeta.commentsAnalyzed:', meta.commentsAnalyzed);
        console.log('lastSyncedAt:', raw.lastSyncedAt);

        if (ranking.length > 0) {
            console.log('Top 3 engajadores:', JSON.stringify(ranking.slice(0, 3)));
        }

        const postsWithComments = await prisma.mediaPost.findMany({
            where: { socialProfileId: p.id },
            include: { _count: { select: { comments: true } } },
            orderBy: { postedAt: 'desc' },
            take: 5,
        });

        console.log('Posts recentes x comentarios no DB:');
        for (const post of postsWithComments) {
            console.log(
                `  - ${post.metaMediaId.slice(0, 14)}... | comentarios DB: ${post._count.comments} | commentsCount post: ${post.commentsCount}`
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

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

async function main() {
    const users = await prisma.user.findMany({
        where: { candidateProfile: { isNot: null } },
        include: {
            candidateProfile: {
                include: { socialProfiles: true },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    let i = 0;
    for (const u of users) {
        i++;
        const cp = u.candidateProfile!;
        const ig = cp.socialProfiles.find((p) => p.platform === 'INSTAGRAM');
        const fb = cp.socialProfiles.find((p) => p.platform === 'FACEBOOK');
        const postCount = ig
            ? await prisma.mediaPost.count({ where: { socialProfileId: ig.id } })
            : 0;
        const raw = (ig?.rawApiData || {}) as Record<string, unknown>;
        const ranking = Array.isArray(raw.lastRanking) ? raw.lastRanking : [];

        console.log('--- Candidato', i);
        console.log('userId:', u.id);
        console.log('nome:', u.name, '| email:', u.email);
        console.log('candidateId:', cp.id);
        console.log(
            'IG id:',
            ig?.id || '-',
            '| handle:',
            ig?.handle || '-',
            '| followers:',
            ig?.followers,
            '| posts DB:',
            postCount,
            '| ranking:',
            ranking.length
        );
        console.log(
            'FB id:',
            fb?.id || '-',
            '| handle:',
            fb?.handle || '-',
            '| followers:',
            fb?.followers
        );
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

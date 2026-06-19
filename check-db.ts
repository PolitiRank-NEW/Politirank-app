import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const profiles = await prisma.socialProfile.findMany({
        where: { platform: 'INSTAGRAM' },
        select: { handle: true, followers: true, postsCount: true, engagement: true, rawApiData: true }
    });

    fs.writeFileSync('out.json', JSON.stringify(profiles, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

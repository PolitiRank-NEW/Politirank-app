/**
 * Copia dados de sync IG/FB de um candidato para outro (sem Apify).
 * Uso: npx tsx scripts/copy-candidate-social-data.ts <emailOrigem> <emailDestino>
 *
 * Exemplo (teste Aline → conta real):
 * npx tsx scripts/copy-candidate-social-data.ts candidato2@chapa2.com aline.teixiera@politirank.com
 */
import { PrismaClient, Prisma, SocialPlatform } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

type RawApiData = {
    profile?: Record<string, unknown>;
    lastRanking?: unknown[];
    lastMeta?: Record<string, unknown>;
    lastSyncedAt?: string;
};

async function copyPlatformProfile(
    sourceProfileId: string,
    targetProfileId: string,
    targetCandidateId: string,
    platform: SocialPlatform
) {
    const source = await prisma.socialProfile.findUnique({ where: { id: sourceProfileId } });
    if (!source) {
        console.log(`[${platform}] Origem não encontrada, pulando.`);
        return { postsMoved: 0, snapshotsMoved: 0 };
    }

    const target = await prisma.socialProfile.findUnique({ where: { id: targetProfileId } });
    if (!target) {
        console.log(`[${platform}] Destino não encontrado, pulando.`);
        return { postsMoved: 0, snapshotsMoved: 0 };
    }

    const raw = (source.rawApiData || {}) as RawApiData;
    const profileInRaw = raw.profile || {};
    const updatedRaw: RawApiData = {
        ...raw,
        profile: {
            ...profileInRaw,
            username: target.handle.replace(/^@/, ''),
        },
        lastSyncedAt: raw.lastSyncedAt || new Date().toISOString(),
    };

    await prisma.socialProfile.update({
        where: { id: targetProfileId },
        data: {
            followers: source.followers,
            following: source.following,
            postsCount: source.postsCount,
            avgLikes: source.avgLikes,
            engagement: source.engagement,
            rawApiData: updatedRaw as Prisma.InputJsonValue,
            lastUpdate: source.lastUpdate,
        },
    });

    const postsMoved = await prisma.mediaPost.updateMany({
        where: { socialProfileId: sourceProfileId },
        data: { socialProfileId: targetProfileId },
    });

    const snapshotsMoved = await prisma.socialSyncSnapshot.updateMany({
        where: { socialProfileId: sourceProfileId },
        data: {
            socialProfileId: targetProfileId,
            candidateId: targetCandidateId,
        },
    });

    console.log(
        `[${platform}] Perfil atualizado | posts movidos: ${postsMoved.count} | snapshots: ${snapshotsMoved.count} | ranking: ${Array.isArray(updatedRaw.lastRanking) ? updatedRaw.lastRanking.length : 0}`
    );

    return { postsMoved: postsMoved.count, snapshotsMoved: snapshotsMoved.count };
}

async function copyCandidateMetrics(sourceCandidateId: string, targetCandidateId: string) {
    const source = await prisma.candidateProfile.findUnique({
        where: { id: sourceCandidateId },
    });
    if (!source) return;

    await prisma.candidateProfile.update({
        where: { id: targetCandidateId },
        data: {
            instagramFollowers: source.instagramFollowers,
            instagramMentions: source.instagramMentions,
            instagramComments: source.instagramComments,
            facebookFollowers: source.facebookFollowers,
            facebookMentions: source.facebookMentions,
            facebookComments: source.facebookComments,
            lastMetricUpdate: source.lastMetricUpdate ?? new Date(),
        },
    });
    console.log('[CandidateProfile] Métricas copiadas.');
}

async function moveUserInteractions(sourceCandidateId: string, targetCandidateId: string) {
    const interactions = await prisma.userInteraction.findMany({
        where: { candidateId: sourceCandidateId },
    });

    let moved = 0;
    let merged = 0;

    for (const row of interactions) {
        const existing = await prisma.userInteraction.findUnique({
            where: {
                username_candidateId: {
                    username: row.username,
                    candidateId: targetCandidateId,
                },
            },
        });

        if (existing) {
            await prisma.userInteraction.update({
                where: { id: existing.id },
                data: {
                    interactionScore: existing.interactionScore + row.interactionScore,
                    lastInteractedAt:
                        row.lastInteractedAt > existing.lastInteractedAt
                            ? row.lastInteractedAt
                            : existing.lastInteractedAt,
                },
            });
            await prisma.userInteraction.delete({ where: { id: row.id } });
            merged++;
        } else {
            await prisma.userInteraction.update({
                where: { id: row.id },
                data: { candidateId: targetCandidateId },
            });
            moved++;
        }
    }

    console.log(`[UserInteraction] Movidos: ${moved} | mesclados: ${merged}`);
}

async function clearSourceProfile(sourceProfileId: string, platform: SocialPlatform) {
    await prisma.socialProfile.update({
        where: { id: sourceProfileId },
        data: {
            followers: 0,
            postsCount: 0,
            rawApiData: null,
            lastUpdate: new Date(),
        },
    });
    console.log(`[${platform}] Perfil de origem zerado (dados transferidos).`);
}

async function resolveByEmail(email: string) {
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            candidateProfile: {
                include: { socialProfiles: true },
            },
        },
    });
    if (!user?.candidateProfile) {
        throw new Error(`Candidato não encontrado para email: ${email}`);
    }
    return { user, candidate: user.candidateProfile };
}

async function main() {
    const sourceEmail = process.argv[2] || 'candidato2@chapa2.com';
    const targetEmail = process.argv[3] || 'aline.teixiera@politirank.com';

    console.log(`Origem:  ${sourceEmail}`);
    console.log(`Destino: ${targetEmail}`);
    console.log('---');

    const source = await resolveByEmail(sourceEmail);
    const target = await resolveByEmail(targetEmail);

    const sourceIg = source.candidate.socialProfiles.find((p) => p.platform === SocialPlatform.INSTAGRAM);
    const sourceFb = source.candidate.socialProfiles.find((p) => p.platform === SocialPlatform.FACEBOOK);
    const targetIg = target.candidate.socialProfiles.find((p) => p.platform === SocialPlatform.INSTAGRAM);
    const targetFb = target.candidate.socialProfiles.find((p) => p.platform === SocialPlatform.FACEBOOK);

    if (!sourceIg || !targetIg) {
        throw new Error('Perfis Instagram de origem e/ou destino não encontrados.');
    }

    if (sourceIg.handle.replace(/^@/, '').toLowerCase() !== targetIg.handle.replace(/^@/, '').toLowerCase()) {
        console.warn(
            `AVISO: handles IG diferentes (origem: ${sourceIg.handle}, destino: ${targetIg.handle}) — continuando mesmo assim.`
        );
    }

    await copyPlatformProfile(
        sourceIg.id,
        targetIg.id,
        target.candidate.id,
        SocialPlatform.INSTAGRAM
    );

    if (sourceFb && targetFb) {
        await copyPlatformProfile(
            sourceFb.id,
            targetFb.id,
            target.candidate.id,
            SocialPlatform.FACEBOOK
        );
    }

    await copyCandidateMetrics(source.candidate.id, target.candidate.id);
    await moveUserInteractions(source.candidate.id, target.candidate.id);

    await clearSourceProfile(sourceIg.id, SocialPlatform.INSTAGRAM);
    if (sourceFb) {
        await clearSourceProfile(sourceFb.id, SocialPlatform.FACEBOOK);
    }

    const commentCount = await prisma.comment.count({
        where: { mediaPost: { socialProfileId: targetIg.id } },
    });

    console.log('---');
    console.log('Concluído!');
    console.log(`Destino: ${target.user.name} (${targetEmail})`);
    console.log(`IG @${targetIg.handle} — posts: ${targetIg.postsCount} (comentários DB: ${commentCount})`);
}

main()
    .catch((e) => {
        console.error('Erro:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

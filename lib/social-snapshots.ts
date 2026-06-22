import { prisma } from '@/app/lib/prisma';
import { Prisma, SocialPlatform } from '@prisma/client';

export const MAX_SOCIAL_SNAPSHOTS = 24;

export type SnapshotPayload = {
    profile: unknown;
    posts: unknown;
    ranking: unknown;
    meta: unknown;
};

export function snapshotToTrackerResponse(snapshot: {
    id: string;
    syncedAt: Date;
    profile: unknown;
    posts: unknown;
    ranking: unknown;
    meta: unknown;
}) {
    return {
        hasCachedData: true,
        isSnapshot: true,
        snapshotId: snapshot.id,
        snapshotAt: snapshot.syncedAt.toISOString(),
        profile: snapshot.profile,
        posts: snapshot.posts,
        ranking: snapshot.ranking,
        meta: snapshot.meta,
        lastSyncedAt: snapshot.syncedAt.toISOString(),
    };
}

export async function createSocialSnapshot(
    socialProfileId: string,
    candidateId: string,
    platform: SocialPlatform,
    payload: SnapshotPayload,
    createdById?: string | null
) {
    const snapshot = await prisma.socialSyncSnapshot.create({
        data: {
            socialProfileId,
            candidateId,
            platform,
            profile: payload.profile as Prisma.InputJsonValue,
            posts: payload.posts as Prisma.InputJsonValue,
            ranking: payload.ranking as Prisma.InputJsonValue,
            meta: payload.meta as Prisma.InputJsonValue,
            createdById: createdById || null,
        },
    });

    const excess = await prisma.socialSyncSnapshot.findMany({
        where: { socialProfileId },
        orderBy: { syncedAt: 'desc' },
        skip: MAX_SOCIAL_SNAPSHOTS,
        select: { id: true },
    });

    if (excess.length > 0) {
        await prisma.socialSyncSnapshot.deleteMany({
            where: { id: { in: excess.map((s) => s.id) } },
        });
    }

    return snapshot;
}

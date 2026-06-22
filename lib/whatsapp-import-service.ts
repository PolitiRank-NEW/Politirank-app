import { prisma } from '@/app/lib/prisma';
import { mapCsvRowToMember, normalizeMemberForDb, memberRowKey } from '@/lib/whatsapp-csv-import';

type NormalizedMember = ReturnType<typeof normalizeMemberForDb>;

type ImportResult = {
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
};

function buildCreateData(groupId: string, normalized: NormalizedMember, isSuperAdmin: boolean) {
    return {
        groupId,
        name: normalized.name,
        phone: normalized.phone,
        instagramHandle: normalized.instagramHandle,
        facebookHandle: normalized.facebookHandle,
        isManual: true,
        ...(normalized.joinedAt ? { joinedAt: normalized.joinedAt } : {}),
        ...(isSuperAdmin
            ? {
                  pollVotes: normalized.pollVotes,
                  ...(normalized.pollVotesDetail ? { pollVotesDetail: normalized.pollVotesDetail } : {}),
              }
            : {}),
        ...(normalized.igInteractionScore != null
            ? { igInteractionScore: normalized.igInteractionScore, igMatched: true }
            : {}),
        ...(normalized.fbInteractionScore != null
            ? { fbInteractionScore: normalized.fbInteractionScore, fbMatched: true }
            : {}),
    };
}

export async function importMembersToGroup(
    groupId: string,
    rows: Record<string, unknown>[],
    options: {
        skipDuplicates?: boolean;
        updateExisting?: boolean;
        isSuperAdmin?: boolean;
        existingMembers?: { id: string; phone?: string | null; name?: string | null }[];
    } = {}
): Promise<ImportResult> {
    const skipDuplicates = options.skipDuplicates !== false;
    const updateExisting = options.updateExisting === true;
    const isSuperAdmin = options.isSuperAdmin === true;

    const existingMembers =
        options.existingMembers ||
        (await prisma.whatsappGroupMember.findMany({
            where: { groupId },
            select: { id: true, phone: true, name: true },
        }));

    const existingByKey = new Map<string, string>();
    for (const m of existingMembers) {
        const key = memberRowKey(m.phone, m.name);
        if (key) existingByKey.set(key, m.id);
    }

    const seenInFile = new Set<string>();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        const mapped = mapCsvRowToMember(rows[i]);
        const normalized = normalizeMemberForDb(mapped);

        if (!normalized.name && !normalized.phone) {
            skipped++;
            errors.push(`Linha ${i + 2}: sem nome e telefone.`);
            continue;
        }

        const key = memberRowKey(normalized.phone, normalized.name);

        if (key && seenInFile.has(key)) {
            skipped++;
            continue;
        }
        if (key) seenInFile.add(key);

        const existingId = key ? existingByKey.get(key) : undefined;

        if (existingId && updateExisting) {
            try {
                const updateData: Record<string, unknown> = {
                    name: normalized.name,
                    phone: normalized.phone,
                    instagramHandle: normalized.instagramHandle,
                    facebookHandle: normalized.facebookHandle,
                    updatedAt: new Date(),
                };
                if (normalized.joinedAt) updateData.joinedAt = normalized.joinedAt;
                if (isSuperAdmin) {
                    updateData.pollVotes = normalized.pollVotes;
                    if (normalized.pollVotesDetail) updateData.pollVotesDetail = normalized.pollVotesDetail;
                }
                if (normalized.igInteractionScore != null) {
                    updateData.igInteractionScore = normalized.igInteractionScore;
                    updateData.igMatched = true;
                }
                if (normalized.fbInteractionScore != null) {
                    updateData.fbInteractionScore = normalized.fbInteractionScore;
                    updateData.fbMatched = true;
                }

                await prisma.whatsappGroupMember.update({
                    where: { id: existingId },
                    data: updateData,
                });
                updated++;
            } catch (err: unknown) {
                skipped++;
                const msg = err instanceof Error ? err.message : 'erro desconhecido';
                errors.push(`Linha ${i + 2}: ${msg}`);
            }
            continue;
        }

        if (existingId && skipDuplicates) {
            skipped++;
            continue;
        }

        try {
            await prisma.whatsappGroupMember.create({
                data: buildCreateData(groupId, normalized, isSuperAdmin),
            });
            created++;
            if (key) existingByKey.set(key, 'new');
        } catch (err: unknown) {
            skipped++;
            const msg = err instanceof Error ? err.message : 'erro desconhecido';
            errors.push(`Linha ${i + 2}: ${msg}`);
        }
    }

    if (created > 0) {
        await prisma.whatsappGroup.update({
            where: { id: groupId },
            data: {
                currentMembers: { increment: created },
                lastUpdate: new Date(),
            },
        });
    }

    return { created, updated, skipped, errors };
}

export async function resolveGroupIdByName(
    candidateId: string,
    groupName: string
): Promise<string | null> {
    const normalized = groupName.trim().toLowerCase();
    if (!normalized) return null;

    const group = await prisma.whatsappGroup.findFirst({
        where: {
            candidateId,
            name: { equals: groupName.trim(), mode: 'insensitive' },
        },
        select: { id: true },
    });

    return group?.id || null;
}

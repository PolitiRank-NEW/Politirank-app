/**
 * Snapshot CSV → PoliticRank: aplica foto completa de membros por grupo (diff automático).
 * Formato mínimo: grupo, telefone [, nome]
 * Opcional: votos enquete, histórico enquetes (mesmo contrato do import de membros).
 */
import { prisma } from '@/app/lib/prisma';
import { mapCsvRowToMember, normalizeMemberForDb } from '@/lib/whatsapp-csv-import';
import { ensureAutoLideranca } from '@/lib/whatsapp-group-live-sync';
import { aggregateUniqueWhatsappMetrics } from '@/lib/whatsapp-metrics';
import { cleanPhone } from '@/lib/whatsapp-utils';

function phoneKey(phone: string | null | undefined): string | null {
    const digits = cleanPhone(phone || '');
    if (!digits || digits.length < 8) return null;
    if (digits.startsWith('55') && digits.length >= 12) return digits.slice(-11);
    if (digits.length >= 11) return digits.slice(-11);
    return digits;
}

export type SnapshotImportResult = {
    groupsTouched: number;
    groupsCreated: number;
    membersCreated: number;
    membersRemoved: number;
    membersKept: number;
    entries: number;
    exits: number;
    uniqueMembers: number;
    duplicatePhones: number;
    totalSeats: number;
    errors: string[];
};

async function resolveOrCreateGroup(
    candidateId: string,
    liderancaId: string,
    groupName: string
): Promise<{ id: string; created: boolean }> {
    const name = groupName.trim();
    const existing = await prisma.whatsappGroup.findFirst({
        where: { candidateId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await prisma.whatsappGroup.create({
        data: {
            name,
            candidateId,
            liderancaId,
            isManual: true,
            currentMembers: 0,
            lastUpdate: new Date(),
        } as never,
    });
    return { id: created.id, created: true };
}

/**
 * Para cada grupo presente no CSV, a lista de membros vira a verdade:
 * - telefone novo → cria (+ entrada)
 * - telefone sumiu do CSV → remove (+ saída), exceto isManual se preserveManual=true
 */
export async function applyMembershipSnapshot(
    candidateId: string,
    rows: Record<string, unknown>[],
    opts?: { preserveManual?: boolean; isSuperAdmin?: boolean }
): Promise<SnapshotImportResult> {
    const preserveManual = opts?.preserveManual !== false;
    const isSuperAdmin = opts?.isSuperAdmin === true;
    const errors: string[] = [];

    const byGroup = new Map<
        string,
        Array<{ phone: string; phoneKey: string; name: string | null; pollVotes?: number; pollVotesDetail?: unknown }>
    >();

    for (let i = 0; i < rows.length; i++) {
        const mapped = mapCsvRowToMember(rows[i]);
        const groupName = mapped.groupName.trim();
        const normalized = normalizeMemberForDb(mapped);
        const key = phoneKey(normalized.phone);
        if (!groupName) {
            errors.push(`Linha ${i + 2}: sem grupo.`);
            continue;
        }
        if (!key) {
            errors.push(`Linha ${i + 2}: telefone inválido.`);
            continue;
        }
        if (!byGroup.has(groupName)) byGroup.set(groupName, []);
        const list = byGroup.get(groupName)!;
        if (list.some((m) => m.phoneKey === key)) continue;
        list.push({
            phone: normalized.phone || key,
            phoneKey: key,
            name: normalized.name || null,
            ...(isSuperAdmin
                ? {
                      pollVotes: normalized.pollVotes,
                      pollVotesDetail: normalized.pollVotesDetail || undefined,
                  }
                : {}),
        });
    }

    const lideranca = await ensureAutoLideranca(candidateId);
    let groupsCreated = 0;
    let membersCreated = 0;
    let membersRemoved = 0;
    let membersKept = 0;
    let entries = 0;
    let exits = 0;

    for (const [groupName, csvMembers] of byGroup) {
        const { id: groupId, created } = await resolveOrCreateGroup(
            candidateId,
            lideranca.id,
            groupName
        );
        if (created) groupsCreated += 1;

        const existing = await prisma.whatsappGroupMember.findMany({
            where: { groupId },
            select: { id: true, phone: true, isManual: true },
        });

        const existingByKey = new Map<string, { id: string; isManual: boolean }>();
        for (const m of existing) {
            const k = phoneKey(m.phone);
            if (k) existingByKey.set(k, { id: m.id, isManual: Boolean(m.isManual) });
        }

        const csvKeys = new Set(csvMembers.map((m) => m.phoneKey));

        for (const row of csvMembers) {
            const hit = existingByKey.get(row.phoneKey);
            if (hit) {
                membersKept += 1;
                if (isSuperAdmin && (row.pollVotes != null || row.pollVotesDetail)) {
                    await prisma.whatsappGroupMember.update({
                        where: { id: hit.id },
                        data: {
                            ...(row.name ? { name: row.name } : {}),
                            ...(row.pollVotes != null ? { pollVotes: row.pollVotes } : {}),
                            ...(row.pollVotesDetail
                                ? { pollVotesDetail: row.pollVotesDetail as never }
                                : {}),
                        } as never,
                    });
                }
                continue;
            }

            await prisma.whatsappGroupMember.create({
                data: {
                    groupId,
                    phone: row.phone,
                    name: row.name,
                    isManual: false,
                    joinedAt: new Date(),
                    ...(isSuperAdmin && row.pollVotes != null ? { pollVotes: row.pollVotes } : {}),
                    ...(isSuperAdmin && row.pollVotesDetail
                        ? { pollVotesDetail: row.pollVotesDetail as never }
                        : {}),
                } as never,
            });
            membersCreated += 1;
            entries += 1;
        }

        for (const m of existing) {
            const k = phoneKey(m.phone);
            if (!k || csvKeys.has(k)) continue;
            if (preserveManual && m.isManual) continue;
            await prisma.whatsappGroupMember.delete({ where: { id: m.id } });
            membersRemoved += 1;
            exits += 1;
        }

        const count = await prisma.whatsappGroupMember.count({ where: { groupId } });
        const createdHere = csvMembers.filter((c) => !existingByKey.has(c.phoneKey)).length;
        const removedHere = existing.filter((m) => {
            const k = phoneKey(m.phone);
            if (!k || csvKeys.has(k)) return false;
            if (preserveManual && m.isManual) return false;
            return true;
        }).length;

        const groupData: Record<string, unknown> = {
            currentMembers: count,
            lastUpdate: new Date(),
        };
        if (createdHere > 0) groupData.entryCount = { increment: createdHere };
        if (removedHere > 0) groupData.exitCount = { increment: removedHere };

        await prisma.whatsappGroup.update({
            where: { id: groupId },
            data: groupData as never,
        });
    }

    const groupsForMetrics = await prisma.whatsappGroup.findMany({
        where: { candidateId },
        select: {
            entryCount: true,
            entryCountSync: true,
            exitCount: true,
            members: { select: { phone: true } },
            _count: { select: { members: true } },
        },
    });
    const metrics = aggregateUniqueWhatsappMetrics(groupsForMetrics);
    await prisma.whatsappLideranca.update({
        where: { id: lideranca.id },
        data: {
            currentMembers: metrics.uniqueMembers,
            duplicateMembers: metrics.duplicatePhones,
            entryCount: metrics.entries,
            entryCountSync: metrics.entriesSync,
            exitCount: metrics.exits,
            lastUpdate: new Date(),
        } as never,
    });

    return {
        groupsTouched: byGroup.size,
        groupsCreated,
        membersCreated,
        membersRemoved,
        membersKept,
        entries,
        exits,
        uniqueMembers: metrics.uniqueMembers,
        duplicatePhones: metrics.duplicatePhones,
        totalSeats: metrics.totalSeats,
        errors: errors.slice(0, 40),
    };
}

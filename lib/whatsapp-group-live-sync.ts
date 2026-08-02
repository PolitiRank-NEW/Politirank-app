/**
 * Sync leve e em tempo real de grupos WhatsApp via Evolution.
 * - Webhook: grupo novo + entradas/saídas pontuais
 * - Cron horário: lista grupos + reconcilia só os que mudaram de tamanho
 */
import { prisma } from '@/app/lib/prisma';
import { evolutionService } from '@/services/evolutionService';

export const AUTO_LIDERANCA_NAME = 'Grupos WhatsApp (Evolution)';

/** Máx. de grupos com fetch de participantes por rodada do cron (protege Evolution). */
export const CRON_MEMBER_RECONCILE_LIMIT = 40;

function jidToPhone(jid: string): string | null {
    if (!jid) return null;
    const raw = jid.split('@')[0];
    if (!raw || raw.includes('-') || !/^\d+$/.test(raw)) return raw || null;
    return raw;
}

function phonesMatchDigits(a: string | null | undefined, b: string | null | undefined): boolean {
    const x = (a || '').replace(/\D/g, '');
    const y = (b || '').replace(/\D/g, '');
    if (!x || !y) return false;
    if (x === y) return true;
    return x.length >= 8 && y.length >= 8 && (x.endsWith(y) || y.endsWith(x));
}

export async function ensureAutoLideranca(candidateId: string) {
    let lideranca = await prisma.whatsappLideranca.findFirst({
        where: { name: AUTO_LIDERANCA_NAME, candidateIds: { has: candidateId } } as never,
    });
    if (!lideranca) {
        lideranca = await prisma.whatsappLideranca.create({
            data: {
                name: AUTO_LIDERANCA_NAME,
                candidateIds: [candidateId],
                status: 'ATIVO',
                isManual: false,
            } as never,
        });
    }
    return lideranca;
}

export type EvolutionGroupShell = {
    id: string;
    subject?: string;
    size?: number;
    desc?: string;
};

/** Cria ou atualiza casca do grupo (sem baixar todos os membros). */
export async function upsertGroupShell(
    candidateId: string,
    group: EvolutionGroupShell
): Promise<{ dbId: string; created: boolean; name: string }> {
    const lideranca = await ensureAutoLideranca(candidateId);
    const groupJid = group.id;
    const name = group.subject || groupJid;

    const existing = await prisma.whatsappGroup.findFirst({
        where: { candidateId, groupId: groupJid },
        select: { id: true },
    });

    if (!existing) {
        const created = await prisma.whatsappGroup.create({
            data: {
                name,
                liderancaId: lideranca.id,
                candidateId,
                groupId: groupJid,
                description: group.desc || null,
                currentMembers: group.size || 0,
                isManual: false,
            } as never,
        });
        return { dbId: created.id, created: true, name };
    }

    await prisma.whatsappGroup.update({
        where: { id: existing.id },
        data: {
            name,
            description: group.desc || undefined,
            currentMembers: typeof group.size === 'number' ? group.size : undefined,
            isManual: false,
            liderancaId: lideranca.id,
            lastUpdate: new Date(),
        } as never,
    });
    return { dbId: existing.id, created: false, name };
}

type ParticipantRef = {
    phone: string | null;
    waLid: string | null;
    name: string | null;
};

function parseParticipantRefs(data: {
    participants?: unknown;
    participantsData?: unknown;
}): ParticipantRef[] {
    const out: ParticipantRef[] = [];

    if (Array.isArray(data.participantsData)) {
        for (const p of data.participantsData as Array<Record<string, unknown>>) {
            const phone = jidToPhone(String(p.phoneNumber || p.id || p.jid || ''));
            const waLid = jidToPhone(String(p.id || p.jid || ''));
            const name = String(p.name || p.pushName || p.notify || '').trim() || null;
            if (!phone && !waLid) continue;
            out.push({ phone: phone || waLid, waLid, name });
        }
        if (out.length) return out;
    }

    if (Array.isArray(data.participants)) {
        for (const raw of data.participants) {
            if (typeof raw === 'string') {
                const phone = jidToPhone(raw);
                out.push({ phone, waLid: phone, name: null });
                continue;
            }
            const p = raw as Record<string, unknown>;
            const phone = jidToPhone(String(p.phoneNumber || p.id || p.jid || ''));
            const waLid = jidToPhone(String(p.id || p.jid || ''));
            const name = String(p.name || p.pushName || '').trim() || null;
            if (!phone && !waLid) continue;
            out.push({ phone: phone || waLid, waLid, name });
        }
    }

    return out;
}

/**
 * Webhook GROUP_PARTICIPANTS_UPDATE: action add | remove | promote | demote
 */
export async function handleGroupParticipantsUpdate(
    candidateId: string,
    payload: {
        id?: string;
        participants?: unknown;
        participantsData?: unknown;
        action?: string;
    }
) {
    const groupJid = payload.id;
    if (!groupJid?.endsWith('@g.us')) {
        return { ignored: 'not a group' as const };
    }

    const action = String(payload.action || '').toLowerCase();
    if (action !== 'add' && action !== 'remove') {
        return { ignored: 'action not tracked' as const, action };
    }

    let group = await prisma.whatsappGroup.findFirst({
        where: { candidateId, groupId: groupJid },
        select: { id: true, name: true, liderancaId: true, currentMembers: true },
    });

    if (!group) {
        const shell = await upsertGroupShell(candidateId, { id: groupJid, subject: groupJid });
        group = {
            id: shell.dbId,
            name: shell.name,
            liderancaId: (await ensureAutoLideranca(candidateId)).id,
            currentMembers: 0,
        };
    }

    const refs = parseParticipantRefs(payload);
    if (refs.length === 0) {
        return { ignored: 'no participants' as const };
    }

    let entries = 0;
    let exits = 0;

    for (const ref of refs) {
        const phone = (ref.phone || '').replace(/\D/g, '') || null;
        const waLid = (ref.waLid || '').replace(/\D/g, '') || null;
        if (!phone && !waLid) continue;

        if (action === 'add') {
            const existing = await prisma.whatsappGroupMember.findFirst({
                where: {
                    groupId: group.id,
                    OR: [
                        ...(phone ? [{ phone }] : []),
                        ...(waLid ? [{ waLid }] : []),
                    ],
                },
            });
            if (existing) {
                if (ref.name && !existing.name) {
                    await prisma.whatsappGroupMember.update({
                        where: { id: existing.id },
                        data: { name: ref.name },
                    });
                }
                continue;
            }
            await prisma.whatsappGroupMember.create({
                data: {
                    groupId: group.id,
                    phone,
                    waLid,
                    name: ref.name,
                    joinedAt: new Date(),
                    isManual: false,
                } as never,
            });
            entries += 1;
        } else {
            const members = await prisma.whatsappGroupMember.findMany({
                where: { groupId: group.id, isManual: false },
                select: { id: true, phone: true, waLid: true },
            });
            const toDelete = members.filter((m) => {
                if (phone && phonesMatchDigits(m.phone, phone)) return true;
                if (waLid && m.waLid && m.waLid === waLid) return true;
                return false;
            });
            if (toDelete.length === 0) continue;
            await prisma.whatsappGroupMember.deleteMany({
                where: { id: { in: toDelete.map((m) => m.id) } },
            });
            exits += toDelete.length;
        }
    }

    if (entries > 0 || exits > 0) {
        const memberCount = await prisma.whatsappGroupMember.count({ where: { groupId: group.id } });
        const groupData: Record<string, unknown> = {
            currentMembers: memberCount,
            lastUpdate: new Date(),
        };
        if (entries > 0) groupData.entryCount = { increment: entries };
        if (exits > 0) groupData.exitCount = { increment: exits };
        await prisma.whatsappGroup.update({
            where: { id: group.id },
            data: groupData as never,
        });

        const lidData: Record<string, unknown> = { lastUpdate: new Date() };
        if (entries > 0) lidData.entryCount = { increment: entries };
        if (exits > 0) lidData.exitCount = { increment: exits };
        await prisma.whatsappLideranca.update({
            where: { id: group.liderancaId },
            data: lidData as never,
        });
    }

    return {
        success: true as const,
        group: group.name,
        action,
        entries,
        exits,
    };
}

/** Webhook GROUPS_UPSERT / GROUPS_UPDATE */
export async function handleGroupsUpsertOrUpdate(candidateId: string, data: unknown) {
    const items = Array.isArray(data) ? data : [data];
    const results: Array<{ name: string; created: boolean }> = [];

    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const g = raw as Record<string, unknown>;
        const id = String(g.id || g.jid || '');
        if (!id.endsWith('@g.us')) continue;

        const result = await upsertGroupShell(candidateId, {
            id,
            subject: typeof g.subject === 'string' ? g.subject : undefined,
            size: typeof g.size === 'number' ? g.size : undefined,
            desc: typeof g.desc === 'string' ? g.desc : undefined,
        });
        results.push({ name: result.name, created: result.created });

        // Grupo novo: busca membros só deste grupo (leve)
        if (result.created) {
            const profile = await prisma.candidateProfile.findUnique({
                where: { id: candidateId },
                select: { evolutionInstanceName: true },
            });
            if (profile?.evolutionInstanceName) {
                // Só popula membros; não conta como "entrada" (já estavam no grupo)
                await reconcileGroupMembers(profile.evolutionInstanceName, result.dbId, id, {
                    countAsEntries: false,
                });
            }
        }
    }

    return { success: true as const, groups: results };
}

/**
 * Reconcilia membros de UM grupo: entradas/saídas vs lista atual da Evolution.
 */
export async function reconcileGroupMembers(
    instanceName: string,
    groupDbId: string,
    groupJid: string,
    opts?: { countAsEntries?: boolean }
) {
    const group = await prisma.whatsappGroup.findUnique({
        where: { id: groupDbId },
        select: { id: true, liderancaId: true },
    });
    if (!group) return { entries: 0, exits: 0, members: 0 };

    let participants: Array<{ id?: string; phoneNumber?: string; name?: string | null; pushName?: string | null }> =
        [];
    try {
        participants = (await evolutionService.fetchGroupParticipants(instanceName, groupJid)) as typeof participants;
    } catch (err) {
        console.warn(`[live-sync] participantes falhou ${groupJid}:`, err);
        return { entries: 0, exits: 0, members: 0, error: true as const };
    }

    const live: ParticipantRef[] = [];
    for (const p of participants) {
        const phone = jidToPhone(p.phoneNumber || p.id || '');
        const waLid = jidToPhone(p.id || '');
        const name = (p.name || p.pushName || '').trim() || null;
        if (!phone && !waLid) continue;
        live.push({ phone: phone || waLid, waLid, name });
    }

    const existing = await prisma.whatsappGroupMember.findMany({
        where: { groupId: groupDbId },
        select: { id: true, phone: true, waLid: true, isManual: true, name: true },
    });

    const matchedExisting = new Set<string>();
    let entries = 0;
    let exits = 0;

    for (const ref of live) {
        const phone = (ref.phone || '').replace(/\D/g, '') || null;
        const waLid = (ref.waLid || '').replace(/\D/g, '') || null;
        const found = existing.find((m) => {
            if (phone && phonesMatchDigits(m.phone, phone)) return true;
            if (waLid && m.waLid && m.waLid === waLid) return true;
            return false;
        });
        if (found) {
            matchedExisting.add(found.id);
            if (ref.name && !found.name) {
                await prisma.whatsappGroupMember.update({
                    where: { id: found.id },
                    data: { name: ref.name },
                });
            }
            continue;
        }
        await prisma.whatsappGroupMember.create({
            data: {
                groupId: groupDbId,
                phone,
                waLid,
                name: ref.name,
                joinedAt: new Date(),
                isManual: false,
            } as never,
        });
        if (opts?.countAsEntries !== false) entries += 1;
    }

    for (const m of existing) {
        if (m.isManual) continue;
        if (matchedExisting.has(m.id)) continue;
        await prisma.whatsappGroupMember.delete({ where: { id: m.id } });
        exits += 1;
    }

    const memberCount = await prisma.whatsappGroupMember.count({ where: { groupId: groupDbId } });
    const groupData: Record<string, unknown> = {
        currentMembers: memberCount,
        lastUpdate: new Date(),
    };
    if (entries > 0) groupData.entryCount = { increment: entries };
    if (exits > 0) groupData.exitCount = { increment: exits };
    await prisma.whatsappGroup.update({
        where: { id: groupDbId },
        data: groupData as never,
    });

    if (entries > 0 || exits > 0) {
        const lidData: Record<string, unknown> = { lastUpdate: new Date() };
        if (entries > 0) lidData.entryCount = { increment: entries };
        if (exits > 0) lidData.exitCount = { increment: exits };
        await prisma.whatsappLideranca.update({
            where: { id: group.liderancaId },
            data: lidData as never,
        });
    }

    return { entries, exits, members: memberCount };
}

/**
 * Sync horário leve para um candidato:
 * 1) lista todos os grupos (sem membros)
 * 2) cria/atualiza cascas
 * 3) reconcilia participantes só onde o tamanho mudou / grupo novo (cap)
 */
export async function runLightHourlySync(candidateId: string, instanceName: string) {
    const allGroups = (await evolutionService.fetchAllGroups(instanceName, false)) as EvolutionGroupShell[];
    const onlyGroups = allGroups.filter((g) => g.id?.endsWith('@g.us'));

    const lideranca = await ensureAutoLideranca(candidateId);
    let createdGroups = 0;
    let updatedGroups = 0;

    const existing = await prisma.whatsappGroup.findMany({
        where: { candidateId, isManual: false },
        select: { id: true, groupId: true, currentMembers: true, name: true },
    });
    const byJid = new Map(existing.filter((g) => g.groupId).map((g) => [g.groupId as string, g]));

    const reconcileQueue: Array<{ dbId: string; jid: string; name: string; isNew: boolean }> = [];

    for (const g of onlyGroups) {
        const prev = byJid.get(g.id);
        const size = typeof g.size === 'number' ? g.size : null;

        if (!prev) {
            const shell = await upsertGroupShell(candidateId, g);
            createdGroups += 1;
            reconcileQueue.push({ dbId: shell.dbId, jid: g.id, name: shell.name, isNew: true });
            continue;
        }

        const name = g.subject || prev.name;
        await prisma.whatsappGroup.update({
            where: { id: prev.id },
            data: {
                name,
                currentMembers: size ?? prev.currentMembers,
                liderancaId: lideranca.id,
                lastUpdate: new Date(),
            } as never,
        });
        updatedGroups += 1;

        const sizeMismatch = size !== null && size !== prev.currentMembers;
        const noMembersYet = size !== null && size > 0 && prev.currentMembers === 0;
        if (sizeMismatch || noMembersYet) {
            reconcileQueue.push({ dbId: prev.id, jid: g.id, name, isNew: noMembersYet && !sizeMismatch });
        }
    }

    // Remove grupos automáticos que sumiram da conta
    const liveJids = new Set(onlyGroups.map((g) => g.id));
    const gone = existing.filter((g) => g.groupId && !liveJids.has(g.groupId));
    if (gone.length > 0) {
        const ids = gone.map((g) => g.id);
        await prisma.whatsappGroupMember.deleteMany({ where: { groupId: { in: ids } } });
        await prisma.whatsappGroup.deleteMany({ where: { id: { in: ids } } });
    }

    const toReconcile = reconcileQueue.slice(0, CRON_MEMBER_RECONCILE_LIMIT);
    let totalEntries = 0;
    let totalExits = 0;
    let reconciled = 0;

    for (const item of toReconcile) {
        const r = await reconcileGroupMembers(instanceName, item.dbId, item.jid, {
            // Grupo novo / primeira carga: só popula. Diferença de tamanho: conta entrada/saída.
            countAsEntries: !item.isNew,
        });
        totalEntries += r.entries;
        totalExits += r.exits;
        reconciled += 1;
    }

    const aggMembers = await prisma.whatsappGroupMember.count({
        where: { group: { candidateId, isManual: false } },
    });
    await prisma.whatsappLideranca.update({
        where: { id: lideranca.id },
        data: { currentMembers: aggMembers, lastUpdate: new Date() } as never,
    });

    return {
        success: true as const,
        totalGroupsInAccount: onlyGroups.length,
        createdGroups,
        updatedGroups,
        removedGroups: gone.length,
        reconciledGroups: reconciled,
        pendingReconcile: Math.max(0, reconcileQueue.length - reconciled),
        entries: totalEntries,
        exits: totalExits,
        currentMembers: aggMembers,
    };
}

export async function runLightHourlySyncForAllCandidates() {
    const profiles = await prisma.candidateProfile.findMany({
        where: { evolutionInstanceName: { not: null } },
        select: { id: true, evolutionInstanceName: true },
    });

    const results = [];
    for (const p of profiles) {
        if (!p.evolutionInstanceName) continue;
        try {
            const r = await runLightHourlySync(p.id, p.evolutionInstanceName);
            results.push({ candidateId: p.id, instance: p.evolutionInstanceName, ...r });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[light-sync] falha ${p.evolutionInstanceName}:`, message);
            results.push({
                candidateId: p.id,
                instance: p.evolutionInstanceName,
                success: false,
                error: message,
            });
        }
    }
    return results;
}

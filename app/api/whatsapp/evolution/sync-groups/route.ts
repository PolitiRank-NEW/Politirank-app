import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { evolutionService } from '@/services/evolutionService';

export const maxDuration = 300;

const AUTO_LIDERANCA_NAME = 'Grupos WhatsApp (Evolution)';
const PARTICIPANT_CONCURRENCY = 8;
const DEFAULT_MEMBER_BATCH = 25;

/** Cache curto de nomes por instância (evita rebaixar 1k+ contatos a cada lote). */
const contactNameCache = new Map<string, { at: number; map: Map<string, string> }>();
const CONTACT_CACHE_MS = 3 * 60 * 1000;

async function getContactNameMap(instanceName: string): Promise<Map<string, string>> {
    const hit = contactNameCache.get(instanceName);
    if (hit && Date.now() - hit.at < CONTACT_CACHE_MS) return hit.map;
    try {
        const contacts = await evolutionService.fetchContacts(instanceName);
        const map = buildContactNameMap(contacts);

        // Completa com pushNames já capturados em hits do Scanner
        const profile = await prisma.candidateProfile.findFirst({
            where: { evolutionInstanceName: instanceName },
            select: { id: true },
        });
        if (profile) {
            const scanHits = await prisma.whatsappScanHit.findMany({
                where: {
                    pushName: { not: null },
                    group: { candidateId: profile.id },
                },
                select: { phone: true, pushName: true },
                orderBy: { matchedAt: 'desc' },
                take: 2000,
            });
            for (const h of scanHits) {
                const phone = (h.phone || '').replace(/\D/g, '');
                const name = (h.pushName || '').trim();
                if (!phone || !name) continue;
                if (!map.has(phone)) map.set(phone, name);
            }
        }

        contactNameCache.set(instanceName, { at: Date.now(), map });
        return map;
    } catch (err) {
        console.warn('[sync-groups] findContacts falhou; seguindo sem nomes:', err);
        return hit?.map || new Map();
    }
}

interface EvolutionGroup {
    id: string;
    subject?: string;
    subjectOwner?: string;
    size?: number;
    desc?: string;
}

interface EvolutionParticipant {
    id: string;
    phoneNumber?: string;
    admin?: string | null;
    name?: string | null;
    pushName?: string | null;
    notify?: string | null;
}

function jidToPhone(jid: string): string | null {
    if (!jid) return null;
    const raw = jid.split('@')[0];
    if (!raw || raw.includes('-') || !/^\d+$/.test(raw)) return raw || null;
    return raw;
}

/** Mapa telefone (só dígitos) -> nome a partir dos contatos Evolution. */
function buildContactNameMap(
    contacts: Array<{ remoteJid?: string; pushName?: string | null; name?: string | null }>
): Map<string, string> {
    const map = new Map<string, string>();
    for (const c of contacts) {
        const phone = jidToPhone(c.remoteJid || '');
        const label = (c.pushName || c.name || '').trim();
        if (!phone || !label) continue;
        map.set(phone, label);
        // também chave sem 55 para match flexível
        if (phone.startsWith('55') && phone.length > 12) {
            map.set(phone.slice(2), label);
        }
    }
    return map;
}

function resolveParticipantName(
    p: EvolutionParticipant,
    phone: string | null,
    contactNames: Map<string, string>
): string | null {
    const fromApi = (p.name || p.pushName || p.notify || '').trim();
    if (fromApi) return fromApi;
    if (!phone) return null;
    return contactNames.get(phone) || (phone.startsWith('55') ? contactNames.get(phone.slice(2)) : undefined) || null;
}

function phonesMatchDigits(a: string | null | undefined, b: string | null | undefined): boolean {
    const x = (a || '').replace(/\D/g, '');
    const y = (b || '').replace(/\D/g, '');
    if (!x || !y) return false;
    if (x === y) return true;
    return x.length >= 8 && y.length >= 8 && (x.endsWith(y) || y.endsWith(x));
}

async function mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    }
    const n = Math.min(concurrency, Math.max(items.length, 1));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
}

async function ensureLideranca(candidateId: string) {
    let lideranca = await prisma.whatsappLideranca.findFirst({
        where: { name: AUTO_LIDERANCA_NAME, candidateIds: { has: candidateId } } as any,
    });
    if (!lideranca) {
        lideranca = await prisma.whatsappLideranca.create({
            data: {
                name: AUTO_LIDERANCA_NAME,
                candidateIds: [candidateId],
                status: 'ATIVO',
                isManual: false,
            } as any,
        });
    }
    return lideranca;
}

/** Fase rápida: cria/atualiza todos os grupos sem participantes. */
async function syncGroupShells(
    candidateId: string,
    liderancaId: string,
    targetGroups: EvolutionGroup[]
) {
    const existing = await prisma.whatsappGroup.findMany({
        where: { candidateId, isManual: false },
        select: { id: true, groupId: true },
    });
    const byJid = new Map(existing.filter((g) => g.groupId).map((g) => [g.groupId as string, g.id]));
    const seenJids = new Set<string>();
    const summary: Array<{ name: string; groupId: string; dbId: string }> = [];

    // Upsert em lotes (metadados só — bem rápido)
    const CHUNK = 40;
    for (let i = 0; i < targetGroups.length; i += CHUNK) {
        const slice = targetGroups.slice(i, i + CHUNK);
        await Promise.all(
            slice.map(async (g) => {
                const groupJid = g.id;
                const name = g.subject || groupJid;
                seenJids.add(groupJid);
                const prevId = byJid.get(groupJid);

                if (!prevId) {
                    const created = await prisma.whatsappGroup.create({
                        data: {
                            name,
                            liderancaId,
                            candidateId,
                            groupId: groupJid,
                            description: g.desc || null,
                            currentMembers: g.size || 0,
                            isManual: false,
                        } as any,
                    });
                    summary.push({ name, groupId: groupJid, dbId: created.id });
                    return;
                }

                await prisma.whatsappGroup.update({
                    where: { id: prevId },
                    data: {
                        name,
                        currentMembers: g.size || 0,
                        isManual: false,
                        liderancaId,
                    } as any,
                });
                summary.push({ name, groupId: groupJid, dbId: prevId });
            })
        );
    }

    // Remove grupos automáticos que sumiram da conta
    const toRemove = existing.filter((g) => g.groupId && !seenJids.has(g.groupId));
    if (toRemove.length > 0) {
        const ids = toRemove.map((g) => g.id);
        await prisma.whatsappGroupMember.deleteMany({ where: { groupId: { in: ids } } });
        await prisma.whatsappGroup.deleteMany({ where: { id: { in: ids } } });
    }

    return summary;
}

/** Fase membros: um lote de grupos, participantes em paralelo. */
async function syncMembersBatch(
    instanceName: string,
    groups: Array<{ id: string; groupId: string | null; name: string }>,
    contactNames: Map<string, string>
) {
    const results = await mapPool(groups, PARTICIPANT_CONCURRENCY, async (group) => {
        if (!group.groupId) {
            return { name: group.name, groupId: '', members: 0 };
        }
        try {
            const participants = (await evolutionService.fetchGroupParticipants(
                instanceName,
                group.groupId
            )) as EvolutionParticipant[];

            const rows: Array<{
                groupId: string;
                phone: string;
                waLid: string | null;
                name: string | null;
                isManual: boolean;
            }> = [];

            for (const p of participants) {
                const phone = jidToPhone(p.phoneNumber || p.id);
                const waLid = jidToPhone(p.id);
                if (!phone) continue;
                rows.push({
                    groupId: group.id,
                    phone,
                    waLid,
                    name: resolveParticipantName(p, phone, contactNames),
                    isManual: false,
                });
            }

            // Troca rápida: limpa e recria o lote do grupo
            await prisma.whatsappGroupMember.deleteMany({ where: { groupId: group.id } });
            if (rows.length > 0) {
                const MCHUNK = 100;
                for (let i = 0; i < rows.length; i += MCHUNK) {
                    await prisma.whatsappGroupMember.createMany({
                        data: rows.slice(i, i + MCHUNK) as any,
                    });
                }
            }

            await prisma.whatsappGroup.update({
                where: { id: group.id },
                data: { currentMembers: rows.length || participants.length } as any,
            });

            // Reaproveita nomes já vistos em hits do Scanner (ex.: seu pushName ao postar)
            const hits = await prisma.whatsappScanHit.findMany({
                where: { groupId: group.id, pushName: { not: null } },
                select: { phone: true, waLid: true, pushName: true },
                orderBy: { matchedAt: 'desc' },
                take: 200,
            });
            for (const hit of hits) {
                if (!hit.pushName) continue;
                const member = rows.find((r) => {
                    if (hit.phone && (r.phone === hit.phone || phonesMatchDigits(r.phone, hit.phone)))
                        return true;
                    if (hit.waLid && r.waLid === hit.waLid) return true;
                    return false;
                });
                if (!member || member.name) continue;
                await prisma.whatsappGroupMember.updateMany({
                    where: { groupId: group.id, phone: member.phone },
                    data: { name: hit.pushName },
                });
            }

            return { name: group.name, groupId: group.groupId, members: rows.length };
        } catch (err) {
            console.warn(`[sync-groups] participantes falhou em ${group.name}:`, err);
            return { name: group.name, groupId: group.groupId, members: 0 };
        }
    });

    return results;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            candidateId,
            limit,
            groupNameQuery,
            groupJids,
            syncAll = false,
            mode = 'full',
            batchOffset = 0,
            batchSize = DEFAULT_MEMBER_BATCH,
        } = body as {
            candidateId?: string;
            limit?: number;
            groupNameQuery?: string;
            groupJids?: string[];
            syncAll?: boolean;
            mode?: 'groups' | 'members' | 'full';
            batchOffset?: number;
            batchSize?: number;
        };

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const instanceName = access.profile.evolutionInstanceName;
        if (!instanceName) {
            return NextResponse.json(
                { error: 'Instância não configurada. Conecte o WhatsApp primeiro.' },
                { status: 400 }
            );
        }

        const lideranca = await ensureLideranca(candidateId);

        // Fase membros: usa só o que já está no Mongo (sem relistar Evolution a cada lote)
        if (mode === 'members') {
            const dbGroups = await prisma.whatsappGroup.findMany({
                where: { candidateId, isManual: false, groupId: { not: null } },
                select: { id: true, groupId: true, name: true },
                orderBy: { name: 'asc' },
            });

            if (dbGroups.length === 0) {
                return NextResponse.json(
                    { error: 'Nenhum grupo listado ainda. Rode a fase groups primeiro.' },
                    { status: 400 }
                );
            }

            const size = Math.min(Math.max(Number(batchSize) || DEFAULT_MEMBER_BATCH, 1), 50);
            const offset = Math.max(Number(batchOffset) || 0, 0);
            const slice = dbGroups.slice(offset, offset + size);

            // Contatos da Evolution trazem pushName (a lista de participantes quase sempre vem sem nome)
            const contactNames = await getContactNameMap(instanceName);

            const memberSummary = await syncMembersBatch(instanceName, slice, contactNames);

            const nextOffset = offset + slice.length;
            const hasMoreMembers = nextOffset < dbGroups.length;
            const totalMembersBatch = memberSummary.reduce((a, s) => a + s.members, 0);

            if (!hasMoreMembers) {
                const agg = await prisma.whatsappGroupMember.count({
                    where: { group: { candidateId, isManual: false } },
                });
                await prisma.whatsappLideranca.update({
                    where: { id: lideranca.id },
                    data: { currentMembers: agg, lastUpdate: new Date() } as any,
                });
            }

            return NextResponse.json({
                success: true,
                phase: 'members',
                message: hasMoreMembers
                    ? `Membros: lote ${offset + 1}–${nextOffset} de ${dbGroups.length} grupos (${totalMembersBatch} nesta leva).`
                    : `Sincronização concluída: ${dbGroups.length} grupo(s).`,
                totalGroupsInAccount: dbGroups.length,
                syncedGroups: dbGroups.length,
                batchOffset: offset,
                nextOffset,
                hasMoreMembers,
                groups: memberSummary,
            });
        }

        const allGroups = (await evolutionService.fetchAllGroups(instanceName, false)) as EvolutionGroup[];
        if (allGroups.length === 0) {
            return NextResponse.json({ error: 'Nenhum grupo encontrado na conta conectada.' }, { status: 404 });
        }

        const onlyGroups = allGroups.filter((g) => g.id?.endsWith('@g.us'));

        let targetGroups: EvolutionGroup[];
        if (syncAll) {
            targetGroups = onlyGroups;
        } else if (Array.isArray(groupJids) && groupJids.length > 0) {
            const set = new Set(groupJids);
            targetGroups = onlyGroups.filter((g) => set.has(g.id));
        } else if (groupNameQuery && groupNameQuery.trim()) {
            const q = groupNameQuery.trim().toLowerCase();
            targetGroups = onlyGroups.filter((g) => (g.subject || '').toLowerCase().includes(q));
        } else {
            const groupLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
            targetGroups = [...onlyGroups]
                .sort((a, b) => (b.size || 0) - (a.size || 0))
                .slice(0, groupLimit);
        }

        if (targetGroups.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum grupo encontrado para sincronizar.' },
                { status: 404 }
            );
        }

        // --- Fase 1: cascas dos grupos (rápida) ---
        const shells = await syncGroupShells(candidateId, lideranca.id, targetGroups);

        if (mode === 'groups') {
            return NextResponse.json({
                success: true,
                phase: 'groups',
                message: `${shells.length} grupo(s) listado(s). Carregando membros em lotes…`,
                totalGroupsInAccount: onlyGroups.length,
                syncedGroups: shells.length,
                groups: shells.map((s) => ({ name: s.name, groupId: s.groupId, members: 0 })),
                nextOffset: 0,
                hasMoreMembers: shells.length > 0,
            });
        }

        // mode === 'full': membros de todos (em um request — use batches no cliente se possível)
        const dbGroups = await prisma.whatsappGroup.findMany({
            where: {
                candidateId,
                isManual: false,
                groupId: { in: targetGroups.map((g) => g.id) },
            },
            select: { id: true, groupId: true, name: true },
            orderBy: { name: 'asc' },
        });

        const contactNames = await getContactNameMap(instanceName);

        const memberSummary = await syncMembersBatch(instanceName, dbGroups, contactNames);
        const totalMembers = memberSummary.reduce((a, s) => a + s.members, 0);
        await prisma.whatsappLideranca.update({
            where: { id: lideranca.id },
            data: { currentMembers: totalMembers, lastUpdate: new Date() } as any,
        });

        return NextResponse.json({
            success: true,
            phase: 'full',
            message: `${dbGroups.length} grupo(s) sincronizado(s) — ${totalMembers} membro(s).`,
            totalGroupsInAccount: onlyGroups.length,
            syncedGroups: dbGroups.length,
            hasMoreMembers: false,
            nextOffset: dbGroups.length,
            groups: memberSummary,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[sync-groups]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

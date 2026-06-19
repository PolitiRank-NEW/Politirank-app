import { prisma } from '@/app/lib/prisma';

export function parseOptionalNumber(val: unknown): number | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
}

export function normalizeIgHandle(handle: string | null | undefined): string | null {
    if (!handle) return null;
    return handle.replace(/^@/, '').trim().toLowerCase() || null;
}

export function cleanPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    return phone.replace(/\D/g, '') || null;
}

type SessionUser = { id?: string; role?: string };

export async function getGroupWithAccess(groupId: string, user: SessionUser) {
    const group = await prisma.whatsappGroup.findUnique({
        where: { id: groupId },
        include: {
            lideranca: true,
            members: { orderBy: { name: 'asc' } },
        },
    });

    if (!group) return { group: null, allowed: false, reason: 'Grupo não encontrado.' };

    const role = user.role;
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

    if (isAdmin) return { group, allowed: true };

    if (role === 'LIDER_CHAPA' && user.id) {
        const lideranca = group.lideranca;
        if (lideranca?.userId === user.id) {
            return { group, allowed: true };
        }
        const linked = await prisma.whatsappLideranca.findFirst({
            where: { id: group.liderancaId, userId: user.id },
        });
        if (linked) return { group, allowed: true };
    }

    if (role === 'CANDIDATO' && user.id) {
        const profile = await prisma.candidateProfile.findFirst({
            where: { userId: user.id, id: group.candidateId },
        });
        if (profile) return { group, allowed: true, readOnly: true };
    }

    return { group, allowed: false, reason: 'Acesso negado a este grupo.' };
}

export async function crossReferenceMembersByIg(candidateId: string) {
    const members = await prisma.whatsappGroupMember.findMany({
        where: {
            group: { candidateId },
            instagramHandle: { not: null },
        },
        include: { group: { include: { lideranca: true } } },
    });

    const interactions = await prisma.userInteraction.findMany({
        where: { candidateId },
    });

    const igMap = new Map<string, (typeof interactions)[0]>();
    for (const i of interactions) {
        const key = normalizeIgHandle(i.username);
        if (key) igMap.set(key, i);
    }

    let matched = 0;
    for (const m of members) {
        const key = normalizeIgHandle(m.instagramHandle);
        if (!key) continue;
        const hit = igMap.get(key);
        if (hit) {
            await prisma.whatsappGroupMember.update({
                where: { id: m.id },
                data: {
                    igMatched: true,
                    igUsername: hit.username,
                    igInteractionScore: hit.interactionScore,
                },
            });
            matched++;
        } else {
            await prisma.whatsappGroupMember.update({
                where: { id: m.id },
                data: { igMatched: false, igUsername: null, igInteractionScore: null },
            });
        }
    }

    return { total: members.length, matched };
}

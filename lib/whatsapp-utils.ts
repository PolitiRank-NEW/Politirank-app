import { prisma } from '@/app/lib/prisma';
import { SocialPlatform } from '@prisma/client';

export function parseOptionalNumber(val: unknown): number | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
}

export function normalizeIgHandle(handle: string | null | undefined): string | null {
    if (!handle) return null;
    return handle.replace(/^@/, '').trim().toLowerCase() || null;
}

export function normalizeFbHandle(handle: string | null | undefined): string | null {
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

type FbRankEntry = { name?: string; username?: string; score?: number };

export async function crossReferenceMembersByFb(candidateId: string) {
    const members = await prisma.whatsappGroupMember.findMany({
        where: {
            group: { candidateId },
            facebookHandle: { not: null },
        },
    });

    const fbProfile = await prisma.socialProfile.findFirst({
        where: { candidateId, platform: SocialPlatform.FACEBOOK },
    });

    const raw = (fbProfile?.rawApiData || {}) as { lastRanking?: FbRankEntry[] };
    const ranking = Array.isArray(raw.lastRanking) ? raw.lastRanking : [];

    const fbMap = new Map<string, FbRankEntry>();
    for (const entry of ranking) {
        const keys = [entry.name, entry.username]
            .map((k) => normalizeFbHandle(k))
            .filter(Boolean) as string[];
        for (const key of keys) {
            if (!fbMap.has(key)) fbMap.set(key, entry);
        }
    }

    let matched = 0;
    for (const m of members) {
        const key = normalizeFbHandle(m.facebookHandle);
        if (!key) continue;
        const hit = fbMap.get(key);
        if (hit) {
            await prisma.whatsappGroupMember.update({
                where: { id: m.id },
                data: {
                    fbMatched: true,
                    fbUsername: hit.name || hit.username || m.facebookHandle,
                    fbInteractionScore: hit.score != null ? Math.round(hit.score) : null,
                },
            });
            matched++;
        } else {
            await prisma.whatsappGroupMember.update({
                where: { id: m.id },
                data: { fbMatched: false, fbUsername: null, fbInteractionScore: null },
            });
        }
    }

    return { total: members.length, matched };
}

export async function crossReferenceMembers(candidateId: string) {
    const ig = await crossReferenceMembersByIg(candidateId);
    const fb = await crossReferenceMembersByFb(candidateId);
    return { ig, fb };
}

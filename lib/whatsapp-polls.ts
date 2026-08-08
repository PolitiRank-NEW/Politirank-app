/**
 * Enquetes WhatsApp → JSON estruturado (Prisma + detail no membro).
 */
import { prisma } from '@/app/lib/prisma';

export type PollVoteEntry = {
    pollId?: string | null;
    pollTitle?: string | null;
    option: string;
    options?: string[];
    votedAt?: string;
    decrypted?: boolean;
};

export type UpsertPollInput = {
    candidateId: string;
    groupDbId: string;
    waMessageId: string;
    title: string;
    options: string[];
    createdByLid?: string | null;
    createdByPhone?: string | null;
    createdByName?: string | null;
    payload?: unknown;
};

export type UpsertVoteInput = {
    candidateId: string;
    groupDbId: string;
    waMessageId: string | null;
    pollTitle: string | null;
    voterLid: string;
    voterPhone?: string | null;
    voterName?: string | null;
    memberId?: string | null;
    selectedOptions: string[];
};

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((o) => {
            if (typeof o === 'string') return o.trim();
            if (o && typeof o === 'object') {
                const r = o as Record<string, unknown>;
                return String(r.name || r.optionName || r.value || '').trim();
            }
            return '';
        })
        .filter(Boolean);
}

/** Opções no pollCreationMessage / V3 */
export function extractPollOptions(msg: Record<string, unknown> | null | undefined): string[] {
    if (!msg) return [];
    const message = (msg.message as Record<string, unknown>) || msg;
    const creation =
        (message.pollCreationMessage as Record<string, unknown>) ||
        (message.pollCreationMessageV3 as Record<string, unknown>) ||
        (msg.pollCreationMessage as Record<string, unknown>) ||
        null;
    if (!creation) return [];
    const opts = creation.options ?? creation.pollOptions;
    return asStringArray(opts);
}

export function extractSelectedOptions(msg: any): string[] {
    const decrypted =
        msg?.message?.pollUpdateMessage?.vote?.selectedOptions ??
        msg?.pollUpdateMessage?.vote?.selectedOptions;
    if (Array.isArray(decrypted) && decrypted.length > 0) {
        return asStringArray(decrypted);
    }
    for (const p of [msg?.pollVotes, msg?.pollUpdates]) {
        if (Array.isArray(p) && p.length > 0) return asStringArray(p);
    }
    return [];
}

export function extractPollTitle(msg: any): string | null {
    return (
        msg?.message?.pollCreationMessage?.name ||
        msg?.message?.pollCreationMessageV3?.name ||
        msg?.pollCreationMessage?.name ||
        null
    );
}

export async function upsertPollFromCreation(input: UpsertPollInput) {
    const existing = await prisma.whatsappPoll.findFirst({
        where: { groupId: input.groupDbId, waMessageId: input.waMessageId },
        select: { id: true },
    });

    if (existing) {
        return prisma.whatsappPoll.update({
            where: { id: existing.id },
            data: {
                title: input.title,
                options: input.options,
                createdByLid: input.createdByLid || undefined,
                createdByPhone: input.createdByPhone || undefined,
                createdByName: input.createdByName || undefined,
                payload: input.payload ? (input.payload as never) : undefined,
            } as never,
        });
    }

    return prisma.whatsappPoll.create({
        data: {
            candidateId: input.candidateId,
            groupId: input.groupDbId,
            waMessageId: input.waMessageId,
            title: input.title,
            options: input.options,
            createdByLid: input.createdByLid || null,
            createdByPhone: input.createdByPhone || null,
            createdByName: input.createdByName || null,
            payload: input.payload ? (input.payload as never) : undefined,
        } as never,
    });
}

/** Garante poll stub se o voto chegou antes da criação (ou título só no cache). */
async function ensurePollForVote(input: UpsertVoteInput) {
    if (!input.waMessageId) {
        throw new Error('waMessageId obrigatório');
    }

    let poll = await prisma.whatsappPoll.findFirst({
        where: {
            groupId: input.groupDbId,
            waMessageId: input.waMessageId,
        },
    });

    if (!poll) {
        poll = await prisma.whatsappPoll.create({
            data: {
                candidateId: input.candidateId,
                groupId: input.groupDbId,
                waMessageId: input.waMessageId,
                title: input.pollTitle || '(enquete)',
                options: [],
            } as never,
        });
    } else if (input.pollTitle && (!poll.title || poll.title === '(enquete)')) {
        poll = await prisma.whatsappPoll.update({
            where: { id: poll.id },
            data: { title: input.pollTitle },
        });
    }

    return poll;
}

export async function upsertPollVote(input: UpsertVoteInput) {
    if (!input.waMessageId) {
        return { poll: null, vote: null, created: false as const };
    }

    const poll = await ensurePollForVote(input);
    const decrypted = input.selectedOptions.length > 0;
    const optionLabel = decrypted ? input.selectedOptions.join(', ') : '(voto pendente)';

    const existing = await prisma.whatsappPollVote.findFirst({
        where: {
            pollId: poll.id,
            voterLid: input.voterLid,
        },
    });

    if (existing) {
        if (!decrypted) {
            return { poll, vote: existing, created: false as const };
        }
        const vote = await prisma.whatsappPollVote.update({
            where: { id: existing.id },
            data: {
                selectedOptions: input.selectedOptions,
                optionLabel,
                decrypted: true,
                votedAt: new Date(),
                voterName: input.voterName || existing.voterName,
                voterPhone: input.voterPhone || existing.voterPhone,
                memberId: input.memberId || existing.memberId,
            } as never,
        });
        return { poll, vote, created: false as const };
    }

    const vote = await prisma.whatsappPollVote.create({
        data: {
            pollId: poll.id,
            memberId: input.memberId || null,
            voterLid: input.voterLid,
            voterPhone: input.voterPhone || null,
            voterName: input.voterName || null,
            selectedOptions: input.selectedOptions,
            optionLabel,
            decrypted,
            votedAt: new Date(),
        } as never,
    });

    return { poll, vote, created: true as const };
}

/** Sincroniza pollVotesDetail do membro (UI atual). */
export function mergeMemberPollDetail(
    prev: unknown,
    entry: PollVoteEntry
): PollVoteEntry[] {
    const list: PollVoteEntry[] = Array.isArray(prev)
        ? (prev as PollVoteEntry[])
        : [];
    const next = [...list];
    const idx = next.findIndex((e) => e.pollId && entry.pollId && e.pollId === entry.pollId);
    if (idx >= 0) {
        if (entry.options && entry.options.length > 0) {
            next[idx] = { ...next[idx], ...entry };
        }
    } else {
        next.push(entry);
    }
    return next;
}

export async function listPollsJson(opts: {
    candidateId: string;
    groupId?: string | null;
    take?: number;
}) {
    const take = Math.min(opts.take || 40, 100);
    const polls = await prisma.whatsappPoll.findMany({
        where: {
            candidateId: opts.candidateId,
            ...(opts.groupId ? { groupId: opts.groupId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
            group: { select: { id: true, name: true } },
            votes: { orderBy: { votedAt: 'desc' } },
        },
    });

    return polls.map((p) => {
        const options = asStringArray(p.options);
        const byOption: Record<string, number> = {};
        for (const opt of options) byOption[opt] = 0;
        let pending = 0;
        for (const v of p.votes) {
            const selected = asStringArray(v.selectedOptions);
            if (!v.decrypted || selected.length === 0) {
                pending += 1;
                continue;
            }
            for (const s of selected) {
                byOption[s] = (byOption[s] || 0) + 1;
            }
        }

        return {
            id: p.id,
            waMessageId: p.waMessageId,
            title: p.title,
            options,
            group: p.group,
            createdAt: p.createdAt.toISOString(),
            createdBy: {
                lid: p.createdByLid,
                phone: p.createdByPhone,
                name: p.createdByName,
            },
            votes: p.votes.map((v) => ({
                id: v.id,
                memberId: v.memberId,
                voter: {
                    lid: v.voterLid,
                    phone: v.voterPhone,
                    name: v.voterName,
                },
                selectedOptions: asStringArray(v.selectedOptions),
                optionLabel: v.optionLabel,
                votedAt: v.votedAt.toISOString(),
                decrypted: v.decrypted,
            })),
            summary: {
                totalVotes: p.votes.length,
                decryptedVotes: p.votes.filter((v) => v.decrypted).length,
                pendingVotes: pending,
                byOption,
            },
        };
    });
}

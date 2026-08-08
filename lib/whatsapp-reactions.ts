/**
 * Reações WhatsApp → JSON estruturado (Prisma).
 */
import { prisma } from '@/app/lib/prisma';

export type ParsedReaction = {
    targetWaMessageId: string;
    emoji: string;
    removed: boolean;
    reactorLid: string | null;
    reactorName: string | null;
    groupJid: string | null;
};

function phoneFromJid(jid?: string | null): string | null {
    if (!jid) return null;
    const raw = String(jid).split('@')[0];
    return raw || null;
}

/**
 * Extrai reação de messages.upsert (reactionMessage) ou messages.reaction.
 */
export function parseReactionPayload(data: any): ParsedReaction | null {
    if (!data || typeof data !== 'object') return null;

    // messages.upsert com reactionMessage
    const reactionMsg =
        data?.message?.reactionMessage ||
        data?.reactionMessage ||
        null;

    if (reactionMsg) {
        const targetId = reactionMsg?.key?.id || reactionMsg?.key?.Id || null;
        const emoji = typeof reactionMsg.text === 'string' ? reactionMsg.text : '';
        const groupJid =
            data?.key?.remoteJid ||
            reactionMsg?.key?.remoteJid ||
            null;
        const reactorLid = phoneFromJid(data?.key?.participant || data?.key?.remoteJid);
        if (!targetId) return null;
        return {
            targetWaMessageId: String(targetId),
            emoji,
            removed: !emoji,
            reactorLid,
            reactorName:
                typeof data?.pushName === 'string' && data.pushName.trim()
                    ? data.pushName.trim()
                    : null,
            groupJid: groupJid?.endsWith?.('@g.us') ? groupJid : groupJid,
        };
    }

    // messages.reaction — formatos variados
    const reaction = data?.reaction || data;
    const targetId =
        reaction?.key?.id ||
        reaction?.messageId ||
        data?.key?.id ||
        null;
    const emoji =
        typeof reaction?.text === 'string'
            ? reaction.text
            : typeof reaction?.reaction === 'string'
              ? reaction.reaction
              : typeof data?.text === 'string'
                ? data.text
                : '';
    const groupJid =
        reaction?.key?.remoteJid ||
        data?.key?.remoteJid ||
        data?.remoteJid ||
        null;
    const reactorLid = phoneFromJid(
        data?.participant ||
            data?.key?.participant ||
            reaction?.participant ||
            data?.sender
    );

    if (!targetId) return null;
    return {
        targetWaMessageId: String(targetId),
        emoji,
        removed: !emoji,
        reactorLid,
        reactorName:
            typeof data?.pushName === 'string' && data.pushName.trim()
                ? data.pushName.trim()
                : null,
        groupJid: groupJid && String(groupJid).endsWith('@g.us') ? String(groupJid) : null,
    };
}

export async function upsertReaction(input: {
    candidateId: string;
    groupDbId: string;
    targetWaMessageId: string;
    emoji: string;
    removed: boolean;
    reactorLid: string;
    reactorPhone?: string | null;
    reactorName?: string | null;
    memberId?: string | null;
}) {
    const existing = await prisma.whatsappReaction.findFirst({
        where: {
            groupId: input.groupDbId,
            targetWaMessageId: input.targetWaMessageId,
            reactorLid: input.reactorLid,
        },
    });

    if (existing) {
        return prisma.whatsappReaction.update({
            where: { id: existing.id },
            data: {
                emoji: input.emoji,
                removed: input.removed,
                reactedAt: new Date(),
                reactorName: input.reactorName || existing.reactorName,
                reactorPhone: input.reactorPhone || existing.reactorPhone,
                memberId: input.memberId || existing.memberId,
            } as never,
        });
    }

    return prisma.whatsappReaction.create({
        data: {
            candidateId: input.candidateId,
            groupId: input.groupDbId,
            targetWaMessageId: input.targetWaMessageId,
            emoji: input.emoji,
            removed: input.removed,
            reactorLid: input.reactorLid,
            reactorPhone: input.reactorPhone || null,
            reactorName: input.reactorName || null,
            memberId: input.memberId || null,
            reactedAt: new Date(),
        } as never,
    });
}

export async function listReactionsJson(opts: {
    candidateId: string;
    groupId?: string | null;
    take?: number;
}) {
    const take = Math.min(opts.take || 100, 300);
    const rows = await prisma.whatsappReaction.findMany({
        where: {
            candidateId: opts.candidateId,
            ...(opts.groupId ? { groupId: opts.groupId } : {}),
            removed: false,
        },
        orderBy: { reactedAt: 'desc' },
        take,
        include: { group: { select: { id: true, name: true } } },
    });

    const byMessage = new Map<
        string,
        {
            targetWaMessageId: string;
            group: { id: string; name: string };
            reactions: Array<{
                id: string;
                emoji: string;
                reactor: { lid: string | null; phone: string | null; name: string | null };
                memberId: string | null;
                reactedAt: string;
            }>;
            summary: Record<string, number>;
        }
    >();

    for (const r of rows) {
        const key = `${r.groupId}:${r.targetWaMessageId}`;
        if (!byMessage.has(key)) {
            byMessage.set(key, {
                targetWaMessageId: r.targetWaMessageId,
                group: r.group,
                reactions: [],
                summary: {},
            });
        }
        const bucket = byMessage.get(key)!;
        bucket.reactions.push({
            id: r.id,
            emoji: r.emoji,
            reactor: {
                lid: r.reactorLid,
                phone: r.reactorPhone,
                name: r.reactorName,
            },
            memberId: r.memberId,
            reactedAt: r.reactedAt.toISOString(),
        });
        if (r.emoji) {
            bucket.summary[r.emoji] = (bucket.summary[r.emoji] || 0) + 1;
        }
    }

    return {
        count: rows.length,
        messages: [...byMessage.values()],
        reactions: rows.map((r) => ({
            id: r.id,
            targetWaMessageId: r.targetWaMessageId,
            emoji: r.emoji,
            group: r.group,
            reactor: {
                lid: r.reactorLid,
                phone: r.reactorPhone,
                name: r.reactorName,
            },
            memberId: r.memberId,
            reactedAt: r.reactedAt.toISOString(),
        })),
    };
}

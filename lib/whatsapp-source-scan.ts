import { captionsMatch, extractMediaCaption, phonesMatch } from '@/lib/whatsapp-scan';
import { prisma } from '@/app/lib/prisma';

const SOURCE_LOOKBACK_MS = 48 * 60 * 60 * 1000; // 48h

export type ResolvedSender = {
    memberId: string | null;
    phone: string | null;
    waLid: string | null;
    pushName: string | null;
};

function phoneFromJid(jid?: string | null): string | null {
    if (!jid) return null;
    const raw = jid.split('@')[0];
    return raw && /^\d+$/.test(raw) ? raw : raw || null;
}

/** LID do WA costuma ter 14+ dígitos; telefone BR com DDI costuma ter 10–13. */
export function looksLikeRealPhone(raw: string | null | undefined): boolean {
    if (!raw) return false;
    const d = raw.replace(/\D/g, '');
    if (!/^\d{10,13}$/.test(d)) return false;
    // Evita LIDs curtos raros: se começa com 55 e tem 12–13, ok; senão 10–11 local
    if (d.startsWith('55')) return d.length === 12 || d.length === 13;
    return d.length >= 10 && d.length <= 11;
}

export async function resolveGroupSender(
    groupDbId: string,
    data: { key?: { participant?: string; fromMe?: boolean }; pushName?: string },
    ownerPhone?: string | null
): Promise<ResolvedSender> {
    const pushName =
        typeof data?.pushName === 'string' && data.pushName.trim() ? data.pushName.trim() : null;
    const lid = phoneFromJid(data?.key?.participant);
    let phone: string | null = lid && looksLikeRealPhone(lid) ? lid : null;
    let waLid = lid && !looksLikeRealPhone(lid) ? lid : lid;
    let memberId: string | null = null;

    if (lid) {
        const member = await prisma.whatsappGroupMember.findFirst({
            where: {
                groupId: groupDbId,
                OR: [{ waLid: lid }, { phone: lid }],
            } as any,
        });
        if (member) {
            memberId = member.id;
            if (looksLikeRealPhone(member.phone)) {
                phone = member.phone;
            }
            waLid = (member as any).waLid || waLid;
        }
    }

    // Mensagem própria: sempre preferir o telefone do dono da instância
    if (data?.key?.fromMe && ownerPhone) {
        const ownerDigits = ownerPhone.replace(/\D/g, '');
        const members = await prisma.whatsappGroupMember.findMany({
            where: { groupId: groupDbId },
            select: { id: true, phone: true, waLid: true },
        });
        const target = members.find((m) => {
            const p = (m.phone || '').replace(/\D/g, '');
            return (
                p === ownerDigits ||
                (p.length >= 8 &&
                    ownerDigits.length >= 8 &&
                    (p.endsWith(ownerDigits) || ownerDigits.endsWith(p)))
            );
        });
        if (target) {
            memberId = target.id;
            phone = looksLikeRealPhone(target.phone) ? target.phone : ownerPhone;
            waLid = (target as any).waLid || waLid;
        } else {
            phone = ownerPhone;
        }
    }

    // Se ainda só temos LID no "phone", limpa
    if (phone && !looksLikeRealPhone(phone)) {
        if (!waLid) waLid = phone;
        phone = ownerPhone && looksLikeRealPhone(ownerPhone) ? ownerPhone : null;
    }

    return { memberId, phone, waLid, pushName };
}

/** Post no grupo Source → vira referência. */
export async function ingestSourcePost(params: {
    candidateId: string;
    groupDbId: string;
    messageId: string;
    message: Record<string, unknown>;
    sender: ResolvedSender;
}) {
    const { caption, hasMedia, mediaType } = extractMediaCaption(params.message);
    if (!caption?.trim()) return null;
    // Conteúdo de campanha costuma ter mídia; exige imagem/vídeo/doc
    if (!hasMedia) return null;

    try {
        return await prisma.whatsappSourcePost.create({
            data: {
                candidateId: params.candidateId,
                groupId: params.groupDbId,
                messageId: params.messageId,
                caption: caption.trim(),
                hasMedia,
                mediaType,
                pushName: params.sender.pushName,
                phone: params.sender.phone,
                waLid: params.sender.waLid,
                memberId: params.sender.memberId,
                status: 'OPEN',
            },
        });
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === 'P2002') return null;
        throw err;
    }
}

/** Post em grupo alvo → casa com posts Source abertos recentes. */
export async function matchAgainstSourcePosts(params: {
    candidateId: string;
    groupDbId: string;
    messageId: string;
    message: Record<string, unknown>;
    sender: ResolvedSender;
}) {
    const { caption, hasMedia, mediaType } = extractMediaCaption(params.message);
    if (!caption?.trim()) return [];

    const since = new Date(Date.now() - SOURCE_LOOKBACK_MS);
    const sources = await prisma.whatsappSourcePost.findMany({
        where: {
            candidateId: params.candidateId,
            status: 'OPEN',
            postedAt: { gte: since },
            // não casar o próprio Source consigo
            groupId: { not: params.groupDbId },
        },
        orderBy: { postedAt: 'desc' },
        take: 100,
    });

    const created = [];
    for (const source of sources) {
        if (!captionsMatch(caption, source.caption, 'EXACT')) continue;
        // Se o source tinha mídia, preferir que o repost também tenha
        if (source.hasMedia && !hasMedia) continue;

        try {
            const row = await prisma.whatsappSourceMatch.create({
                data: {
                    sourcePostId: source.id,
                    groupId: params.groupDbId,
                    messageId: params.messageId,
                    captionFound: caption.trim(),
                    hasMedia,
                    mediaType,
                    memberId: params.sender.memberId,
                    phone: params.sender.phone,
                    waLid: params.sender.waLid,
                    pushName: params.sender.pushName,
                },
            });
            created.push({ sourcePostId: source.id, matchId: row.id, phone: params.sender.phone });
        } catch (err: unknown) {
            if ((err as { code?: string })?.code === 'P2002') continue;
            throw err;
        }
    }
    return created;
}

export { extractMediaCaption, captionsMatch, phonesMatch, phoneFromJid };

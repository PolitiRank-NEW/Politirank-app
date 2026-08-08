import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { captionsMatch, extractMediaCaption, phonesMatch } from '@/lib/whatsapp-scan';
import { evolutionService } from '@/services/evolutionService';
import {
    ingestSourcePost,
    matchAgainstSourcePosts,
    resolveGroupSender,
} from '@/lib/whatsapp-source-scan';
import {
    handleGroupParticipantsUpdate,
    handleGroupsUpsertOrUpdate,
} from '@/lib/whatsapp-group-live-sync';
import {
    extractPollOptions,
    extractPollTitle,
    extractSelectedOptions,
    mergeMemberPollDetail,
    upsertPollFromCreation,
    upsertPollVote,
} from '@/lib/whatsapp-polls';
import { parseReactionPayload, upsertReaction } from '@/lib/whatsapp-reactions';

/**
 * Evolution API Webhook Handler
 * Eventos: messages.upsert, groups.upsert/update, group.participants.update
 *
 * Enquetes: gravadas em WhatsappPoll / WhatsappPollVote (JSON estruturado)
 * + pollVotesDetail no membro (UI).
 *
 * Scanner Source:
 * - Grupo marcado isSource: posts com mídia+legenda viram referência.
 * - Demais grupos: se a legenda bater com um Source recente → grava match (telefone/grupo).
 * - Tarefas manuais WhatsappScanTask ainda são suportadas.
 */

interface WaKey {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
    participant?: string;
}

// Cache em memória: pollId -> título da enquete (preenchido quando a enquete é criada).
const pollTitleCache = new Map<string, string>();

function phoneFromJid(jid?: string): string | null {
    if (!jid) return null;
    const raw = jid.split('@')[0];
    return raw && /^\d+$/.test(raw) ? raw : raw || null;
}

async function handleSingleMessage(instance: string, data: any) {
    const key: WaKey = data?.key || {};
    const remoteJid = key.remoteJid;
    if (!remoteJid?.endsWith('@g.us')) {
        return { ignored: 'not a group message' };
    }

    const profile = await (prisma.candidateProfile as any).findFirst({
        where: { evolutionInstanceName: instance },
    });
    if (!profile) {
        return { ignored: 'instance not linked' };
    }

    const group = await prisma.whatsappGroup.findFirst({
        where: { candidateId: profile.id, groupId: remoteJid },
        include: { lideranca: true },
    });
    if (!group) {
        return { ignored: 'group not monitored' };
    }

    // Nome do WhatsApp (pushName) vem nos eventos de mensagem — inclusive do dono do QR (fromMe).
    const pushName =
        typeof data?.pushName === 'string' && data.pushName.trim() ? data.pushName.trim() : null;
    const participantLid = phoneFromJid(key.participant || undefined);
    if (pushName && participantLid) {
        const member = await prisma.whatsappGroupMember.findFirst({
            where: {
                groupId: group.id,
                OR: [{ waLid: participantLid }, { phone: participantLid }],
            } as any,
        });
        if (member && member.name !== pushName) {
            await prisma.whatsappGroupMember.update({
                where: { id: member.id },
                data: {
                    name: pushName,
                    ...(!(member as any).waLid ? { waLid: participantLid } : {}),
                } as any,
            });
        }
    } else if (pushName && key.fromMe) {
        // Mensagem sua no grupo: às vezes não vem participant — casa pelo telefone do dono da instância
        try {
            const inst = await evolutionService.fetchInstances(instance);
            const list = Array.isArray(inst) ? inst : inst ? [inst] : [];
            const row = list.find((i: { name?: string }) => i?.name === instance) as
                | { ownerJid?: string }
                | undefined;
            const ownerPhone = phoneFromJid(row?.ownerJid);
            if (ownerPhone) {
                const members = await prisma.whatsappGroupMember.findMany({
                    where: { groupId: group.id },
                    select: { id: true, phone: true, name: true },
                });
                const o = ownerPhone.replace(/\D/g, '');
                const target = members.find((m) => {
                    const p = (m.phone || '').replace(/\D/g, '');
                    return (
                        p === o ||
                        (p.length >= 8 && o.length >= 8 && (p.endsWith(o) || o.endsWith(p)))
                    );
                });
                if (target && target.name !== pushName) {
                    await prisma.whatsappGroupMember.update({
                        where: { id: target.id },
                        data: { name: pushName },
                    });
                }
            }
        } catch (err) {
            console.warn('[Evolution] falha ao nomear dono fromMe:', err);
        }
    }

    const message = data?.message || {};
    const isPollCreation = !!(message.pollCreationMessage || message.pollCreationMessageV3);
    const isPollVote = !!message.pollUpdateMessage;
    const isReaction = !!message.reactionMessage;

    // --- Reação (emoji) ---
    if (isReaction) {
        const parsed = parseReactionPayload(data);
        if (!parsed?.targetWaMessageId || !parsed.reactorLid) {
            return { ignored: 'reaction incomplete', group: group.name };
        }

        let member = await prisma.whatsappGroupMember.findFirst({
            where: {
                groupId: group.id,
                OR: [{ waLid: parsed.reactorLid }, { phone: parsed.reactorLid }],
            } as never,
        });
        if (!member) {
            member = await prisma.whatsappGroupMember.create({
                data: {
                    groupId: group.id,
                    waLid: parsed.reactorLid,
                    name: parsed.reactorName,
                    isManual: false,
                } as never,
            });
        }

        await upsertReaction({
            candidateId: profile.id,
            groupDbId: group.id,
            targetWaMessageId: parsed.targetWaMessageId,
            emoji: parsed.emoji,
            removed: parsed.removed,
            reactorLid: parsed.reactorLid,
            reactorPhone: member.phone,
            reactorName: parsed.reactorName || member.name,
            memberId: member.id,
        });

        if (!parsed.removed) {
            await prisma.$transaction([
                prisma.whatsappGroup.update({
                    where: { id: group.id },
                    data: { reactionsCount: { increment: 1 }, lastUpdate: new Date() } as never,
                }),
                prisma.whatsappLideranca.update({
                    where: { id: group.liderancaId },
                    data: { reactionsCount: { increment: 1 }, lastUpdate: new Date() } as never,
                }),
            ]);
        }

        console.log(
            `[Evolution][REACTION] grupo="${group.name}" emoji="${parsed.emoji}" target=${parsed.targetWaMessageId} lid=${parsed.reactorLid}`
        );
        return {
            success: true,
            type: 'reaction',
            group: group.name,
            emoji: parsed.emoji,
            removed: parsed.removed,
        };
    }

    // --- Criação de enquete ---
    if (isPollCreation) {
        const title = extractPollTitle(data) || '(enquete)';
        const options = extractPollOptions(data);
        const creatorLid = phoneFromJid(key.participant || undefined);
        if (key.id && title) {
            pollTitleCache.set(key.id, title);
        }
        console.log(
            `[Evolution][POLL CREATED] grupo="${group.name}" título="${title}" pollId=${key.id} opções=${JSON.stringify(options)}`
        );

        if (key.id) {
            await upsertPollFromCreation({
                candidateId: profile.id,
                groupDbId: group.id,
                waMessageId: key.id,
                title,
                options,
                createdByLid: creatorLid,
                createdByName: pushName,
                payload: {
                    options,
                    fromMe: key.fromMe || false,
                },
            });
        }

        await prisma.$transaction([
            (prisma.whatsappGroup as any).update({
                where: { id: group.id },
                data: { pollsCount: { increment: 1 }, lastUpdate: new Date() },
            }),
            (prisma.whatsappLideranca as any).update({
                where: { id: group.liderancaId },
                data: { pollsCount: { increment: 1 }, lastUpdate: new Date() },
            }),
        ]);
        return { success: true, type: 'poll_created', group: group.name, title, options };
    }

    // --- Voto em enquete ---
    if (isPollVote) {
        const voterJid = key.participant || key.remoteJid;
        const voterLid = phoneFromJid(voterJid);
        const options = extractSelectedOptions(data);
        const pollId: string | null = message.pollUpdateMessage?.pollCreationMessageKey?.id ?? null;
        const pollTitle = pollId ? pollTitleCache.get(pollId) ?? null : null;

        console.log(
            `[Evolution][POLL VOTE] grupo="${group.name}" votanteLid=${voterLid} pollId=${pollId} opções=${JSON.stringify(
                options
            )}`
        );

        if (voterLid) {
            let member = await prisma.whatsappGroupMember.findFirst({
                where: {
                    groupId: group.id,
                    OR: [{ waLid: voterLid }, { phone: voterLid }],
                } as any,
            });
            if (!member) {
                member = await prisma.whatsappGroupMember.create({
                    data: {
                        groupId: group.id,
                        waLid: voterLid,
                        name: data?.pushName || null,
                        isManual: false,
                    } as any,
                });
            } else if (!(member as any).waLid) {
                await prisma.whatsappGroupMember.update({
                    where: { id: member.id },
                    data: { waLid: voterLid } as any,
                });
            }

            const { poll } = await upsertPollVote({
                candidateId: profile.id,
                groupDbId: group.id,
                waMessageId: pollId,
                pollTitle,
                voterLid,
                voterPhone: member.phone,
                voterName: data?.pushName || member.name,
                memberId: member.id,
                selectedOptions: options,
            });

            const resolvedTitle = pollTitle || poll?.title || null;
            const nextDetail = mergeMemberPollDetail(member.pollVotesDetail, {
                pollId,
                pollTitle: resolvedTitle,
                option: options.length > 0 ? options.join(', ') : '(voto pendente)',
                options,
                votedAt: new Date().toISOString(),
                decrypted: options.length > 0,
            });

            await prisma.whatsappGroupMember.update({
                where: { id: member.id },
                data: {
                    pollVotes: nextDetail.length,
                    pollVotesDetail: nextDetail as any,
                    ...(data?.pushName && !member.name ? { name: data.pushName } : {}),
                },
            });
        }
        return { success: true, type: 'poll_vote', group: group.name, options };
    }

    // --- Scanner SOURCE + tarefas manuais ---
    const { caption, hasMedia, mediaType } = extractMediaCaption(message);
    const scanHits: string[] = [];
    let sourcePostId: string | null = null;
    let sourceMatchesCount = 0;

    if (caption && key.id) {
        let ownerPhone: string | null = null;
        try {
            const inst = await evolutionService.fetchInstances(instance);
            const list = Array.isArray(inst) ? inst : inst ? [inst] : [];
            const row = list.find((i: { name?: string }) => i?.name === instance) as
                | { ownerJid?: string }
                | undefined;
            ownerPhone = phoneFromJid(row?.ownerJid);
        } catch {
            /* ignore */
        }

        const sender = await resolveGroupSender(group.id, data, ownerPhone);

        // Grupo Source: grava conteúdo de referência
        if (group.isSource) {
            const created = await ingestSourcePost({
                candidateId: profile.id,
                groupDbId: group.id,
                messageId: key.id,
                message,
                sender,
            });
            if (created) {
                sourcePostId = created.id;
                console.log(
                    `[Evolution][SOURCE POST] grupo="${group.name}" caption="${caption.slice(0, 80)}"`
                );
            }
        } else {
            // Demais grupos: casa legenda com posts do Source (últimas 48h)
            const matched = await matchAgainstSourcePosts({
                candidateId: profile.id,
                groupDbId: group.id,
                messageId: key.id,
                message,
                sender,
            });
            sourceMatchesCount = matched.length;
            if (matched.length) {
                console.log(
                    `[Evolution][SOURCE MATCH] grupo="${group.name}" phone=${sender.phone} matches=${matched.length}`
                );
            }
        }

        // Tarefas manuais antigas (ainda suportadas)
        const openTasks = await prisma.whatsappScanTask.findMany({
            where: {
                candidateId: profile.id,
                status: 'OPEN',
                OR: [{ groupId: null }, { groupId: group.id }],
            },
        });

        for (const task of openTasks) {
            if (task.requireMedia && !hasMedia) continue;
            if (!captionsMatch(caption, task.expectedCaption, task.matchMode)) continue;

            const expected = (task as { expectedPhones?: string[] }).expectedPhones || [];
            if (expected.length > 0) {
                const ok = expected.some(
                    (p) =>
                        phonesMatch(p, sender.phone) ||
                        phonesMatch(p, sender.waLid)
                );
                if (!ok) continue;
            }

            try {
                await prisma.whatsappScanHit.create({
                    data: {
                        taskId: task.id,
                        groupId: group.id,
                        memberId: sender.memberId,
                        waLid: sender.waLid,
                        phone: sender.phone,
                        pushName: sender.pushName,
                        captionFound: caption,
                        hasMedia,
                        mediaType,
                        messageId: key.id,
                    },
                });
                scanHits.push(task.id);
            } catch (err: unknown) {
                const code = (err as { code?: string })?.code;
                if (code !== 'P2002') throw err;
            }
        }
    }

    // --- Mensagem comum (contador) ---
    try {
        await prisma.$transaction([
            (prisma.whatsappGroup as any).update({
                where: { id: group.id },
                data: { messagesCount: { increment: 1 }, lastUpdate: new Date() },
            }),
            (prisma.whatsappLideranca as any).update({
                where: { id: group.liderancaId },
                data: { messagesCount: { increment: 1 }, lastUpdate: new Date() },
            }),
        ]);
    } catch (err: unknown) {
        // Conflito de escrita no Mongo não deve invalidar o match já gravado
        console.warn('[Evolution] falha ao incrementar contadores:', err);
    }

    let type: string = 'message';
    if (sourcePostId) type = 'source_post';
    else if (sourceMatchesCount > 0) type = 'source_match';
    else if (scanHits.length > 0) type = 'scan_hit';

    return {
        success: true,
        type,
        group: group.name,
        sourcePostId: sourcePostId || undefined,
        sourceMatches: sourceMatchesCount || undefined,
        scanHits: scanHits.length || undefined,
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { event, instance, data } = body;

        const apiKey = req.headers.get('apikey');
        const secretKey = process.env.EVOLUTION_API_KEY;
        // Evolution global webhook manda o token da INSTÂNCIA (UUID), não a AUTHENTICATION_API_KEY.
        // Aceitamos a chave global OU um instanceName já vinculado a um candidato.
        if (secretKey && apiKey !== secretKey) {
            const instanceName = typeof instance === 'string' ? instance : '';
            if (!instanceName) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const linked = await prisma.candidateProfile.findFirst({
                where: { evolutionInstanceName: instanceName },
                select: { id: true },
            });
            if (!linked) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const normalizedEvent = String(event || '').replace(/_/g, '.').toLowerCase();
        // Eventos de conexão/QR: só confirmam recebimento (não precisam processar mensagem)
        if (
            normalizedEvent === 'connection.update' ||
            normalizedEvent === 'qrcode.updated' ||
            normalizedEvent.includes('connection') ||
            normalizedEvent.includes('qrcode')
        ) {
            return NextResponse.json({ ignored: true, event: normalizedEvent, ok: true });
        }

        const instanceName = typeof instance === 'string' ? instance : '';
        const profile = instanceName
            ? await prisma.candidateProfile.findFirst({
                  where: { evolutionInstanceName: instanceName },
                  select: { id: true },
              })
            : null;

        // Grupo criado / metadados atualizados → entra no PoliticRank na hora
        if (
            normalizedEvent === 'groups.upsert' ||
            normalizedEvent === 'groups.update' ||
            normalizedEvent.includes('groups.upsert') ||
            normalizedEvent.includes('groups.update')
        ) {
            if (!profile) {
                return NextResponse.json({ ignored: true, reason: 'instance not linked' });
            }
            const result = await handleGroupsUpsertOrUpdate(profile.id, data);
            return NextResponse.json({ event: normalizedEvent, ...result });
        }

        // Entrada / saída de participantes (só aquele grupo)
        if (
            normalizedEvent === 'group.participants.update' ||
            normalizedEvent.includes('group.participants')
        ) {
            if (!profile) {
                return NextResponse.json({ ignored: true, reason: 'instance not linked' });
            }
            const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
            const result = await handleGroupParticipantsUpdate(profile.id, payload);
            return NextResponse.json({ event: normalizedEvent, ...result });
        }

        // Reações (messages.reaction) — também chegam em messages.upsert com reactionMessage
        if (
            normalizedEvent === 'messages.reaction' ||
            normalizedEvent.includes('messages.reaction')
        ) {
            if (!profile || !instanceName) {
                return NextResponse.json({ ignored: true, reason: 'instance not linked' });
            }
            const items = Array.isArray(data) ? data : [data];
            const results = [];
            for (const item of items) {
                if (!item) continue;
                // Normaliza para o mesmo shape do upsert quando possível
                const normalized =
                    item?.message?.reactionMessage || item?.reactionMessage
                        ? item
                        : {
                              key: item?.key || {
                                  remoteJid: item?.remoteJid || item?.key?.remoteJid,
                                  participant: item?.participant || item?.key?.participant,
                              },
                              pushName: item?.pushName,
                              message: {
                                  reactionMessage: item?.reaction || item?.reactionMessage || item,
                              },
                          };
                results.push(await handleSingleMessage(instanceName, normalized));
            }
            return NextResponse.json({ event: normalizedEvent, processed: results.length, results });
        }

        if (normalizedEvent !== 'messages.upsert') {
            return NextResponse.json({ ignored: true, event });
        }

        // data pode ser um objeto único ou um array de mensagens
        const messages = Array.isArray(data) ? data : [data];
        const results = [];
        for (const msg of messages) {
            if (!msg) continue;
            results.push(await handleSingleMessage(instance, msg));
        }

        return NextResponse.json({ processed: results.length, results });
    } catch (error) {
        console.error('[Evolution Webhook Error]:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

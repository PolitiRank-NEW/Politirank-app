import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { captionsMatch, extractMediaCaption, phonesMatch } from '@/lib/whatsapp-scan';
import { evolutionService } from '@/services/evolutionService';
import {
    ingestSourcePost,
    matchAgainstSourcePosts,
    resolveGroupSender,
} from '@/lib/whatsapp-source-scan';

/**
 * Evolution API Webhook Handler
 * Eventos tratados: messages.upsert (texto, enquetes, votos, Scanner de legendas)
 *
 * Observação sobre enquetes (polls):
 * - O voto chega em message.pollUpdateMessage e normalmente vem CRIPTOGRAFADO (encPayload/encIv).
 * - A Evolution tenta decriptar e, quando consegue, expõe as opções escolhidas em campos como
 *   pollUpdates / votes / selectedOptions. Como o formato varia por versão, fazemos parsing
 *   defensivo e logamos o payload cru para inspeção.
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
// Usado para rotular o voto, já que o pollUpdateMessage não traz o título.
const pollTitleCache = new Map<string, string>();

interface PollVoteEntry {
    pollId: string | null;
    pollTitle: string | null;
    option: string;
    votedAt: string;
}

function phoneFromJid(jid?: string): string | null {
    if (!jid) return null;
    const raw = jid.split('@')[0];
    return raw && /^\d+$/.test(raw) ? raw : raw || null;
}

/** Tenta extrair as opções votadas de formatos variados da Evolution/Baileys */
function extractSelectedOptions(msg: any): string[] {
    // Prioridade: opção já decriptada pela Evolution (campo mais confiável)
    const decrypted =
        msg?.message?.pollUpdateMessage?.vote?.selectedOptions ??
        msg?.pollUpdateMessage?.vote?.selectedOptions;
    if (Array.isArray(decrypted) && decrypted.length > 0) {
        return decrypted
            .map((o: unknown) => (typeof o === 'string' ? o : (o as { name?: string })?.name))
            .filter(Boolean) as string[];
    }

    const fallbackPaths = [msg?.pollVotes, msg?.pollUpdates];
    for (const p of fallbackPaths) {
        if (Array.isArray(p) && p.length > 0) {
            return p
                .map((o: any) => (typeof o === 'string' ? o : o?.name || o?.optionName || o?.value))
                .filter(Boolean);
        }
    }
    return [];
}

function extractPollTitle(msg: any): string | null {
    return (
        msg?.message?.pollCreationMessage?.name ||
        msg?.message?.pollCreationMessageV3?.name ||
        msg?.pollCreationMessage?.name ||
        null
    );
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

    // --- Criação de enquete ---
    if (isPollCreation) {
        const title = extractPollTitle(data);
        // A chave da mensagem de criação é referenciada pelos votos (pollCreationMessageKey.id)
        if (key.id && title) {
            pollTitleCache.set(key.id, title);
        }
        console.log(`[Evolution][POLL CREATED] grupo="${group.name}" título="${title}" pollId=${key.id}`);
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
        return { success: true, type: 'poll_created', group: group.name, title };
    }

    // --- Voto em enquete ---
    if (isPollVote) {
        // No voto, o WhatsApp identifica o votante pelo LID (ex.: 77412524134598@lid),
        // não pelo telefone. Por isso cruzamos primeiro pelo waLid salvo no sync.
        const voterJid = key.participant || key.remoteJid;
        const voterLid = phoneFromJid(voterJid);
        const options = extractSelectedOptions(data);

        // pollId identifica a enquete: usamos para deduplicar (o WhatsApp reenvia o mesmo voto
        // várias vezes, e mudanças de voto também chegam como novos eventos).
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

            const prevDetail: PollVoteEntry[] = Array.isArray(member.pollVotesDetail)
                ? (member.pollVotesDetail as unknown as PollVoteEntry[])
                : [];

            // Procura voto existente para a MESMA enquete (idempotência)
            const idx = prevDetail.findIndex((e) => e.pollId && pollId && e.pollId === pollId);
            const hasValidOptions = options.length > 0;

            const nextDetail = [...prevDetail];
            if (idx >= 0) {
                // Já votou nesta enquete: atualiza a opção só se agora temos opção decriptada.
                // Assim, reenvios do mesmo voto NÃO duplicam e mudanças de voto são refletidas.
                if (hasValidOptions) {
                    nextDetail[idx] = {
                        ...nextDetail[idx],
                        option: options.join(', '),
                        pollTitle: pollTitle ?? nextDetail[idx].pollTitle,
                        votedAt: new Date().toISOString(),
                    };
                }
            } else {
                nextDetail.push({
                    pollId,
                    pollTitle,
                    option: hasValidOptions ? options.join(', ') : '(voto pendente)',
                    votedAt: new Date().toISOString(),
                });
            }

            await prisma.whatsappGroupMember.update({
                where: { id: member.id },
                data: {
                    // pollVotes = nº de enquetes distintas votadas (não infla com reenvios)
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

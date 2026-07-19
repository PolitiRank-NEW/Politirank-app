import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import {
    buildMembersCsv,
    buildSourceScanCsv,
    normalizeExportPosters,
    type SourceScanExportGroupRow,
} from '@/lib/whatsapp-export';
import { looksLikeRealPhone } from '@/lib/whatsapp-source-scan';

export async function GET(req: Request) {
    try {
        const session = await auth();
        // @ts-ignore
        const userRole = session?.user?.role;

        if (!session || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'LIDER_CHAPA' && userRole !== 'CANDIDATO')) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        const groupId = searchParams.get('groupId');
        const mode = searchParams.get('mode'); // 'scanner' | membros (padrão)

        if (!candidateId && !groupId) {
            return NextResponse.json({ error: 'candidateId ou groupId é obrigatório.' }, { status: 400 });
        }

        // Export do Scanner Source: grupos + métricas + quem postou
        if (mode === 'scanner') {
            if (!candidateId) {
                return NextResponse.json(
                    { error: 'candidateId é obrigatório para export do Scanner.' },
                    { status: 400 }
                );
            }

            const sourcePostId = searchParams.get('sourcePostId');
            const sourceGroup = await prisma.whatsappGroup.findFirst({
                where: { candidateId, isSource: true },
                select: { id: true, name: true },
            });

            const targetGroups = await prisma.whatsappGroup.findMany({
                where: {
                    candidateId,
                    groupId: { not: null },
                    ...(sourceGroup ? { id: { not: sourceGroup.id } } : {}),
                },
                select: {
                    id: true,
                    name: true,
                    entryCount: true,
                    exitCount: true,
                    currentMembers: true,
                    lideranca: { select: { name: true } },
                },
                orderBy: { name: 'asc' },
            });

            const sourcePosts = await prisma.whatsappSourcePost.findMany({
                where: {
                    candidateId,
                    status: 'OPEN',
                    ...(sourcePostId ? { id: sourcePostId } : {}),
                },
                orderBy: { postedAt: 'desc' },
                take: sourcePostId ? 1 : 40,
                include: {
                    matches: { orderBy: { matchedAt: 'desc' } },
                },
            });

            // Mapa LID/telefone → telefone real (membros + outros matches)
            const lidToPhone = new Map<string, string>();
            const matchedGroupIds = [
                ...new Set(sourcePosts.flatMap((p) => p.matches.map((m) => m.groupId))),
            ];
            if (matchedGroupIds.length > 0) {
                const members = await prisma.whatsappGroupMember.findMany({
                    where: { groupId: { in: matchedGroupIds } },
                    select: { phone: true, waLid: true },
                });
                for (const m of members) {
                    if (!looksLikeRealPhone(m.phone)) continue;
                    const phone = (m.phone || '').replace(/\D/g, '');
                    if (m.waLid) lidToPhone.set(m.waLid.replace(/\D/g, ''), phone);
                    lidToPhone.set(phone, phone);
                }
            }
            for (const post of sourcePosts) {
                for (const m of post.matches) {
                    if (!looksLikeRealPhone(m.phone)) continue;
                    const phone = (m.phone || '').replace(/\D/g, '');
                    lidToPhone.set(phone, phone);
                    if (m.waLid) lidToPhone.set(m.waLid.replace(/\D/g, ''), phone);
                }
            }

            const resolvePhone = (raw: string | null | undefined) => {
                if (!raw) return null;
                const d = raw.replace(/\D/g, '');
                if (looksLikeRealPhone(d)) return d;
                return lidToPhone.get(d) || null;
            };

            const rows: SourceScanExportGroupRow[] = [];

            if (sourcePosts.length === 0) {
                for (const g of targetGroups) {
                    rows.push({
                        groupName: g.name,
                        liderancaName: g.lideranca?.name,
                        entryCount: g.entryCount ?? 0,
                        exitCount: g.exitCount ?? 0,
                        currentMembers: g.currentMembers ?? 0,
                        caption: '',
                        posted: false,
                        posters: [],
                        sourceGroupName: sourceGroup?.name || '',
                        sourcePostedAt: null,
                    });
                }
            } else {
                for (const post of sourcePosts) {
                    const matchesByGroup = new Map<string, typeof post.matches>();
                    for (const m of post.matches) {
                        const list = matchesByGroup.get(m.groupId) || [];
                        list.push(m);
                        matchesByGroup.set(m.groupId, list);
                    }

                    for (const g of targetGroups) {
                        const hits = matchesByGroup.get(g.id) || [];
                        rows.push({
                            groupName: g.name,
                            liderancaName: g.lideranca?.name,
                            entryCount: g.entryCount ?? 0,
                            exitCount: g.exitCount ?? 0,
                            currentMembers: g.currentMembers ?? 0,
                            caption: post.caption,
                            posted: hits.length > 0,
                            posters: normalizeExportPosters(
                                hits.map((h) => ({
                                    phone: h.phone,
                                    waLid: h.waLid,
                                    pushName: h.pushName,
                                    matchedAt: h.matchedAt,
                                })),
                                resolvePhone
                            ),
                            sourceGroupName: sourceGroup?.name || '',
                            sourcePostedAt: post.postedAt,
                        });
                    }
                }
            }

            const csv = buildSourceScanCsv(rows);
            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="scanner-conteudos-${candidateId}.csv"`,
                },
            });
        }

        const where: { groupId?: string; group?: { candidateId: string } } = {};
        if (groupId) where.groupId = groupId;
        else if (candidateId) where.group = { candidateId };

        const members = await prisma.whatsappGroupMember.findMany({
            where,
            include: {
                group: { include: { lideranca: true } },
            },
            orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
        });

        const csv = buildMembersCsv(members);
        const filename = groupId ? `whatsapp-grupo-${groupId}.csv` : `whatsapp-candidato-${candidateId}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

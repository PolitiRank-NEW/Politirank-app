import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';

/**
 * GET ?candidateId= — posts do Source + matches por grupo/telefone
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const candidateId = searchParams.get('candidateId');
        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const sourceGroup = await prisma.whatsappGroup.findFirst({
            where: { candidateId, isSource: true },
            select: { id: true, name: true, groupId: true, currentMembers: true },
        });

        // Não filtrar por isSource:false — no Mongo docs antigos sem o campo
        // não entram nesse filtro. Exclui só o Source pelo id.
        const targetGroups = await prisma.whatsappGroup.findMany({
            where: {
                candidateId,
                groupId: { not: null },
                ...(sourceGroup ? { id: { not: sourceGroup.id } } : {}),
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        const posts = await prisma.whatsappSourcePost.findMany({
            where: { candidateId, status: 'OPEN' },
            orderBy: { postedAt: 'desc' },
            take: 40,
            include: {
                matches: {
                    orderBy: { matchedAt: 'desc' },
                    include: {
                        group: { select: { id: true, name: true } },
                    },
                },
                group: { select: { id: true, name: true } },
            },
        });

        const enriched = posts.map((post) => {
            const byGroupMap = new Map(
                targetGroups.map((g) => [
                    g.id,
                    {
                        groupId: g.id,
                        groupName: g.name,
                        matched: false as boolean,
                        posters: [] as Array<{
                            phone: string | null;
                            pushName: string | null;
                            matchedAt: Date;
                            captionFound: string;
                        }>,
                    },
                ])
            );

            // Garante que matches apareçam mesmo se o grupo sumiu da lista-alvo
            for (const m of post.matches) {
                let row = byGroupMap.get(m.groupId);
                if (!row) {
                    row = {
                        groupId: m.groupId,
                        groupName: m.group?.name || 'Grupo',
                        matched: true,
                        posters: [],
                    };
                    byGroupMap.set(m.groupId, row);
                }
                row.matched = true;
                row.posters.push({
                    phone: m.phone,
                    pushName: m.pushName,
                    matchedAt: m.matchedAt,
                    captionFound: m.captionFound,
                });
            }

            const byGroup = [...byGroupMap.values()].sort((a, b) => {
                if (a.matched !== b.matched) return a.matched ? -1 : 1;
                return a.groupName.localeCompare(b.groupName, 'pt-BR');
            });
            const groupsMatched = byGroup.filter((g) => g.matched).length;
            return {
                ...post,
                isManual: String(post.messageId || '').startsWith('manual-'),
                summary: {
                    groupsMatched,
                    groupsTotal: byGroup.length,
                    uniquePhones: [
                        ...new Set(post.matches.map((m) => m.phone).filter(Boolean)),
                    ],
                },
                byGroup,
            };
        });

        return NextResponse.json({
            success: true,
            sourceGroup,
            targetGroupsCount: targetGroups.length,
            posts: enriched,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[scan/source GET]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST { candidateId, caption } — cadastra conteúdo Source manualmente
 * (para posts que já existiam antes da conexão).
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const candidateId = body?.candidateId as string | undefined;
        const caption = typeof body?.caption === 'string' ? body.caption.trim() : '';

        if (!candidateId) {
            return NextResponse.json({ error: 'candidateId é obrigatório.' }, { status: 400 });
        }
        if (!caption || caption.length < 2) {
            return NextResponse.json(
                { error: 'Informe a legenda/conteúdo (mín. 2 caracteres).' },
                { status: 400 }
            );
        }
        if (caption.length > 4000) {
            return NextResponse.json({ error: 'Legenda muito longa.' }, { status: 400 });
        }

        const access = await assertCandidateEvolutionAccess(candidateId);
        if ('error' in access) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const sourceGroup = await prisma.whatsappGroup.findFirst({
            where: { candidateId, isSource: true },
            select: { id: true, name: true },
        });
        if (!sourceGroup) {
            return NextResponse.json(
                {
                    error: 'Defina um grupo Source antes de cadastrar conteúdo manualmente.',
                },
                { status: 400 }
            );
        }

        const messageId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        const post = await prisma.whatsappSourcePost.create({
            data: {
                candidateId,
                groupId: sourceGroup.id,
                messageId,
                caption,
                hasMedia: false,
                mediaType: null,
                pushName: 'Input manual',
                phone: null,
                waLid: null,
                memberId: null,
                status: 'OPEN',
            },
        });

        return NextResponse.json({
            success: true,
            post,
            message: `Conteúdo cadastrado. O Scanner vai procurar essa legenda nos outros grupos.`,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        console.error('[scan/source POST]', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { assertCandidateEvolutionAccess } from '@/lib/evolution-access';
import { evolutionService } from '@/services/evolutionService';
import { aggregateUniqueWhatsappMetrics } from '@/lib/whatsapp-metrics';
import { migrateLegacyEntriesToSync } from '@/lib/whatsapp-group-live-sync';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Saúde WhatsApp: compara Evolution (celular) × PoliticRank (banco).
 * Assim você sabe se o sync leve está ok sem abrir 275 grupos.
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

        // Migra +418 antigas para entryCountSync (uma vez)
        await migrateLegacyEntriesToSync(candidateId);

        const instanceName = access.profile.evolutionInstanceName;
        if (!instanceName) {
            return NextResponse.json({
                ok: false,
                status: 'not_configured',
                message: 'WhatsApp ainda não conectado.',
            });
        }

        let evoGroups: Array<{ id?: string; size?: number; subject?: string }> = [];
        let evoError: string | null = null;
        try {
            evoGroups = (await evolutionService.fetchAllGroups(instanceName, false)) as typeof evoGroups;
        } catch (err) {
            evoError = err instanceof Error ? err.message : String(err);
        }

        const evoOnly = evoGroups.filter((g) => String(g.id || '').endsWith('@g.us'));
        const evoSeats = evoOnly.reduce((a, g) => a + (Number(g.size) || 0), 0);

        const dbGroups = await prisma.whatsappGroup.findMany({
            where: { candidateId },
            select: {
                id: true,
                name: true,
                groupId: true,
                lastUpdate: true,
                entryCount: true,
                exitCount: true,
                members: { select: { phone: true } },
                _count: { select: { members: true } },
            },
        });

        const withJid = dbGroups.filter((g) => g.groupId);
        const emptyMembers = dbGroups.filter((g) => (g._count?.members || 0) === 0);
        const metrics = aggregateUniqueWhatsappMetrics(dbGroups);

        const evoJids = new Set(evoOnly.map((g) => g.id as string));
        const missingInApp = evoOnly.filter((g) => !withJid.some((d) => d.groupId === g.id));
        const extraInApp = withJid.filter((g) => g.groupId && !evoJids.has(g.groupId));

        const seatsDiff = evoSeats - metrics.totalSeats;
        const groupsDiff = evoOnly.length - withJid.length;

        const lideranca = await prisma.whatsappLideranca.findFirst({
            where: {
                name: 'Grupos WhatsApp (Evolution)',
                candidateIds: { has: candidateId },
            } as never,
            select: { lastUpdate: true },
        });

        let status: 'ok' | 'warning' | 'critical' = 'ok';
        const issues: string[] = [];

        if (evoError) {
            status = 'critical';
            issues.push(`Evolution inacessível: ${evoError}`);
        }
        if (Math.abs(groupsDiff) > 0) {
            status = status === 'critical' ? 'critical' : 'warning';
            issues.push(
                groupsDiff > 0
                    ? `${groupsDiff} grupo(s) no celular ainda não estão no app`
                    : `${Math.abs(groupsDiff)} grupo(s) no app não existem mais no celular`
            );
        }
        if (emptyMembers.length > 5) {
            status = status === 'critical' ? 'critical' : 'warning';
            issues.push(`${emptyMembers.length} grupo(s) sem membros cadastrados (sync ainda preenchendo)`);
        }
        if (Math.abs(seatsDiff) > 10) {
            status = status === 'critical' ? 'critical' : 'warning';
            issues.push(
                `Diferença de ~${Math.abs(seatsDiff)} vagas entre WhatsApp (${evoSeats}) e app (${metrics.totalSeats})`
            );
        }
        if (!issues.length) {
            issues.push('Grupos e membros alinhados com a Evolution.');
        }

        return NextResponse.json({
            ok: status === 'ok',
            status,
            message:
                status === 'ok'
                    ? 'Dados sob controle — sync leve ok.'
                    : status === 'warning'
                      ? 'Há divergências — clique Verificar para sync leve agora.'
                      : 'Atenção: verifique Evolution/celular ou rode sync de emergência.',
            issues,
            seatsDiff,
            groupsDiff,
            evolution: {
                reachable: !evoError,
                groups: evoOnly.length,
                seats: evoSeats,
            },
            app: {
                groups: withJid.length,
                groupsEmptyMembers: emptyMembers.length,
                uniqueMembers: metrics.uniqueMembers,
                duplicatePhones: metrics.duplicatePhones,
                duplicateSeats: metrics.duplicateSeats,
                totalSeats: metrics.totalSeats,
                missingInApp: missingInApp.length,
                extraInApp: extraInApp.length,
            },
            lastLiderancaUpdate: lideranca?.lastUpdate || null,
            suggestFullSync: status === 'critical' || emptyMembers.length > 40 || Math.abs(groupsDiff) > 10,
            suggestLightSync:
                Math.abs(seatsDiff) > 10 ||
                Math.abs(groupsDiff) > 0 ||
                emptyMembers.length > 0,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

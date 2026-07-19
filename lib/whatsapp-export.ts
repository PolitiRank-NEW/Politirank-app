export type PollVoteEntry = {
    pollId?: string | null;
    pollTitle?: string | null;
    option: string;
    votedAt?: string;
};

export type MemberExportRecord = {
    name?: string | null;
    phone?: string | null;
    instagramHandle?: string | null;
    facebookHandle?: string | null;
    pollVotes?: number;
    pollVotesDetail?: unknown;
    igMatched?: boolean;
    igUsername?: string | null;
    igInteractionScore?: number | null;
    fbMatched?: boolean;
    fbUsername?: string | null;
    fbInteractionScore?: number | null;
    joinedAt?: Date | null;
    createdAt?: Date;
    group?: { name: string; lideranca?: { name?: string | null } | null };
};

export const MEMBER_CSV_HEADERS = [
    'Telefone',
    'Nome',
    'Liderança',
    'Grupo',
    'Data de Entrada',
    'Votos Enquete',
    'Histórico Enquetes',
    'Perfil Instagram',
    'Interações IG',
    'IG Cruzado',
    'Perfil Facebook',
    'Interações FB',
    'FB Cruzado',
] as const;

export function csvEscape(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.startsWith('=')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/**
 * Excel transforma telefones longos em notação científica (5,54E+12).
 * Exportar como fórmula de texto `="5511..."` força o número completo.
 */
export function formatPhoneForExcel(phone: string | null | undefined): string {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return String(phone).trim();
    return `="${digits}"`;
}

export function formatJoinedAt(member: MemberExportRecord): string {
    const d = member.joinedAt || member.createdAt;
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR');
}

export function getPollVoteEntries(detail: unknown): PollVoteEntry[] {
    if (!detail || !Array.isArray(detail)) return [];
    return detail
        .map((item) => item as PollVoteEntry)
        .filter((e) => e && (e.option || e.pollTitle));
}

export function formatPollVotesDetail(detail: unknown): string {
    return getPollVoteEntries(detail)
        .map((e) => {
            const label = e.pollTitle || 'Enquete';
            return `${label} → ${e.option || '?'}`;
        })
        .join(' | ');
}

export function memberToCsvRow(m: MemberExportRecord): string[] {
    return [
        formatPhoneForExcel(m.phone),
        m.name || '',
        m.group?.lideranca?.name || '',
        m.group?.name || '',
        formatJoinedAt(m),
        String(m.pollVotes ?? 0),
        formatPollVotesDetail(m.pollVotesDetail),
        m.instagramHandle ? `@${m.instagramHandle}` : '',
        m.igInteractionScore != null ? String(m.igInteractionScore) : '',
        m.igMatched ? 'Sim' : 'Não',
        m.facebookHandle ? `@${m.facebookHandle}` : '',
        m.fbInteractionScore != null ? String(m.fbInteractionScore) : '',
        m.fbMatched ? 'Sim' : 'Não',
    ];
}

export function buildMembersCsv(members: MemberExportRecord[]): string {
    const rows = members.map((m) => memberToCsvRow(m).map(csvEscape).join(','));
    // BOM UTF-8 para o Excel abrir acentos corretamente
    return `\uFEFF${[MEMBER_CSV_HEADERS.join(','), ...rows].join('\n')}`;
}

/** Export do Scanner Source: 1 linha por grupo × conteúdo de referência. */
export const SOURCE_SCAN_CSV_HEADERS = [
    'Grupo',
    'Liderança',
    'Entraram',
    'Saíram',
    'Total no grupo',
    'Conteúdo (legenda Source)',
    'Postou o conteúdo',
    'Quem postou (telefone)',
    'Quem postou (nome)',
    'Data da postagem',
    'Grupo Source',
    'Data do conteúdo Source',
] as const;

export type SourceScanExportPoster = {
    phone?: string | null;
    waLid?: string | null;
    pushName?: string | null;
    matchedAt?: Date | string | null;
};

export type SourceScanExportGroupRow = {
    groupName: string;
    liderancaName?: string | null;
    entryCount: number;
    exitCount: number;
    currentMembers: number;
    caption: string;
    posted: boolean;
    posters: SourceScanExportPoster[];
    sourceGroupName?: string | null;
    sourcePostedAt?: Date | string | null;
};

/** Junta posters duplicados (mesma pessoa postou 2x) e evita misturar LID com telefone. */
export function normalizeExportPosters(
    posters: SourceScanExportPoster[],
    resolvePhone?: (phoneOrLid: string | null | undefined) => string | null
): SourceScanExportPoster[] {
    const byKey = new Map<string, SourceScanExportPoster & { dates: string[] }>();

    for (const p of posters) {
        const rawPhone = (p.phone || '').replace(/\D/g, '');
        const rawLid = (p.waLid || '').replace(/\D/g, '');
        const resolved =
            resolvePhone?.(p.phone) ||
            resolvePhone?.(p.waLid) ||
            (rawPhone.length >= 10 && rawPhone.length <= 13 ? rawPhone : null) ||
            null;

        // Não exportar LID (14+ dígitos) como se fosse telefone
        const phone =
            resolved && resolved.length >= 10 && resolved.length <= 13 ? resolved : null;
        const key = phone || rawLid || rawPhone || p.pushName || 'unknown';
        const dateStr = p.matchedAt
            ? typeof p.matchedAt === 'string' && p.matchedAt.includes('|')
                ? p.matchedAt
                : new Date(p.matchedAt).toLocaleString('pt-BR')
            : '';
        const existing = byKey.get(key);
        if (existing) {
            if (dateStr) {
                for (const d of dateStr.split(' | ')) {
                    if (d && !existing.dates.includes(d)) existing.dates.push(d);
                }
            }
            if (!existing.phone && phone) existing.phone = phone;
            if (!existing.pushName && p.pushName) existing.pushName = p.pushName;
        } else {
            byKey.set(key, {
                phone,
                waLid: p.waLid,
                pushName: p.pushName,
                matchedAt: p.matchedAt,
                dates: dateStr ? dateStr.split(' | ').filter(Boolean) : [],
            });
        }
    }

    return [...byKey.values()].map((p) => ({
        phone: p.phone,
        waLid: p.waLid,
        pushName: p.pushName,
        matchedAt: p.dates.length ? p.dates.join(' | ') : p.matchedAt,
    }));
}

export function buildSourceScanCsv(rows: SourceScanExportGroupRow[]): string {
    const lines = rows.map((r) => {
        // Já normalizado na API; só dedupe leve se vier cru
        const posters =
            r.posters.length && r.posters.some((p) => p.phone || p.pushName)
                ? r.posters
                : normalizeExportPosters(r.posters);
        const phones = posters
            .map((p) => formatPhoneForExcel(p.phone))
            .filter(Boolean)
            .join(' | ');
        const names = posters
            .map((p) => (p.pushName || '').trim())
            .filter(Boolean)
            .join(' | ');
        const dates = posters
            .map((p) => {
                if (!p.matchedAt) return '';
                if (typeof p.matchedAt === 'string' && (p.matchedAt.includes('|') || p.matchedAt.includes('/'))) {
                    return p.matchedAt;
                }
                return new Date(p.matchedAt).toLocaleString('pt-BR');
            })
            .filter(Boolean)
            .join(' | ');

        return [
            r.groupName,
            r.liderancaName || '',
            String(r.entryCount ?? 0),
            String(r.exitCount ?? 0),
            String(r.currentMembers ?? 0),
            r.caption || '',
            r.posted ? 'Sim' : 'Não',
            phones,
            names,
            dates,
            r.sourceGroupName || '',
            r.sourcePostedAt
                ? new Date(r.sourcePostedAt).toLocaleString('pt-BR')
                : '',
        ]
            .map(csvEscape)
            .join(',');
    });

    return `\uFEFF${[SOURCE_SCAN_CSV_HEADERS.join(','), ...lines].join('\n')}`;
}

export const MEMBER_CSV_TEMPLATE = `${MEMBER_CSV_HEADERS.join(',')}
21999998888,Maria Silva,Liderança Centro,Grupo Voluntários,15/03/2026,2,"Enquete 1 → Sim | Enquete 2 → Opção B",maria.silva,12,Sim,maria.silva.fb,8,Sim
21988887777,João Santos,Liderança Centro,Grupo Voluntários,01/02/2026,0,,joao.santos,,Não,,,Não
`;

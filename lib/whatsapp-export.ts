export type PollVoteEntry = {
    pollTitle: string;
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
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export function formatJoinedAt(member: MemberExportRecord): string {
    const d = member.joinedAt || member.createdAt;
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR');
}

export function formatPollVotesDetail(detail: unknown): string {
    if (!detail) return '';
    if (!Array.isArray(detail)) return '';
    return detail
        .map((item) => {
            const e = item as PollVoteEntry;
            if (!e?.pollTitle) return '';
            return `${e.pollTitle} → ${e.option || '?'}`;
        })
        .filter(Boolean)
        .join(' | ');
}

export function memberToCsvRow(m: MemberExportRecord): string[] {
    return [
        m.phone || '',
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
    return [MEMBER_CSV_HEADERS.join(','), ...rows].join('\n');
}

export const MEMBER_CSV_TEMPLATE = `${MEMBER_CSV_HEADERS.join(',')}
21999998888,Maria Silva,Liderança Centro,Grupo Voluntários,15/03/2026,2,"Enquete 1 → Sim | Enquete 2 → Opção B",maria.silva,12,Sim,maria.silva.fb,8,Sim
21988887777,João Santos,Liderança Centro,Grupo Voluntários,01/02/2026,0,,joao.santos,,Não,,,Não
`;

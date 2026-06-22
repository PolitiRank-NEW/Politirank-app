import { normalizeIgHandle, cleanPhone } from '@/lib/whatsapp-utils';
import type { PollVoteEntry } from '@/lib/whatsapp-export';

export type MemberImportRow = {
    name: string;
    phone: string;
    groupName: string;
    joinedAt: string;
    pollVotes: string;
    pollVotesDetail: string;
    instagramHandle: string;
    igInteractionScore: string;
    facebookHandle: string;
    fbInteractionScore: string;
};

function findCell(row: Record<string, unknown>, ...aliases: string[]): string {
    const keys = Object.keys(row);
    for (const alias of aliases) {
        const key = keys.find((k) => k.trim().toLowerCase() === alias.toLowerCase());
        if (!key) continue;
        const val = row[key];
        if (val !== null && val !== undefined && String(val).trim()) {
            return String(val).trim();
        }
    }
    return '';
}

/** Mapeia uma linha do CSV (cabeçalhos flexíveis) para campos de membro. */
export function mapCsvRowToMember(row: Record<string, unknown>): MemberImportRow {
    const rawIg = findCell(
        row,
        'perfil instagram',
        'instagram',
        '@instagram',
        'ig',
        'instagram_handle'
    );
    const rawFb = findCell(
        row,
        'perfil facebook',
        'facebook',
        '@facebook',
        'fb',
        'facebook_handle'
    );

    return {
        name: findCell(row, 'nome', 'name', 'Nome', 'Name'),
        phone: findCell(
            row,
            'telefone',
            'numero telefone',
            'número telefone',
            'phone',
            'Telefone',
            'Phone',
            'celular',
            'whatsapp',
            'whats'
        ),
        groupName: findCell(row, 'grupo', 'grupo que pertence', 'group', 'Grupo'),
        joinedAt: findCell(row, 'data de entrada', 'data entrada', 'entrada', 'joinedat', 'joined_at'),
        pollVotes: findCell(row, 'votos enquete', 'votos', 'pollvotes', 'poll_votes'),
        pollVotesDetail: findCell(
            row,
            'histórico enquetes',
            'historico enquetes',
            'votos enquete detalhe',
            'pollvotesdetail',
            'poll_votes_detail'
        ),
        instagramHandle: rawIg.replace(/^@/, ''),
        igInteractionScore: findCell(row, 'interações ig', 'interacoes ig', 'ig score', 'ig_interaction_score'),
        facebookHandle: rawFb.replace(/^@/, ''),
        fbInteractionScore: findCell(row, 'interações fb', 'interacoes fb', 'fb score', 'fb_interaction_score'),
    };
}

export function parseJoinedAt(raw: string): Date | null {
    if (!raw) return null;
    const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
        const [, d, m, y] = br;
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const iso = new Date(raw);
    return Number.isNaN(iso.getTime()) ? null : iso;
}

/** "Enquete 1 → Sim | Enquete 2 → Opção B" ou JSON array */
export function parsePollVotesDetail(raw: string): PollVoteEntry[] | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (!Array.isArray(parsed)) return null;
            return parsed
                .map((item) => {
                    const e = item as Record<string, unknown>;
                    const pollTitle = String(e.pollTitle || e.poll || e.enquete || '').trim();
                    const option = String(e.option || e.opcao || e.voto || '').trim();
                    if (!pollTitle) return null;
                    const entry: PollVoteEntry = { pollTitle, option };
                    if (e.votedAt) entry.votedAt = String(e.votedAt);
                    return entry;
                })
                .filter((x): x is PollVoteEntry => x !== null);
        } catch {
            return null;
        }
    }

    const parts = trimmed.split(/\s*\|\s*/);
    const entries: PollVoteEntry[] = [];
    for (const part of parts) {
        const match = part.match(/^(.+?)\s*(?:→|->|:)\s*(.+)$/);
        if (match) {
            entries.push({ pollTitle: match[1].trim(), option: match[2].trim() });
        }
    }
    return entries.length > 0 ? entries : null;
}

function parseOptionalInt(raw: string): number | undefined {
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
}

export function normalizeMemberForDb(row: MemberImportRow) {
    const pollVotesDetail = parsePollVotesDetail(row.pollVotesDetail);
    const pollVotesFromDetail = pollVotesDetail?.length;
    const pollVotesExplicit = parseOptionalInt(row.pollVotes);

    return {
        name: row.name || null,
        phone: row.phone || null,
        instagramHandle:
            normalizeIgHandle(row.instagramHandle) ||
            (row.instagramHandle ? row.instagramHandle.replace(/^@/, '') : null),
        facebookHandle: row.facebookHandle ? row.facebookHandle.replace(/^@/, '') : null,
        joinedAt: parseJoinedAt(row.joinedAt),
        pollVotes: pollVotesExplicit ?? pollVotesFromDetail ?? 0,
        pollVotesDetail: pollVotesDetail ?? undefined,
        igInteractionScore: parseOptionalInt(row.igInteractionScore),
        fbInteractionScore: parseOptionalInt(row.fbInteractionScore),
    };
}

export function memberRowKey(phone: string | null | undefined, name: string | null | undefined): string | null {
    const p = cleanPhone(phone);
    if (p) return `phone:${p}`;
    const n = (name || '').trim().toLowerCase();
    if (n) return `name:${n}`;
    return null;
}

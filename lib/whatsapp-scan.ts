/** Normaliza legenda para comparação (minúsculas, espaços colapsados). */
export function normalizeCaption(raw: string | null | undefined): string {
    if (!raw) return '';
    return raw
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function captionsMatch(
    found: string,
    expected: string,
    matchMode: string = 'CONTAINS'
): boolean {
    const a = normalizeCaption(found);
    const b = normalizeCaption(expected);
    if (!a || !b) return false;
    if (matchMode === 'EXACT') return a === b;
    return a.includes(b);
}

/** Só dígitos. */
export function digitsPhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const d = raw.replace(/\D/g, '');
    return d || null;
}

/**
 * Compara telefones BR/intl: igualdade ou um termina com o outro (mín. 8 dígitos).
 * Ex.: 11999998888 ≈ 5511999998888
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
    const x = digitsPhone(a);
    const y = digitsPhone(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const min = 8;
    if (x.length >= min && y.length >= min) {
        return x.endsWith(y) || y.endsWith(x);
    }
    return false;
}

/** Aceita lista separada por vírgula, espaço ou quebra de linha. */
export function parsePhonesList(raw: string | string[] | null | undefined): string[] {
    const parts = Array.isArray(raw)
        ? raw
        : String(raw || '')
              .split(/[\s,;]+/)
              .map((s) => s.trim())
              .filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
        const d = digitsPhone(p);
        if (!d || seen.has(d)) continue;
        seen.add(d);
        out.push(d);
    }
    return out;
}

export type ScanComplianceRow = {
    phone: string;
    name: string | null;
    memberId: string | null;
    status: 'done' | 'pending';
    hitId: string | null;
    matchedAt: string | null;
    captionFound: string | null;
};

export type ScanHitLike = {
    id: string;
    phone?: string | null;
    waLid?: string | null;
    memberId?: string | null;
    pushName?: string | null;
    captionFound?: string;
    matchedAt: Date | string;
};

export type ScanMemberLike = {
    id: string;
    phone?: string | null;
    waLid?: string | null;
    name?: string | null;
};

/** Monta checklist telefone → cumprido/pendente. */
export function buildComplianceRows(
    expectedPhones: string[],
    members: ScanMemberLike[],
    hits: ScanHitLike[]
): ScanComplianceRow[] {
    const phones =
        expectedPhones.length > 0
            ? (expectedPhones.map((p) => digitsPhone(p)).filter(Boolean) as string[])
            : (members.map((m) => digitsPhone(m.phone)).filter(Boolean) as string[]);

    const uniquePhones: string[] = [];
    const seen = new Set<string>();
    for (const p of phones) {
        if (seen.has(p)) continue;
        seen.add(p);
        uniquePhones.push(p);
    }

    return uniquePhones.map((phone) => {
        const member =
            members.find((m) => phonesMatch(m.phone, phone) || phonesMatch(m.waLid, phone)) ||
            null;

        const hit =
            hits.find(
                (h) =>
                    (member && h.memberId && h.memberId === member.id) ||
                    phonesMatch(h.phone, phone) ||
                    phonesMatch(h.waLid, phone) ||
                    (member?.waLid && phonesMatch(h.waLid, member.waLid))
            ) || null;

        return {
            phone,
            name: member?.name || hit?.pushName || null,
            memberId: member?.id || null,
            status: hit ? 'done' : 'pending',
            hitId: hit?.id || null,
            matchedAt: hit
                ? typeof hit.matchedAt === 'string'
                    ? hit.matchedAt
                    : hit.matchedAt.toISOString()
                : null,
            captionFound: hit?.captionFound || null,
        };
    });
}

/** Extrai caption + tipo de mídia de um message Baileys/Evolution. */
export function extractMediaCaption(message: Record<string, unknown> | null | undefined): {
    caption: string | null;
    hasMedia: boolean;
    mediaType: 'image' | 'video' | 'document' | 'none';
} {
    if (!message) {
        return { caption: null, hasMedia: false, mediaType: 'none' };
    }

    const image = message.imageMessage as { caption?: string } | undefined;
    if (image) {
        return {
            caption: image.caption ?? null,
            hasMedia: true,
            mediaType: 'image',
        };
    }

    const video = message.videoMessage as { caption?: string } | undefined;
    if (video) {
        return {
            caption: video.caption ?? null,
            hasMedia: true,
            mediaType: 'video',
        };
    }

    const doc = message.documentMessage as { caption?: string } | undefined;
    if (doc) {
        return {
            caption: doc.caption ?? null,
            hasMedia: true,
            mediaType: 'document',
        };
    }

    const extended = message.extendedTextMessage as { text?: string } | undefined;
    if (typeof extended?.text === 'string') {
        return { caption: extended.text, hasMedia: false, mediaType: 'none' };
    }

    if (typeof message.conversation === 'string') {
        return { caption: message.conversation, hasMedia: false, mediaType: 'none' };
    }

    return { caption: null, hasMedia: false, mediaType: 'none' };
}

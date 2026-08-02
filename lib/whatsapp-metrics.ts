/**
 * Métricas WhatsApp precisas:
 * - Total membros = telefones ÚNICOS (pessoa em vários grupos conta 1 vez)
 * - Duplicados = telefones que aparecem em 2+ grupos
 * - Cada grupo continua com a lista completa de membros (precisão por grupo)
 */

function normalizePhone(phone: string | null | undefined): string | null {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 8 ? digits : null;
}

/** Chave estável para cruzar o mesmo número com/sem 55 */
function phoneKey(phone: string): string {
    if (phone.startsWith('55') && phone.length >= 12) return phone.slice(-11);
    if (phone.length >= 11) return phone.slice(-11);
    return phone;
}

export type GroupWithMemberPhones = {
    currentMembers?: number | null;
    entryCount?: number | null;
    entryCountSync?: number | null;
    exitCount?: number | null;
    duplicateMembers?: number | null;
    _count?: { members?: number };
    members?: Array<{ phone?: string | null }>;
};

export function groupMemberCount(g: GroupWithMemberPhones): number {
    if (typeof g?._count?.members === 'number') return g._count.members;
    if (Array.isArray(g?.members)) return g.members.length;
    return Number(g?.currentMembers) || 0;
}

export function aggregateUniqueWhatsappMetrics(
    groups: GroupWithMemberPhones[]
): {
    /** Pessoas únicas (telefone) */
    uniqueMembers: number;
    /** Quantidade de telefones que estão em 2+ grupos */
    duplicatePhones: number;
    /** Vagas extras além da 1ª ocorrência (soma de (n-1) por telefone duplicado) */
    duplicateSeats: number;
    /** Soma bruta de vagas em todos os grupos */
    totalSeats: number;
    /** Entradas reais (webhook) */
    entries: number;
    /** Entradas do sync/catch-up */
    entriesSync: number;
    exits: number;
} {
    const phoneGroups = new Map<string, number>();
    let totalSeats = 0;
    let entries = 0;
    let entriesSync = 0;
    let exits = 0;

    for (const g of groups) {
        totalSeats += groupMemberCount(g);
        entries += g.entryCount || 0;
        entriesSync += g.entryCountSync || 0;
        exits += g.exitCount || 0;

        const members = Array.isArray(g.members) ? g.members : [];
        for (const m of members) {
            const phone = normalizePhone(m.phone);
            if (!phone) continue;
            const key = phoneKey(phone);
            phoneGroups.set(key, (phoneGroups.get(key) || 0) + 1);
        }
    }

    let duplicatePhones = 0;
    let duplicateSeats = 0;
    for (const count of phoneGroups.values()) {
        if (count > 1) {
            duplicatePhones += 1;
            duplicateSeats += count - 1;
        }
    }

    // Se não carregamos phones, unique ≈ seats (fallback)
    const uniqueMembers =
        phoneGroups.size > 0 ? phoneGroups.size : Math.max(0, totalSeats - duplicateSeats);

    return {
        uniqueMembers,
        duplicatePhones,
        duplicateSeats,
        totalSeats,
        entries,
        entriesSync,
        exits,
    };
}

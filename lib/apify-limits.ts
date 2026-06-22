/** Limites globais do Apify — manter baixo para economizar no plano Bronze. */
export const APIFY_POSTS_LIMIT = 18;

/** Após o 1º sync, busca só os posts mais recentes para detectar novidades (mais barato). */
export const APIFY_INCREMENTAL_POSTS_LIMIT = 6;

/** Posts mais recentes usados para buscar comentários (ranking FB). */
export const APIFY_FB_POSTS_FOR_COMMENTS = 6;

/** Máximo de comentários coletados por post no ranking FB. */
export const APIFY_FB_COMMENTS_PER_POST = 25;

/** Posts mais recentes usados para buscar comentários (ranking IG). */
export const APIFY_IG_POSTS_FOR_COMMENTS = 6;

/** Máximo de comentários coletados por post no ranking IG. */
export const APIFY_IG_COMMENTS_PER_POST = 25;

export function parsePostTimestamp(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'number') {
        // Apify IG às vezes retorna unix em segundos
        return value < 1e12 ? value * 1000 : value;
    }
    const ms = new Date(String(value)).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

/** Converte timestamp bruto do Apify para ISO (ordenação e exibição consistentes). */
export function normalizePostTimestamp(value: unknown): string | null {
    const ms = parsePostTimestamp(value);
    return ms > 0 ? new Date(ms).toISOString() : null;
}

/** Ordena posts do mais recente para o mais antigo e limita a N itens. */
export function sortAndLimitPosts<T extends { timestamp?: unknown }>(
    posts: T[],
    limit = APIFY_POSTS_LIMIT
): T[] {
    return [...posts]
        .sort((a, b) => parsePostTimestamp(b.timestamp) - parsePostTimestamp(a.timestamp))
        .slice(0, limit);
}

/**
 * Serviço de scraping do Facebook via Apify (não-oficial, perfis/páginas públicas).
 * Usa três actors oficiais do Apify:
 *  - apify/facebook-posts-scraper    -> publicações + métricas de engajamento
 *  - apify/facebook-comments-scraper -> comentários (para o ranking de engajadores)
 *  - apify/facebook-pages-scraper    -> dados da página (seguidores, nome)
 */

const POSTS_ACTOR = 'apify~facebook-posts-scraper';
const COMMENTS_ACTOR = 'apify~facebook-comments-scraper';
const PAGES_ACTOR = 'apify~facebook-pages-scraper';

/** Converte valores como "1.3K", "2M", "1,234" em número. */
export function parseCount(value: unknown): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const s = String(value).trim().replace(/,/g, '');
    const m = s.match(/^([\d.]+)\s*([KkMmBb])?$/);
    if (!m) {
        const n = parseInt(s.replace(/\D/g, ''), 10);
        return isNaN(n) ? 0 : n;
    }
    let n = parseFloat(m[1]);
    const suffix = (m[2] || '').toUpperCase();
    if (suffix === 'K') n *= 1e3;
    else if (suffix === 'M') n *= 1e6;
    else if (suffix === 'B') n *= 1e9;
    return Math.round(n);
}

export const facebookService = {
    cleanHandle(handle: string) {
        let h = handle.trim();
        // Aceita URL completa ou só o nome de usuário
        const urlMatch = h.match(/facebook\.com\/([^/?#]+)/i);
        if (urlMatch) h = urlMatch[1];
        return h.replace('@', '').trim();
    },

    pageUrl(handle: string) {
        return `https://www.facebook.com/${this.cleanHandle(handle)}/`;
    },

    getToken() {
        const token = process.env.APIFY_API_TOKEN;
        if (!token) throw new Error('Token do Apify não configurado (APIFY_API_TOKEN).');
        return token;
    },

    /** Inicia a coleta de posts (assíncrona). Retorna o runId. */
    async startPostsRun(handle: string, resultsLimit = 30) {
        const token = this.getToken();
        const input = {
            startUrls: [{ url: this.pageUrl(handle) }],
            resultsLimit,
        };

        const res = await fetch(`https://api.apify.com/v2/acts/${POSTS_ACTOR}/runs?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Apify retornou erro ${res.status}: ${err.error?.message || 'Falha ao iniciar coleta de posts.'}`);
        }
        const json = await res.json();
        return json.data.id as string;
    },

    /** Status genérico de uma run do Apify (independe do actor). */
    async getRunStatus(runId: string) {
        const token = this.getToken();
        const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
        if (!res.ok) return { status: 'UNKNOWN', datasetId: null as string | null };
        const json = await res.json();
        return {
            status: json.data?.status || 'UNKNOWN',
            datasetId: (json.data?.defaultDatasetId as string) || null,
        };
    },

    /** Busca os itens de um dataset já finalizado. */
    async fetchDatasetItems(datasetId: string) {
        const token = this.getToken();
        const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
        if (!res.ok) return [];
        const items = await res.json();
        return Array.isArray(items) ? items : [];
    },

    /** Coleta comentários de uma lista de URLs de posts (síncrono, bloqueante). */
    async fetchComments(postUrls: string[], resultsLimit = 50) {
        if (postUrls.length === 0) return [];
        const token = this.getToken();
        const input = {
            startUrls: postUrls.map((url) => ({ url })),
            resultsLimit,
            includeNestedComments: false,
            viewOption: 'RANKED_UNFILTERED',
        };

        try {
            const res = await fetch(
                `https://api.apify.com/v2/acts/${COMMENTS_ACTOR}/run-sync-get-dataset-items?token=${token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                }
            );
            if (!res.ok) {
                console.warn('[FB] fetchComments falhou:', res.status);
                return [];
            }
            const items = await res.json();
            return Array.isArray(items) ? items : [];
        } catch (e) {
            console.warn('[FB] fetchComments erro:', e);
            return [];
        }
    },

    /** Busca dados da página (seguidores, nome) de forma síncrona. */
    async getPageInfo(handle: string) {
        const token = this.getToken();
        const input = {
            startUrls: [{ url: this.pageUrl(handle) }],
        };

        try {
            const res = await fetch(
                `https://api.apify.com/v2/acts/${PAGES_ACTOR}/run-sync-get-dataset-items?token=${token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                }
            );
            if (!res.ok) {
                console.warn('[FB] getPageInfo falhou:', res.status);
                return null;
            }
            const items = await res.json();
            const p = Array.isArray(items) ? items[0] : null;
            if (!p || p.error) return null;

            return {
                username: this.cleanHandle(handle),
                name: p.title || p.name || p.pageName || null,
                followers: parseCount(p.followers ?? p.followersCount ?? p.likes ?? p.likesCount) || null,
                likes: parseCount(p.likes ?? p.likesCount) || null,
                category: p.categories?.[0] || p.category || null,
                verified: p.isBusinessPageActive ?? p.verified ?? false,
            };
        } catch (e) {
            console.warn('[FB] getPageInfo erro:', e);
            return null;
        }
    },
};

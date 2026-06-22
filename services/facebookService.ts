/**
 * Scraping do Facebook via Apify (perfis/páginas públicas).
 *
 * Actors em uso (ver lib/apify-actors.ts):
 *  - facebook-posts-scraper    → publicações
 *  - facebook-comments-scraper → comentários (ranking)
 *  - fb-profile (leve)         → seguidores/nome (1ª tentativa, mais barato)
 *  - facebook-pages-scraper    → fallback se o profile não trouxer dados
 */

import {
    APIFY_POSTS_LIMIT,
    APIFY_FB_COMMENTS_PER_POST,
} from '@/lib/apify-limits';
import { APIFY_ACTORS } from '@/lib/apify-actors';
import type { CachedPageInfo } from '@/lib/tracked-cache';

const POSTS_ACTOR = APIFY_ACTORS.facebook.posts;
const COMMENTS_ACTOR = APIFY_ACTORS.facebook.comments;
const PAGES_ACTOR = APIFY_ACTORS.facebook.pages;
const PROFILE_ACTOR = APIFY_ACTORS.facebook.profile;

/** Converte valores como "1.3K", "2M", "1,234" em número. */
export function parseCount(value: unknown): number {
    if (typeof value === 'number' && !isNaN(value)) return value;
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

/** Extrai contagem de texto livre (ex.: "28,635,187 likes", "1.2M seguidores"). */
export function parseCountFromText(text: string): number | null {
    const patterns = [
        /([\d.,]+)\s*([KkMmBb])?\s*(?:people\s+)?(?:like|likes|curtidas?|seguidores?|followers?)/i,
        /(?:like|likes|curtidas?|seguidores?|followers?)[:\s]+([\d.,]+)\s*([KkMmBb])?/i,
    ];
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) {
            const raw = m[1].replace(/,/g, '');
            let n = parseFloat(raw);
            if (isNaN(n)) continue;
            const suffix = (m[2] || '').toUpperCase();
            if (suffix === 'K') n *= 1e3;
            else if (suffix === 'M') n *= 1e6;
            else if (suffix === 'B') n *= 1e9;
            if (n > 0) return Math.round(n);
        }
    }
    return null;
}

/** Tenta extrair seguidores/curtidas de um objeto retornado pelo Apify. */
export function extractFollowerCount(data: Record<string, unknown> | null | undefined): number | null {
    if (!data || data.error) return null;

    const directFields = [
        data.followers,
        data.followersCount,
        data.followerCount,
        data.likes,
        data.likesCount,
        data.likeCount,
        data.fanCount,
        data.fans,
        data.audienceSize,
        data.pageLikes,
    ];

    for (const field of directFields) {
        const n = parseCount(field);
        if (n > 0) return n;
    }

    if (Array.isArray(data.info)) {
        for (const line of data.info) {
            const fromInfo = parseCountFromText(String(line));
            if (fromInfo) return fromInfo;
        }
    }

    if (data.title) {
        const fromTitle = parseCountFromText(String(data.title));
        if (fromTitle) return fromTitle;
    }

    return null;
}

function applyPageMetadata(
    pageData: Record<string, unknown>,
    state: {
        followers: number | null;
        name: string | null;
        category: string | null;
        verified: boolean;
        likes: number | null;
    }
) {
    if (!state.followers) {
        state.followers = extractFollowerCount(pageData);
    }
    if (!state.name) {
        state.name =
            String(
                pageData.title ||
                    pageData.name ||
                    pageData.pageName ||
                    (pageData.personalProfile as { name?: string } | undefined)?.name ||
                    ''
            ) || null;
    }
    if (!state.category) {
        state.category =
            (pageData.categories as string[] | undefined)?.[0] ||
            (pageData.category as string) ||
            null;
    }
    state.verified = state.verified || Boolean(pageData.isBusinessPageActive ?? pageData.verified);
    const pageLikes = parseCount(pageData.likes ?? pageData.likesCount) || null;
    if (pageLikes && !state.likes) state.likes = pageLikes;
}

function applyProfileMetadata(
    profileData: Record<string, unknown>,
    state: {
        followers: number | null;
        name: string | null;
    }
) {
    if (!state.followers) {
        state.followers = extractFollowerCount(profileData);
    }
    if (!state.name) {
        state.name = String(profileData.name || profileData.fullName || '') || null;
    }
}

async function runSyncActor(actor: string, input: Record<string, unknown>) {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error('Token do Apify não configurado (APIFY_API_TOKEN).');

    const res = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        }
    );

    if (!res.ok) {
        console.warn(`[FB] Actor ${actor} falhou:`, res.status);
        return [];
    }

    const items = await res.json();
    return Array.isArray(items) ? items : [];
}

export const facebookService = {
    cleanHandle(handle: string) {
        let h = handle.trim();
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

    async startPostsRun(handle: string, resultsLimit = APIFY_POSTS_LIMIT) {
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

    async fetchDatasetItems(datasetId: string) {
        const token = this.getToken();
        const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
        if (!res.ok) return [];
        const items = await res.json();
        return Array.isArray(items) ? items : [];
    },

    async fetchComments(postUrls: string[], resultsLimit = APIFY_FB_COMMENTS_PER_POST) {
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

    /**
     * Busca seguidores/nome da página com o mínimo de chamadas Apify.
     * Se `cached` já tiver seguidores no MongoDB, não chama Apify.
     */
    async getPageInfo(
        handle: string,
        fallbackFollowers = 0,
        options?: { forceApify?: boolean; cached?: CachedPageInfo | null }
    ) {
        const cleanHandle = this.cleanHandle(handle);

        if (!options?.forceApify) {
            const cachedFollowers =
                (options?.cached?.followers && options.cached.followers > 0
                    ? options.cached.followers
                    : null) || (fallbackFollowers > 0 ? fallbackFollowers : null);

            if (cachedFollowers) {
                console.log(
                    `[FB] getPageInfo: usando cache (${options?.cached?.source || 'manual'}) — ${cachedFollowers} seguidores, sem Apify.`
                );
                return {
                    username: cleanHandle,
                    name: options?.cached?.name ?? null,
                    followers: cachedFollowers,
                    likes: options?.cached?.likes ?? null,
                    category: options?.cached?.category ?? null,
                    verified: options?.cached?.verified ?? false,
                };
            }
        }

        const pageUrl = this.pageUrl(cleanHandle);

        const state = {
            followers: null as number | null,
            name: null as string | null,
            category: null as string | null,
            verified: false,
            likes: null as number | null,
        };

        try {
            console.log('[FB] getPageInfo: tentando profile-scraper (leve)...');
            const profileItems = await runSyncActor(PROFILE_ACTOR, { startUrls: [pageUrl] });
            const profileData = profileItems[0] as Record<string, unknown> | undefined;
            if (profileData && !profileData.error) {
                applyProfileMetadata(profileData, state);
            }

            const needsPagesFallback = !state.followers || !state.name;
            if (needsPagesFallback) {
                console.log('[FB] getPageInfo: profile insuficiente — tentando pages-scraper...');
                const pageItems = await runSyncActor(PAGES_ACTOR, { startUrls: [{ url: pageUrl }] });
                const pageData = pageItems[0] as Record<string, unknown> | undefined;
                if (pageData && !pageData.error) {
                    applyPageMetadata(pageData, state);
                }
            }

            if (!state.followers && fallbackFollowers > 0) {
                console.log(`[FB] Usando seguidores manuais do cadastro: ${fallbackFollowers}`);
                state.followers = fallbackFollowers;
            }

            return {
                username: cleanHandle,
                name: state.name,
                followers: state.followers && state.followers > 0 ? state.followers : null,
                likes: state.likes && state.likes > 0 ? state.likes : null,
                category: state.category,
                verified: state.verified,
            };
        } catch (e) {
            console.warn('[FB] getPageInfo erro:', e);
            if (fallbackFollowers > 0) {
                return {
                    username: cleanHandle,
                    name: null,
                    followers: fallbackFollowers,
                    likes: null,
                    category: null,
                    verified: false,
                };
            }
            return null;
        }
    },
};

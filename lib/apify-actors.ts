/**
 * Actors Apify usados pelo PoliticRank.
 * Não adicionar outros sem revisão de custo — actors de teste na conta Apify
 * (apivault, k1ra, fb-followers, etc.) não são referenciados aqui.
 */
export const APIFY_ACTORS = {
    instagram: {
        /** Posts + métricas (sync principal, Deep Analytics) */
        postScraper: 'apify~instagram-post-scraper',
        /** Detalhes do perfil + comentários (fallback) */
        scraper: 'apify~instagram-scraper',
    },
    facebook: {
        /** Publicações */
        posts: 'apify~facebook-posts-scraper',
        /** Comentários para ranking de engajadores */
        comments: 'apify~facebook-comments-scraper',
        /** Metadados de página (categoria, verificado, curtidas) — fallback */
        pages: 'apify~facebook-pages-scraper',
        /** Seguidores/nome — primeira tentativa (mais barato que pages) */
        profile: 'unseenuser~fb-profile',
    },
} as const;

export const ALLOWED_ACTOR_IDS = [
    APIFY_ACTORS.instagram.postScraper,
    APIFY_ACTORS.instagram.scraper,
    APIFY_ACTORS.facebook.posts,
    APIFY_ACTORS.facebook.comments,
    APIFY_ACTORS.facebook.pages,
    APIFY_ACTORS.facebook.profile,
] as const;

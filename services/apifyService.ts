import { cleanInstagramHandle } from '@/lib/instagram-handle';
import { APIFY_POSTS_LIMIT, parsePostTimestamp } from '@/lib/apify-limits';
import { APIFY_ACTORS } from '@/lib/apify-actors';

const IG_POST_SCRAPER = APIFY_ACTORS.instagram.postScraper;
const IG_SCRAPER = APIFY_ACTORS.instagram.scraper;

export const apifyService = {
  cleanHandle(handle: string) {
    return cleanInstagramHandle(handle);
  },

  getToken() {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      throw new Error("Token do Apify não configurado (APIFY_API_TOKEN).");
    }
    return apifyToken;
  },

  async scrapeInstagramProfile(handle: string) {
    // Legacy support for direct scraper (used sparingly)
    const runId = await this.startScrapeRun(handle);
    let statusObj = await this.getRunStatus(runId);
    
    // Naive polling hook for legacy sync logic
    while (statusObj.status !== 'SUCCEEDED' && statusObj.status !== 'FAILED') {
       await new Promise(r => setTimeout(r, 4000));
       statusObj = await this.getRunStatus(runId);
    }
    
    return this.fetchRunItems(statusObj.datasetId);
  },

  async getProfileInfo(handle: string) {
    const token = this.getToken();
    const cleanUser = this.cleanHandle(handle);

    // Usa o Instagram Scraper clássico em modo "details" para obter dados do perfil
    // (followersCount, fullName, postsCount). Chamada síncrona: retorna o dataset direto.
    const input = {
      directUrls: [`https://www.instagram.com/${cleanUser}/`],
      resultsType: 'details',
      resultsLimit: 1,
      proxyConfiguration: { useApifyProxy: true }
    };

    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${IG_SCRAPER}/run-sync-get-dataset-items?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        }
      );

      if (!res.ok) {
        console.warn('[Apify] getProfileInfo falhou:', res.status);
        return null;
      }

      const items = await res.json();
      const p = Array.isArray(items) ? items[0] : null;
      if (!p || p.error) return null;

      return {
        username: p.username || cleanUser,
        fullName: p.fullName || null,
        followers: p.followersCount ?? p.followers ?? null,
        following: p.followsCount ?? p.following ?? null,
        postsCount: p.postsCount ?? p.mediaCount ?? null,
        verified: p.verified ?? false,
        profilePicUrl: p.profilePicUrl || null,
        biography: p.biography || null,
      };
    } catch (e) {
      console.warn('[Apify] getProfileInfo erro:', e);
      return null;
    }
  },

  async startScrapeRun(handle: string, options?: { resultsLimit?: number, oldestPostDate?: string }) {
    const token = this.getToken();
    const cleanUser = this.cleanHandle(handle);

    // O post-scraper espera 'username' como um ARRAY de strings.
    const input: any = {
      username: [cleanUser],
      resultsLimit: options?.resultsLimit ?? APIFY_POSTS_LIMIT,
      proxyConfiguration: {
        useApifyProxy: true
      }
    };
    
    if (options?.oldestPostDate) {
        input.oldestPostDate = options.oldestPostDate;
    }

    console.log(`[Apify] Iniciando post-scraper (${IG_POST_SCRAPER}) para @${cleanUser} com limite de ${input.resultsLimit} posts...`);

    const res = await fetch(`https://api.apify.com/v2/acts/${IG_POST_SCRAPER}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error('[Apify] Erro Resposta Apify:', res.status, errJson);
        throw new Error(`Apify retornou erro ${res.status}: ${errJson.error?.message || 'Falha ao iniciar o robô'}`);
    }
    const json = await res.json();
    return json.data.id;
  },

  async getRunStatus(runId: string) {
    const token = this.getToken();
    const res = await fetch(`https://api.apify.com/v2/acts/${IG_POST_SCRAPER}/runs/${runId}?token=${token}`);
    if (!res.ok) return { status: 'UNKNOWN', datasetId: null };
    
    const json = await res.json();
    return {
      status: json.data?.status || 'UNKNOWN',
      datasetId: json.data?.defaultDatasetId
    };
  },

  async fetchRunItems(datasetId: string) {
    if (!datasetId) return { posts: [], profile: null };

    const token = this.getToken();
    const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
    
    if (!res.ok) {
       console.log('[Apify] Erro ao buscar dataset items.');
       return { posts: [], profile: null };
    }
    
    const items = await res.json();

    if (!items || items.length === 0) {
       console.log('[Apify] Nenhum dado encontrado no dataset.');
       return { posts: [], profile: null };
    }

    const firstItem = items[0] as any;
    
    if (firstItem.error) {
       console.error(`[Apify] Erro detectado no item do dataset: ${firstItem.errorDescription || firstItem.error}`);
       // Retornamos vazio em vez de throw para evitar 500 no servidor.
       // O frontend lidará com o estado "vazio".
       return { posts: [], profile: null };
    }

    const rawPosts = Array.isArray(items) ? items : (items.latestPosts || []);
    const validPosts = rawPosts.filter((item: any) => item && (item.id || item.shortCode));

    let profile = null;
    // Tenta pegar dados do perfil do primeiro post ou do item raiz
    const firstPost = validPosts[0];
    const followersFromPost = firstPost?.ownerFollowers ?? firstPost?.followersCount;
    const postsFromPost = firstPost?.ownerPostsCount ?? firstPost?.postsCount;

    if (firstPost && (followersFromPost !== undefined || postsFromPost !== undefined)) {
      profile = {
        followers: followersFromPost ?? 0,
        postsCount: postsFromPost ?? 0,
      };
    } else if (firstItem.followersCount !== undefined || firstItem.postsCount !== undefined) {
      profile = {
        followers: firstItem.followersCount ?? firstItem.followers ?? 0,
        postsCount: firstItem.postsCount ?? 0,
      };
    }

    const posts = validPosts
      .map((item: any) => ({
      id: String(item.id || item.shortCode),
      caption: item.caption || '',
      media_type: item.type === 'Video' ? 'VIDEO' : item.type === 'Sidecar' ? 'CAROUSEL_ALBUM' : 'IMAGE',
      media_url: item.displayUrl || item.videoUrl || item.thumbnailUrl || '',
      permalink: item.url || '',
      like_count: item.likesCount || 0,
      comments_count: item.commentsCount || 0,
      timestamp: item.timestamp,
      latestComments: item.latestComments?.map((c: any) => ({
        id: c.id,
        text: c.text,
        username: c.ownerUsername || (c.owner ? c.owner.username : 'unknown'),
        ownerId: c.ownerId || (c.owner ? c.owner.id : null),
        timestamp: c.timestamp || new Date().toISOString(),
        likesCount: c.likesCount || 0
      })) || [],
    }))
      .sort((a: { timestamp?: string }, b: { timestamp?: string }) => parsePostTimestamp(b.timestamp) - parsePostTimestamp(a.timestamp))
      .slice(0, APIFY_POSTS_LIMIT);

    return { profile, posts };
  },

  /** Busca comentários dos posts via instagram-scraper (modo comments). Só quando o post-scraper não traz latestComments. */
  async fetchInstagramComments(postUrls: string[], resultsLimit = 25) {
    const token = this.getToken();
    const urls = postUrls.filter(Boolean).slice(0, 6);
    if (!urls.length) return [];

    const input = {
      directUrls: urls,
      resultsType: 'comments',
      resultsLimit,
      proxyConfiguration: { useApifyProxy: true },
    };

    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${IG_SCRAPER}/run-sync-get-dataset-items?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      );

      if (!res.ok) {
        console.warn('[Apify] fetchInstagramComments falhou:', res.status);
        return [];
      }

      const items = await res.json();
      return Array.isArray(items) ? items : [];
    } catch (e) {
      console.warn('[Apify] fetchInstagramComments erro:', e);
      return [];
    }
  },
};

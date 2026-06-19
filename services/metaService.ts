import axios from 'axios';

const FB_API_VERSION = 'v19.0';
const FB_GRAPH_URL = 'https://graph.facebook.com';

export class MetaService {
    private get appId(): string {
        return process.env.APP_ID_META || '';
    }

    private get appSecret(): string {
        return process.env.APP_SECRET_META || '';
    }

    private getRedirectUri(origin?: string): string {
        if (origin) return `${origin}/api/auth/facebook/callback`;
        const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
        const base = process.env.NEXT_PUBLIC_BASE_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000');
        return `${base}/api/auth/facebook/callback`;
    }

    constructor() {
        if (!process.env.APP_ID_META || !process.env.APP_SECRET_META) {
            console.warn('Meta Service Warning: APP_ID_META or APP_SECRET_META not found in environment variables during startup.');
        }
    }

    getLoginUrl(origin?: string): string {
        // Added instagram_manage_comments to ensure Graph API returns 'username' of commenters
        const scope = 'pages_show_list,instagram_basic,instagram_manage_insights,instagram_manage_comments,pages_read_engagement,business_management';
        return `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?client_id=${this.appId}&redirect_uri=${this.getRedirectUri(origin)}&scope=${scope}&response_type=code&auth_type=rerequest`;
    }

    async exchangeCodeForToken(code: string, origin?: string): Promise<string> {
        try {
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/oauth/access_token`, {
                params: {
                    client_id: this.appId,
                    client_secret: this.appSecret,
                    redirect_uri: this.getRedirectUri(origin),
                    code: code,
                },
            });
            return response.data.access_token;
        } catch (error: any) {
            console.error('Error exchanging code for token:', error.response?.data || error.message);
            throw new Error('Falha ao trocar código de acesso do Facebook.');
        }
    }

    async getLongLivedToken(shortLivedToken: string): Promise<{ token: string; expiresAt: Date }> {
        try {
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: this.appId,
                    client_secret: this.appSecret,
                    fb_exchange_token: shortLivedToken,
                },
            });

            const expiresInSeconds = response.data.expires_in; // Usually 60 days (5184000)
            const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

            return {
                token: response.data.access_token,
                expiresAt: expiresAt,
            };
        } catch (error: any) {
            console.error('Error getting long-lived token:', error.response?.data || error.message);
            throw new Error('Falha ao obter token de longa duração.');
        }
    }

    async getInstagramBusinessAccount(accessToken: string): Promise<{ id: string; name: string; username: string }> {
        try {
            // 0. DEBUG: Check Permissions
            const permissionsResponse = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/me/permissions`, {
                params: { access_token: accessToken }
            });
            // console.log('DEBUG: Granted Permissions:', JSON.stringify(permissionsResponse.data, null, 2));

            // 1. Get User's Pages
            let pagesData = [];
            const pagesResponse = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/me/accounts`, {
                params: {
                    access_token: accessToken,
                    fields: 'name,instagram_business_account{id,username}',
                },
            });
            pagesData = pagesResponse.data.data;

            // FALLBACK: Se não vier nada na lista, mas tivermos um ID de página no .env, tentamos buscar direto
            if (pagesData.length === 0 && process.env.FB_PAGE_ID) {
                console.log(`DEBUG: Lista vazia. Tentando buscar página específica via ID: ${process.env.FB_PAGE_ID}`);
                try {
                    const specificPageResponse = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${process.env.FB_PAGE_ID}`, {
                        params: {
                            access_token: accessToken,
                            fields: 'name,instagram_business_account{id,username}',
                        },
                    });
                    if (specificPageResponse.data) {
                        pagesData = [specificPageResponse.data];
                    }
                } catch (fallbackError) {
                    console.error('DEBUG: Falha ao buscar página específica:', fallbackError);
                }
            }

            // 2. Find the first page with a connected Instagram Business Account
            if (pagesData.length === 0) {
                throw new Error('Nenhuma Página do Facebook encontrada. \nCAUSA 1: Permissão granular negada (você pode ter desmarcado a página). \nCAUSA 2: A conta não é Admin do App. \nTENTATIVA: Adicione FB_PAGE_ID no .env com o ID da sua página para forçar a busca.');
            }

            const pageWithInsta = pagesData.find((p: any) => p.instagram_business_account);

            if (!pageWithInsta) {
                const firstPage = pagesData[0];
                const pageName = firstPage ? firstPage.name : 'Desconhecida';

                throw new Error(`Encontramos a página '${pageName}', mas ela não tem um Instagram Business vinculado. \nCAUSA: Seu Instagram ainda é PESSOAL. \nSOLUÇÃO: Mude para Conta Profissional no app do Instagram.`);
            }

            return {
                id: pageWithInsta.instagram_business_account.id,
                name: pageWithInsta.name,
                username: pageWithInsta.instagram_business_account.username,
            };
        } catch (error: any) {
            console.error('Error fetching Instagram Business Account:', error.response?.data || error.message);
            throw error; // Re-throw to handle in the route
        }
    }

    async getInstagramProfile(instagramId: string, accessToken: string) {
        try {
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${instagramId}`, {
                params: {
                    access_token: accessToken,
                    fields: 'biography,id,username,website,profile_picture_url,followers_count,follows_count,media_count,name',
                },
            });
            return response.data;
        } catch (error: any) {
            console.error('Error fetching Instagram Profile:', error.response?.data || error.message);
            throw new Error('Falha ao buscar perfil do Instagram.');
        }
    }

    async getInstagramInsights(instagramId: string, accessToken: string) {
        try {
            // Metrics: 
            // - impressions, reach, profile_views: Available for period='day', 'days_28'
            // Changing to days_28 to give the user "more data" as requested.
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${instagramId}/insights`, {
                params: {
                    access_token: accessToken,
                    metric: 'impressions,reach,profile_views',
                    period: 'days_28',
                },
            });
            return response.data;
        } catch (error: any) {
            console.error('Error fetching Instagram Insights:', error.response?.data || error.message);
            return null;
        }
    }

    async getRecentMedia(instagramId: string, accessToken: string, limit: number = 10) {
        try {
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${instagramId}/media`, {
                params: {
                    access_token: accessToken,
                    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
                    limit: limit,
                },
            });
            return response.data; // { data: [...] }
        } catch (error: any) {
            console.error('Error fetching Instagram Media:', error.response?.data || error.message);
            return null;
        }
    }

    async getMediaComments(mediaId: string, accessToken: string) {
        try {
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${mediaId}/comments`, {
                params: {
                    access_token: accessToken,
                    fields: 'id,text,like_count,username,from,timestamp,hidden',
                    limit: 100, // Fetch up to 100 comments per post initially
                },
            });
            return response.data; // { data: [...] }
        } catch (error: any) {
            console.error(`Error fetching comments for Media ${mediaId}:`, error.response?.data || error.message);
            return null;
        }
    }

    async getAudienceInsights(instagramId: string, accessToken: string) {
        try {
            // Audience metrics. Note: These output complex key-value pairs (e.g. city: count)
            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${instagramId}/insights`, {
                params: {
                    access_token: accessToken,
                    metric: 'audience_city,audience_country,audience_gender_age',
                    period: 'lifetime',
                },
            });
            return response.data;
        } catch (error: any) {
            console.error('Error fetching Audience Insights:', error.response?.data || error.message);
            return null;
        }
    }

    async getInsightsHistory(instagramId: string, accessToken: string) {
        try {
            const until = Math.floor(Date.now() / 1000);
            const since = until - (30 * 24 * 60 * 60); // 30 days ago

            const response = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/${instagramId}/insights`, {
                params: {
                    access_token: accessToken,
                    metric: 'impressions,reach',
                    period: 'day',
                    since: since,
                    until: until
                },
            });
            return response.data;
        } catch (error: any) {
            console.error('Error fetching Insights History:', error.response?.data || error.message);
            return null;
        }
    }
}

export const metaService = new MetaService();

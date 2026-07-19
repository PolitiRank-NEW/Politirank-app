import axios from 'axios';

function getBaseUrl(): string {
    return (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
}

function getApiKey(): string {
    return process.env.EVOLUTION_API_KEY || '';
}

function headers() {
    return {
        apikey: getApiKey(),
        'Content-Type': 'application/json',
    };
}

export function buildInstanceName(candidateId: string): string {
    return `politirank-${candidateId.slice(-8).toLowerCase()}`;
}

export function getEvolutionWebhookUrl(): string {
    // Este webhook é chamado DE DENTRO do container da Evolution. Em ambiente local
    // (Docker), "localhost" apontaria para o próprio container, não para a máquina host.
    // Por isso permitimos sobrescrever explicitamente via EVOLUTION_WEBHOOK_URL
    // (ex.: http://host.docker.internal:3000/api/webhooks/whatsapp/evolution).
    if (process.env.EVOLUTION_WEBHOOK_URL) {
        return process.env.EVOLUTION_WEBHOOK_URL;
    }

    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    const base =
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.NEXTAUTH_URL ||
        (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000');
    return `${base.replace(/\/$/, '')}/api/webhooks/whatsapp/evolution`;
}

export type EvolutionConnectionState = 'open' | 'connecting' | 'close' | 'refused' | string;

export class EvolutionService {
    private ensureConfigured() {
        if (!getApiKey()) {
            throw new Error('EVOLUTION_API_KEY não configurada no .env');
        }
    }

    async createInstance(instanceName: string) {
        this.ensureConfigured();
        const response = await axios.post(
            `${getBaseUrl()}/instance/create`,
            {
                instanceName,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
                webhook: {
                    enabled: true,
                    url: getEvolutionWebhookUrl(),
                    webhookByEvents: false,
                    events: [
                        'MESSAGES_UPSERT',
                        'CONNECTION_UPDATE',
                        'GROUPS_UPSERT',
                        'GROUP_PARTICIPANTS_UPDATE',
                    ],
                    headers: {
                        apikey: getApiKey(),
                    },
                },
            },
            { headers: headers(), timeout: 30000 }
        );
        return response.data;
    }

    async setWebhook(instanceName: string) {
        this.ensureConfigured();
        const response = await axios.post(
            `${getBaseUrl()}/webhook/set/${instanceName}`,
            {
                webhook: {
                    enabled: true,
                    url: getEvolutionWebhookUrl(),
                    webhookByEvents: false,
                    events: [
                        'MESSAGES_UPSERT',
                        'CONNECTION_UPDATE',
                        'GROUPS_UPSERT',
                        'GROUP_PARTICIPANTS_UPDATE',
                    ],
                    headers: { apikey: getApiKey() },
                },
            },
            { headers: headers(), timeout: 15000 }
        );
        return response.data;
    }

    async connectInstance(instanceName: string) {
        this.ensureConfigured();
        const response = await axios.get(`${getBaseUrl()}/instance/connect/${instanceName}`, {
            headers: headers(),
            timeout: 30000,
        });
        return response.data;
    }

    async getConnectionState(instanceName: string) {
        this.ensureConfigured();
        const response = await axios.get(`${getBaseUrl()}/instance/connectionState/${instanceName}`, {
            headers: headers(),
            timeout: 15000,
        });
        return response.data;
    }

    async fetchInstances(instanceName?: string) {
        this.ensureConfigured();
        const response = await axios.get(`${getBaseUrl()}/instance/fetchInstances`, {
            headers: headers(),
            params: instanceName ? { instanceName } : undefined,
            timeout: 15000,
        });
        return response.data;
    }

    async deleteInstance(instanceName: string) {
        this.ensureConfigured();
        await axios.delete(`${getBaseUrl()}/instance/delete/${instanceName}`, {
            headers: headers(),
            timeout: 15000,
        });
    }

    async fetchAllGroups(instanceName: string, getParticipants = false) {
        this.ensureConfigured();
        const response = await axios.get(`${getBaseUrl()}/group/fetchAllGroups/${instanceName}`, {
            headers: headers(),
            params: { getParticipants: getParticipants ? 'true' : 'false' },
            timeout: 180000,
        });
        return Array.isArray(response.data) ? response.data : [];
    }

    async fetchGroupParticipants(instanceName: string, groupJid: string) {
        this.ensureConfigured();
        const response = await axios.get(`${getBaseUrl()}/group/participants/${instanceName}`, {
            headers: headers(),
            params: { groupJid },
            timeout: 60000,
        });
        const data = response.data as { participants?: unknown };
        return Array.isArray(data?.participants) ? data.participants : [];
    }

    /** Contatos salvos / conhecidos da instância (trazem pushName). */
    async fetchContacts(instanceName: string): Promise<
        Array<{ remoteJid?: string; pushName?: string | null; name?: string | null }>
    > {
        this.ensureConfigured();
        const response = await axios.post(
            `${getBaseUrl()}/chat/findContacts/${instanceName}`,
            {},
            { headers: headers(), timeout: 120000 }
        );
        return Array.isArray(response.data) ? response.data : [];
    }

    /** Extrai QR base64 de respostas variadas da Evolution v2 */
    static extractQrBase64(data: unknown): string | null {
        if (!data || typeof data !== 'object') return null;
        const root = data as Record<string, unknown>;
        const candidates = [
            root.base64,
            root.qrcode,
            (root.qrcode as Record<string, unknown> | undefined)?.base64,
            (root.instance as Record<string, unknown> | undefined)?.qrcode,
        ];
        for (const value of candidates) {
            if (typeof value === 'string' && value.length > 20) {
                return value.startsWith('data:image') ? value : `data:image/png;base64,${value}`;
            }
        }
        return null;
    }

    static extractConnectionState(data: unknown): EvolutionConnectionState {
        if (!data || typeof data !== 'object') return 'close';
        const root = data as Record<string, unknown>;
        const state =
            root.state ??
            (root.instance as Record<string, unknown> | undefined)?.state ??
            (root.connectionStatus as Record<string, unknown> | undefined)?.state;
        return typeof state === 'string' ? state : 'close';
    }
}

export const evolutionService = new EvolutionService();

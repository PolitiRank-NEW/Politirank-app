'use client';

import { useEffect, useState } from 'react';
import {
    Users,
    TrendingUp,
    FileText,
    MessageCircle,
    Info,
    Heart,
    Sparkles,
    Share2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SyncResultCard, type SyncStats } from '@/components/dashboard/SyncResultCard';

interface FacebookData {
    profile: {
        username: string;
        name: string;
        biography: string;
        followers: number;
        followersSource?: string | null;
        postsCount: number;
        lastSyncedAt?: string | null;
    };
    engagement?: {
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        avgLikes: number;
        engagementRate: number;
    };
    media?: {
        id: string;
        caption: string;
        media_type: string;
        media_url: string;
        permalink: string;
        timestamp: string;
        like_count: number;
        comments_count: number;
        shares_count: number;
    }[];
    needsSync?: boolean;
}

interface FacebookStatsProps {
    viewAsUserId?: string;
    syncResult?: { stats: SyncStats; syncedAt: Date } | null;
    onClearSyncResult?: () => void;
}

function KpiTooltip({ tip }: { tip: string }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button className="inline-flex items-center justify-center ml-1 w-3.5 h-3.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-help">
                        <Info className="w-3 h-3" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs leading-relaxed">{tip}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export function FacebookStats({ viewAsUserId, syncResult, onClearSyncResult }: FacebookStatsProps) {
    const [data, setData] = useState<FacebookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewOnly, setShowNewOnly] = useState(false);

    const newPostIds = syncResult?.stats?.newPostIds ?? [];

    const fetchData = async () => {
        setLoading(true);
        try {
            const url = viewAsUserId
                ? `/api/facebook/insights?viewAs=${viewAsUserId}`
                : '/api/facebook/insights';
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || 'Falha ao carregar dados do Facebook');
            }
            const jsonData = await response.json();
            setData(jsonData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro desconhecido');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [viewAsUserId]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
                <div className="h-32 bg-gray-200 rounded-lg" />
                <div className="h-32 bg-gray-200 rounded-lg" />
                <div className="h-32 bg-gray-200 rounded-lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800">
                Erro: {error}
            </div>
        );
    }

    if (!data) return null;

    const formatK = (num: number) =>
        new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(num);

    const allMedia = data.media ?? [];
    const displayMedia =
        showNewOnly && newPostIds.length > 0
            ? allMedia.filter((p) => newPostIds.includes(p.id))
            : allMedia;

    const lastSyncLabel = data.profile.lastSyncedAt
        ? new Date(data.profile.lastSyncedAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : 'Nunca';

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-[1.35rem] font-bold text-slate-900 dark:text-white leading-tight">
                        Rastreador do Facebook
                    </h2>
                    <p className="text-[15px] font-medium text-slate-500">
                        Monitorando facebook.com/{data.profile.username}
                    </p>
                </div>
                <button
                    onClick={() => alert('Configurações de monitoramento estarão disponíveis em breve.')}
                    className="bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
                >
                    <Info className="w-4 h-4 text-slate-500" /> Configurações
                </button>
            </div>

            {syncResult && (
                <SyncResultCard
                    stats={syncResult.stats}
                    syncedAt={syncResult.syncedAt}
                    onClose={() => onClearSyncResult?.()}
                    onShowNewPosts={
                        newPostIds.length > 0 ? () => setShowNewOnly((v) => !v) : undefined
                    }
                />
            )}

            {data.needsSync && !syncResult && (
                <div className="p-4 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 border border-amber-200 rounded-xl text-sm font-medium flex-col sm:flex-row flex items-start sm:items-center gap-3">
                    <Info className="w-5 h-5 shrink-0 hidden sm:block" />
                    <p>
                        <strong>Página vinculada com sucesso!</strong> Clique em &quot;Sincronizar
                        Agora&quot; para realizar a primeira extração de dados.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Seguidores
                            <KpiTooltip
                                tip={
                                    data.profile.followersSource === 'instagram_estimate'
                                        ? 'O Facebook não expõe seguidores neste perfil pessoal. Valor estimado a partir do Instagram vinculado.'
                                        : 'Número de seguidores ou curtidas da página na última sincronização.'
                                }
                            />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {formatK(data.profile.followers || 0)}
                        </span>
                        {data.profile.followersSource === 'instagram_estimate' && (
                            <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">
                                Estimativa via Instagram
                            </span>
                        )}
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500">
                        <Users className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Publicações
                            <KpiTooltip tip="Posts sincronizados no banco de dados." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {formatK(data.profile.postsCount || 0)}
                        </span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500">
                        <FileText className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Reações
                            <KpiTooltip tip="Soma de reações/curtidas em todos os posts sincronizados." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {formatK(data.engagement?.totalLikes || 0)}
                        </span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500">
                        <Heart className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Comentários
                            <KpiTooltip tip="Soma de comentários nos posts sincronizados." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {formatK(data.engagement?.totalComments || 0)}
                        </span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 text-sky-500">
                        <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Engajamento
                            <KpiTooltip tip="((reações + comentários + compartilhamentos) ÷ posts) ÷ seguidores × 100." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {data.engagement?.engagementRate != null
                                ? `${data.engagement.engagementRate.toFixed(2)}%`
                                : '0.00%'}
                        </span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500">
                        <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {newPostIds.length > 0 && (
                        <button
                            onClick={() => setShowNewOnly((v) => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                                showNewOnly
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {showNewOnly ? 'Todas as publicações' : `${newPostIds.length} novas`}
                        </button>
                    )}
                </div>
                <div className="text-sm font-medium text-slate-400 shrink-0">
                    Última sincronização: {lastSyncLabel}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {displayMedia.length > 0 ? (
                    displayMedia.slice(0, 9).map((post) => {
                        const isNew = newPostIds.includes(post.id);
                        const card = (
                            <div
                                className={`relative group min-h-[180px] bg-slate-100 dark:bg-slate-900 rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all ${
                                    isNew
                                        ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900'
                                        : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                {isNew && (
                                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-extrabold rounded-full shadow-md">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        NOVO
                                    </div>
                                )}

                                <div className="p-5 flex flex-col h-full">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-2">
                                        {post.media_type || 'Post'}
                                    </span>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-4 flex-1">
                                        {post.caption || 'Publicação sem texto'}
                                    </p>
                                    <div className="flex items-center gap-5 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-slate-500">
                                        <span className="flex items-center gap-1 text-xs font-semibold">
                                            <Heart className="w-3.5 h-3.5 text-red-400" />
                                            {post.like_count || 0}
                                        </span>
                                        <span className="flex items-center gap-1 text-xs font-semibold">
                                            <MessageCircle className="w-3.5 h-3.5 text-sky-400" />
                                            {post.comments_count || 0}
                                        </span>
                                        <span className="flex items-center gap-1 text-xs font-semibold">
                                            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                                            {post.shares_count || 0}
                                        </span>
                                        <span className="ml-auto text-[10px] font-semibold uppercase text-slate-400">
                                            {new Date(post.timestamp).toLocaleDateString('pt-BR', {
                                                day: '2-digit',
                                                month: 'short',
                                            })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );

                        return post.permalink ? (
                            <a
                                key={post.id}
                                href={post.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                            >
                                {card}
                            </a>
                        ) : (
                            <div key={post.id}>{card}</div>
                        );
                    })
                ) : showNewOnly ? (
                    <div className="col-span-3 py-16 text-center text-slate-400">
                        <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
                        <p className="font-medium">
                            Nenhuma publicação nova detectada nesta sincronização.
                        </p>
                    </div>
                ) : (
                    [1, 2, 3].map((item) => (
                        <div
                            key={item}
                            className="min-h-[180px] bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400"
                        >
                            <FileText className="w-8 h-8 mb-2 opacity-50" />
                            <span className="text-sm font-medium">Nenhuma publicação sincronizada</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Eye, TrendingUp, Image as ImageIcon, MessageCircle, Info, Heart, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { SyncResultCard, type SyncStats } from '@/components/dashboard/SyncResultCard';

interface InstagramData {
    profile: {
        username: string;
        name: string;
        biography: string;
        profile_picture_url: string;
        followers: number;
        following: number;
        postsCount: number;
    };
    insights: {
        reach: number;
        impressions: number;
        profileViews: number;
    };
    engagement?: {
        totalLikes: number;
        totalComments: number;
        avgLikes: number;
        engagementRate: number;
    };
    media?: {
        id: string;
        caption: string;
        media_type: string;
        media_url: string;
        thumbnail_url?: string;
        permalink: string;
        timestamp: string;
        like_count: number;
        comments_count: number;
    }[];
    history?: {
        date: string;
        reach: number;
        impressions: number;
    }[];
    superFans?: {
        username: string;
        interactionScore: number;
        lastInteractedAt: string;
    }[];
    needsSync?: boolean;
}

interface InstagramStatsProps {
    viewAsUserId?: string;
    syncResult?: { stats: SyncStats; syncedAt: Date } | null;
    onClearSyncResult?: () => void;
}

const PostImage = ({ src }: { src?: string }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !src) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-400">
                <ImageIcon className="w-8 h-8 opacity-50 mb-2" />
                <span className="text-xs font-semibold px-4 text-center">Mídia Indisponível ou Expirada</span>
            </div>
        );
    }

    return (
        <img
            src={src}
            alt="Instagram Post"
            onError={() => setHasError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
        />
    );
};

function KpiTooltip({ tip }: { tip: string }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button className="inline-flex items-center justify-center ml-1 w-3.5 h-3.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-help">
                        <Info className="w-3 h-3" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs leading-relaxed">
                    {tip}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export function InstagramStats({ viewAsUserId, syncResult, onClearSyncResult }: InstagramStatsProps) {
    const [data, setData] = useState<InstagramData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewOnly, setShowNewOnly] = useState(false);

    const newPostIds = syncResult?.stats?.newPostIds ?? [];

    const fetchData = async () => {
        setLoading(true);
        try {
            const url = viewAsUserId
                ? `/api/instagram/insights?viewAs=${viewAsUserId}`
                : '/api/instagram/insights';
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || 'Falha ao carregar dados do Instagram');
            }
            const jsonData = await response.json();
            setData(jsonData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
                <div className="h-32 bg-gray-200 rounded-lg"></div>
                <div className="h-32 bg-gray-200 rounded-lg"></div>
                <div className="h-32 bg-gray-200 rounded-lg"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
                Erro: {error}
            </div>
        );
    }

    if (!data) return null;

    const formatK = (num: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(num);

    // Filtra posts por novos se o toggle estiver ativo
    const allMedia = data.media ?? [];
    const displayMedia = showNewOnly && newPostIds.length > 0
        ? allMedia.filter(p => newPostIds.includes(p.id))
        : allMedia;

    return (
        <div className="space-y-6">
            {/* Cabeçalho Instagram — sem botão de sync (movido para o header do dashboard) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-[1.35rem] font-bold text-slate-900 dark:text-white leading-tight">Rastreador do Instagram</h2>
                    <p className="text-[15px] font-medium text-slate-500">Monitorando @{data.profile.username}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => alert('Configurações de monitoramento estarão disponíveis em breve.')}
                        className="bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <Info className="w-4 h-4 text-slate-500" /> Configurações
                    </button>
                </div>
            </div>

            {/* Card de Resultado de Sincronização */}
            {syncResult && (
                <SyncResultCard
                    stats={syncResult.stats}
                    syncedAt={syncResult.syncedAt}
                    onClose={() => onClearSyncResult?.()}
                    onShowNewPosts={newPostIds.length > 0 ? () => setShowNewOnly(v => !v) : undefined}
                />
            )}

            {data.needsSync && !syncResult && (
                <div className="p-4 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 border border-amber-200 rounded-xl text-sm font-medium flex-col sm:flex-row flex items-start sm:items-center gap-3">
                    <Info className="w-5 h-5 shrink-0 hidden sm:block" />
                    <p>
                        <strong>Conta conectada com sucesso!</strong> Clique em "Sincronizar Agora" para realizar a primeira extração de dados.
                    </p>
                </div>
            )}

            {/* KPIs do Instagram */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Total Seguidores */}
                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Seguidores
                            <KpiTooltip tip="Número atual de seguidores detectados na última sincronização." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{formatK(data.profile.followers || 0)}</span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-500">
                        <Users className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Total Posts */}
                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Total de Posts
                            <KpiTooltip tip="Posts sincronizados no banco de dados durante as sessões de sincronização com o Instagram." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{formatK(data.profile.postsCount || 0)}</span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-pink-50 dark:bg-pink-900/20 text-pink-500">
                        <ImageIcon className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Total Curtidas */}
                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Total de Curtidas
                            <KpiTooltip tip="Soma de todas as curtidas em todos os posts já sincronizados no banco de dados." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{formatK(data.engagement?.totalLikes || 0)}</span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500">
                        <Heart className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Total Comentários */}
                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Total de Comentários
                            <KpiTooltip tip="Soma de todos os comentários nos posts sincronizados. Inclui comentários mapeados durante a extração via Apify ou Meta API." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">{formatK(data.engagement?.totalComments || 0)}</span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500">
                        <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Engajamento Médio */}
                <div className="bg-white dark:bg-slate-950 p-5 sm:p-6 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-500 flex items-center">
                            Engajamento Médio
                            <KpiTooltip tip="Fórmula: ((curtidas + comentários) ÷ nº de posts) ÷ seguidores × 100. Representa a taxa média de engajamento por publicação em relação à base de seguidores." />
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                            {data.engagement?.engagementRate != null ? `${data.engagement.engagementRate.toFixed(2)}%` : '0.00%'}
                        </span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-500">
                        <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.5} />
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl leading-5 bg-white dark:bg-slate-950 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors text-slate-900 dark:text-white shadow-sm"
                            placeholder="Buscar posts..."
                        />
                    </div>
                    {/* Toggle "somente novos" */}
                    {newPostIds.length > 0 && (
                        <button
                            onClick={() => setShowNewOnly(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${showNewOnly
                                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-300'
                                }`}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {showNewOnly ? 'Todos os posts' : `${newPostIds.length} novos`}
                        </button>
                    )}
                </div>
                <div className="text-sm font-medium text-slate-400 shrink-0">
                    Última sincronização: {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>

            {/* Post Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {displayMedia.length > 0 ? (
                    displayMedia.slice(0, 9).map((post) => {
                        const isNew = newPostIds.includes(post.id);
                        return (
                            <div key={post.id} className={`relative group aspect-[4/3] bg-slate-100 dark:bg-slate-900 rounded-2xl border overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all ${isNew ? 'border-violet-400 dark:border-violet-600 ring-2 ring-violet-200 dark:ring-violet-900' : 'border-slate-200 dark:border-slate-800'}`}>
                                <PostImage src={post.thumbnail_url || post.media_url} />

                                {/* Badge "NOVO" */}
                                {isNew && (
                                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 bg-violet-600 text-white text-[10px] font-extrabold rounded-full shadow-md">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        NOVO
                                    </div>
                                )}

                                {/* Overlay hover */}
                                <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center text-white p-6 backdrop-blur-sm">
                                    <div className="flex items-center gap-8 mb-4">
                                        <div className="flex flex-col items-center">
                                            <Heart className="w-7 h-7 mb-1.5 transition-transform group-hover:scale-110 text-red-400" fill="currentColor" />
                                            <span className="font-bold text-lg">{post.like_count || 0}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <MessageCircle className="w-7 h-7 mb-1.5 transition-transform group-hover:scale-110 text-blue-400" fill="currentColor" />
                                            <span className="font-bold text-lg">{post.comments_count || 0}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-center line-clamp-3 text-slate-200 font-medium">
                                        {post.caption || 'Sem legenda'}
                                    </p>
                                    <span className="text-xs text-slate-400 mt-4 font-semibold uppercase tracking-wider">
                                        {new Date(post.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    showNewOnly ? (
                        <div className="col-span-3 py-16 text-center text-slate-400">
                            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">Nenhum post novo detectado nesta sincronização.</p>
                        </div>
                    ) : (
                        [1, 2, 3].map((item) => (
                            <div key={item} className="aspect-[4/3] bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400">
                                <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                                <span className="text-sm font-medium">Post não carregado</span>
                            </div>
                        ))
                    )
                )}
            </div>
        </div>
    );
}

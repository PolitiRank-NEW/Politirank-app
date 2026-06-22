'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Loader2,
    Heart,
    MessageCircle,
    ThumbsUp,
    Share2,
    Users,
    ExternalLink,
    Trophy,
    AlertCircle,
    Instagram,
    RefreshCw,
    History,
    Camera,
    X,
} from 'lucide-react';

type Platform = 'instagram' | 'facebook';

interface TrackerPost {
    id: string;
    caption?: string;
    text?: string;
    type: string;
    likes: number;
    comments: number;
    shares?: number;
    timestamp: string | null;
    url: string;
    isNew?: boolean;
}

interface TrackerEngager {
    username?: string;
    name?: string;
    profileUrl?: string | null;
    comments: number;
    commentLikes: number;
    score: number;
}

interface TrackerProfile {
    username: string;
    fullName?: string | null;
    name?: string | null;
    followers: number | null;
    postsCount?: number | null;
    category?: string | null;
}

interface TrackerMeta {
    postsAnalyzed: number;
    commentsAnalyzed: number;
    uniqueEngagers?: number;
    postsScrapedForComments?: number;
    syncMode?: 'full' | 'incremental';
    newPostsCount?: number;
    newPostIds?: string[];
    updatedPostsCount?: number;
    skippedApifyComments?: boolean;
    rankingFromCache?: boolean;
}

interface SyncSummary {
    syncMode: 'full' | 'incremental';
    newPostsCount: number;
    updatedPostsCount: number;
    skippedApifyComments: boolean;
    platformLabel: string;
}

interface SnapshotListItem {
    id: string;
    syncedAt: string;
    postsAnalyzed?: number;
    commentsAnalyzed?: number;
    followers?: number | null;
}

interface PendingSnapshotData {
    profile: TrackerProfile | null;
    posts: TrackerPost[];
    ranking: TrackerEngager[];
    meta: TrackerMeta | null;
}

interface SocialProfileTrackerProps {
    platform: Platform;
    connectedHandle: string;
    viewAsUserId?: string;
    isActive?: boolean;
    userRole?: string;
}

const formatNumber = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return new Intl.NumberFormat('pt-BR').format(n);
};

const formatCompact = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
};

const CONFIG = {
    instagram: {
        label: 'Instagram',
        inputPrefix: '@',
        placeholder: 'nome_do_perfil ou URL do Instagram',
        gradient: 'from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700',
        ring: 'focus:ring-pink-500',
        accent: 'text-pink-500',
        scoreColor: 'text-purple-600 dark:text-purple-400',
        avatarGradient: 'from-pink-100 to-purple-100 dark:from-pink-900/40 dark:to-purple-900/40',
        postsIcon: Heart,
        startPath: '/api/instagram/explore/start',
        resultPath: '/api/instagram/explore/result',
        processPath: '/api/instagram/sync/process',
        cachedPath: '/api/instagram/cached',
        statusPath: (runId: string) => `/api/instagram/sync/status?runId=${runId}`,
        profileLabel: 'Perfil',
        postText: (p: TrackerPost) => p.caption || 'Publicação sem legenda',
        engagerLabel: (e: TrackerEngager) => `@${e.username}`,
        engagerHref: (e: TrackerEngager) => `https://www.instagram.com/${e.username}/`,
    },
    facebook: {
        label: 'Facebook',
        inputPrefix: '',
        placeholder: 'facebook.com/pagina ou nome da página',
        gradient: 'from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
        ring: 'focus:ring-blue-500',
        accent: 'text-blue-500',
        scoreColor: 'text-indigo-600 dark:text-indigo-400',
        avatarGradient: 'from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40',
        postsIcon: ThumbsUp,
        startPath: '/api/facebook/explore/start',
        resultPath: '/api/facebook/explore/result',
        processPath: '/api/facebook/sync/process',
        cachedPath: '/api/facebook/cached',
        statusPath: (runId: string) => `/api/facebook/explore/status?runId=${runId}`,
        profileLabel: 'Página',
        postText: (p: TrackerPost) => p.text || p.caption || 'Publicação sem texto',
        engagerLabel: (e: TrackerEngager) => e.name || e.username || 'Usuário',
        engagerHref: (e: TrackerEngager) => e.profileUrl || '#',
    },
} as const;

function FacebookIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    );
}

export function SocialProfileTracker({
    platform,
    connectedHandle,
    viewAsUserId,
    isActive = true,
    userRole = 'CANDIDATO',
}: SocialProfileTrackerProps) {
    const cfg = CONFIG[platform];
    const PostsIcon = cfg.postsIcon;
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    const [handle, setHandle] = useState(connectedHandle);
    const [loadingCache, setLoadingCache] = useState(false);
    const [loadingSync, setLoadingSync] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [error, setError] = useState('');
    const [hasCachedData, setHasCachedData] = useState(false);
    const [selectedView, setSelectedView] = useState<'current' | string>('current');
    const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
    const [viewingSnapshotAt, setViewingSnapshotAt] = useState<string | null>(null);
    const [snapshotModal, setSnapshotModal] = useState<PendingSnapshotData | null>(null);
    const [savingSnapshot, setSavingSnapshot] = useState(false);

    const [profile, setProfile] = useState<TrackerProfile | null>(null);
    const [posts, setPosts] = useState<TrackerPost[]>([]);
    const [ranking, setRanking] = useState<TrackerEngager[]>([]);
    const [meta, setMeta] = useState<TrackerMeta | null>(null);
    const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

    const loading = loadingCache || loadingSync;

    useEffect(() => {
        if (!syncSummary) return;
        const timer = window.setTimeout(() => setSyncSummary(null), 8000);
        return () => window.clearTimeout(timer);
    }, [syncSummary]);

    useEffect(() => {
        setHandle(connectedHandle);
    }, [connectedHandle]);

    const applyTrackerData = useCallback(
        (data: {
            profile?: TrackerProfile | null;
            posts?: TrackerPost[];
            ranking?: TrackerEngager[];
            meta?: TrackerMeta | null;
            hasCachedData?: boolean;
        }) => {
            if (data.profile) setProfile(data.profile);
            if (data.posts) setPosts(data.posts);
            if (data.ranking) setRanking(data.ranking);
            if (data.meta) setMeta(data.meta);
            if (data.hasCachedData !== undefined) setHasCachedData(data.hasCachedData);
        },
        []
    );

    const loadSnapshotsList = useCallback(async () => {
        try {
            const params = new URLSearchParams({ platform });
            if (viewAsUserId) params.set('viewAsUserId', viewAsUserId);
            const res = await fetch(`/api/social/snapshots?${params}`);
            if (!res.ok) return;
            const data = await res.json();
            setSnapshots(data.snapshots || []);
        } catch {
            // best-effort
        }
    }, [platform, viewAsUserId]);

    const loadCachedData = useCallback(
        async (view: 'current' | string) => {
            if (!connectedHandle.trim()) return;

            setLoadingCache(true);
            setError('');

            try {
                if (view !== 'current') {
                    const params = viewAsUserId ? `?viewAsUserId=${encodeURIComponent(viewAsUserId)}` : '';
                    const res = await fetch(`/api/social/snapshots/${view}${params}`);
                    if (!res.ok) throw new Error('Snapshot não encontrado.');
                    const data = await res.json();
                    applyTrackerData({
                        profile: data.profile,
                        posts: data.posts || [],
                        ranking: data.ranking || [],
                        meta: data.meta || null,
                        hasCachedData: true,
                    });
                    setViewingSnapshotAt(data.snapshotAt || data.lastSyncedAt || null);
                    return;
                }

                setViewingSnapshotAt(null);
                const qs = viewAsUserId ? `?viewAsUserId=${encodeURIComponent(viewAsUserId)}` : '';
                const res = await fetch(`${cfg.cachedPath}${qs}`);
                if (!res.ok) return;

                const data = await res.json();
                applyTrackerData({
                    profile: data.profile,
                    posts: data.posts || [],
                    ranking: data.ranking || [],
                    meta: data.meta || null,
                    hasCachedData: !!data.hasCachedData,
                });
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Erro ao carregar dados.';
                setError(message);
            } finally {
                setLoadingCache(false);
            }
        },
        [connectedHandle, viewAsUserId, cfg.cachedPath, applyTrackerData]
    );

    useEffect(() => {
        if (!isActive || !connectedHandle.trim()) return;
        void loadCachedData(selectedView);
        void loadSnapshotsList();
    }, [isActive, connectedHandle, viewAsUserId, selectedView, loadCachedData, loadSnapshotsList]);

    const handleViewChange = (value: string) => {
        setSelectedView(value);
    };

    const saveSnapshot = async () => {
        if (!snapshotModal) return;
        setSavingSnapshot(true);
        try {
            const res = await fetch('/api/social/snapshots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform,
                    viewAsUserId,
                    profile: snapshotModal.profile,
                    posts: snapshotModal.posts,
                    ranking: snapshotModal.ranking,
                    meta: snapshotModal.meta,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar snapshot.');
            await loadSnapshotsList();
            setSnapshotModal(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Erro ao salvar snapshot.';
            setError(message);
            setSnapshotModal(null);
        } finally {
            setSavingSnapshot(false);
        }
    };

    const persistAndRefresh = useCallback(
        async (
            datasetId: string,
            extras: {
                ranking?: TrackerEngager[];
                meta?: TrackerMeta | null;
                syncMode?: 'full' | 'incremental';
            }
        ) => {
            const res = await fetch(cfg.processPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    datasetId,
                    viewAsUserId,
                    ranking: extras.ranking,
                    meta: extras.meta,
                    syncMode: extras.syncMode,
                }),
            });
            const data = await res.json();
            await loadCachedData('current');
            return data.stats as
                | {
                      newPosts?: number;
                      updatedPosts?: number;
                      syncMode?: 'full' | 'incremental';
                  }
                | undefined;
        },
        [cfg.processPath, viewAsUserId, loadCachedData]
    );

    const handleSync = useCallback(
        async (handleOverride?: string) => {
            const targetHandle = (handleOverride || handle).trim();
            if (!targetHandle || loadingSync) return;

            setError('');
            setLoadingSync(true);
            setSelectedView('current');
            setViewingSnapshotAt(null);
            setStatusText('Iniciando sincronização...');

            try {
                const startRes = await fetch(cfg.startPath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle: targetHandle, viewAsUserId }),
                });
                const startData = await startRes.json();
                if (!startRes.ok) throw new Error(startData.error || 'Falha ao iniciar a sincronização.');

                const { runId, handle: cleanHandle, profile: startProfile, syncMode } = startData;

                setStatusText(`Coletando publicações no ${cfg.label}...`);

                let finished = false;
                let attempts = 0;
                const maxAttempts = platform === 'facebook' ? 75 : 60;

                while (!finished && attempts < maxAttempts) {
                    attempts++;
                    await new Promise((r) => setTimeout(r, 4000));

                    const statusRes = await fetch(cfg.statusPath(runId));
                    const statusData = await statusRes.json();

                    if (statusData.status === 'SUCCEEDED') {
                        setStatusText('Processando dados e montando o ranking...');

                        const resultRes = await fetch(cfg.resultPath, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                datasetId: statusData.datasetId,
                                handle: cleanHandle,
                                viewAsUserId,
                                syncMode: syncMode || 'full',
                            }),
                        });
                        const resultData = await resultRes.json();
                        if (!resultRes.ok) throw new Error(resultData.error || 'Falha ao processar os dados.');

                        const mergedProfile: TrackerProfile | null =
                            startProfile || resultData.profile
                                ? {
                                      username:
                                          startProfile?.username ||
                                          resultData.profile?.username ||
                                          cleanHandle,
                                      fullName:
                                          startProfile?.fullName ??
                                          resultData.profile?.fullName ??
                                          null,
                                      name:
                                          startProfile?.name ??
                                          resultData.profile?.name ??
                                          null,
                                      followers:
                                          resultData.profile?.followers ??
                                          startProfile?.followers ??
                                          null,
                                      postsCount:
                                          startProfile?.postsCount ??
                                          resultData.profile?.postsCount ??
                                          null,
                                      category: resultData.profile?.category ?? null,
                                  }
                                : null;

                        applyTrackerData({
                            profile: mergedProfile,
                            posts: resultData.posts || [],
                            ranking: resultData.ranking || [],
                            meta: resultData.meta || null,
                            hasCachedData: (resultData.posts || []).length > 0,
                        });

                        if ((resultData.posts || []).length === 0) {
                            setError(
                                'Nenhuma publicação encontrada. O perfil pode ser privado ou sem posts públicos.'
                            );
                        }

                        setStatusText('Salvando dados...');
                        await persistAndRefresh(statusData.datasetId, {
                            ranking: resultData.ranking,
                            meta: resultData.meta,
                            syncMode: resultData.meta?.syncMode || syncMode || 'full',
                        });

                        const newCount = resultData.meta?.newPostsCount ?? 0;
                        const updatedCount = resultData.meta?.updatedPostsCount ?? 0;
                        setSyncSummary({
                            syncMode: resultData.meta?.syncMode || syncMode || 'full',
                            newPostsCount: newCount,
                            updatedPostsCount: updatedCount,
                            skippedApifyComments: Boolean(resultData.meta?.skippedApifyComments),
                            platformLabel: cfg.label,
                        });

                        if (isSuperAdmin) {
                            setSnapshotModal({
                                profile: mergedProfile,
                                posts: resultData.posts || [],
                                ranking: resultData.ranking || [],
                                meta: resultData.meta || null,
                            });
                        }

                        finished = true;
                    } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(statusData.status)) {
                        throw new Error('A coleta foi interrompida. Tente novamente em alguns minutos.');
                    }
                }

                if (!finished) {
                    throw new Error('A sincronização demorou mais que o esperado. Tente novamente.');
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Erro inesperado na sincronização.';
                setError(message);
            } finally {
                setLoadingSync(false);
                setStatusText('');
            }
        },
        [handle, loadingSync, cfg, platform, viewAsUserId, applyTrackerData, persistAndRefresh, isSuperAdmin]
    );

    const displayName =
        platform === 'instagram'
            ? profile?.fullName
            : profile?.name || (profile?.username ? `@${profile.username}` : null);

    return (
        <div className="space-y-6">
            {syncSummary && (
                <div
                    role="status"
                    className="fixed top-6 left-1/2 z-[60] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-purple-500/40 bg-purple-950 px-5 py-4 text-white shadow-2xl shadow-purple-950/40"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-purple-300">
                                {syncSummary.syncMode === 'incremental' ? 'Sync incremental' : 'Sync completo'}
                            </p>
                            {syncSummary.newPostsCount > 0 ? (
                                <p className="mt-1 text-sm font-semibold">
                                    <span className="mr-2 inline-flex rounded-md bg-purple-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                        Novo
                                    </span>
                                    {syncSummary.newPostsCount === 1
                                        ? '1 publicação nova'
                                        : `${syncSummary.newPostsCount} publicações novas`}{' '}
                                    no {syncSummary.platformLabel}
                                </p>
                            ) : (
                                <p className="mt-1 text-sm font-semibold">
                                    Nenhuma publicação nova — métricas dos posts existentes foram atualizadas.
                                </p>
                            )}
                            {syncSummary.syncMode === 'incremental' && syncSummary.skippedApifyComments && (
                                <p className="mt-1 text-xs text-purple-200/80">
                                    Comentários em cache — créditos Apify economizados neste sync.
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSyncSummary(null)}
                            className="text-purple-300 hover:text-white"
                            aria-label="Fechar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            {platform === 'instagram' ? (
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                                    @
                                </span>
                            ) : (
                                <FacebookIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            )}
                            <input
                                type="text"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSync()}
                                placeholder={cfg.placeholder}
                                disabled={loading}
                                className={`w-full ${platform === 'instagram' ? 'pl-9' : 'pl-11'} pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${cfg.ring} disabled:opacity-50`}
                            />
                        </div>
                        <button
                            onClick={() => handleSync()}
                            disabled={loadingSync || !handle.trim()}
                            className={`flex items-center justify-center gap-2 bg-gradient-to-r ${cfg.gradient} text-white px-6 py-3 rounded-xl shadow-lg transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {loadingSync ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <RefreshCw className="w-5 h-5" />
                            )}
                            <span>{loadingSync ? 'Sincronizando...' : 'Sincronizar'}</span>
                        </button>
                    </div>

                    {loadingSync && statusText && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{statusText}</span>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-lg p-3">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="mt-4 flex flex-col gap-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 shrink-0">
                                <History className="w-3.5 h-3.5" />
                                Ver dados de:
                            </label>
                            <select
                                value={
                                    selectedView === 'current' ||
                                    snapshots.some((s) => s.id === selectedView)
                                        ? selectedView
                                        : 'current'
                                }
                                onChange={(e) => handleViewChange(e.target.value)}
                                disabled={loadingCache || loadingSync}
                                className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-60"
                            >
                                <option value="current">Dados atuais (último sync)</option>
                                {snapshots.length === 0 ? (
                                    <option value="none" disabled>
                                        Nenhum snapshot salvo ainda
                                    </option>
                                ) : (
                                    snapshots.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            Snapshot —{' '}
                                            {new Date(s.syncedAt).toLocaleString('pt-BR', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                            {s.postsAnalyzed != null ? ` (${s.postsAnalyzed} posts)` : ''}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                        {snapshots.length === 0 && (
                            <p className="text-xs text-slate-400">
                                Nenhum snapshot no histórico. Após sincronizar como SUPER_ADMIN, salve
                                um snapshot para comparar datas aqui.
                            </p>
                        )}
                    </div>

                    {viewingSnapshotAt && selectedView !== 'current' && (
                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2">
                            <Camera className="w-3.5 h-3.5" />
                            Visualizando snapshot de{' '}
                            {new Date(viewingSnapshotAt).toLocaleString('pt-BR')} — dados históricos
                        </div>
                    )}
                </CardContent>
            </Card>

            {profile && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardContent className="p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider">{cfg.profileLabel}</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white truncate">
                                @{profile.username}
                            </p>
                            {displayName && (
                                <p className="text-xs text-slate-500 truncate">{displayName}</p>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardContent className="p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Seguidores</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">
                                {formatCompact(profile.followers)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardContent className="p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Posts analisados</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">
                                {meta?.postsAnalyzed ?? 0}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardContent className="p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Comentários lidos</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">
                                {formatNumber(meta?.commentsAnalyzed)}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {(posts.length > 0 || ranking.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <PostsIcon className={`w-5 h-5 ${cfg.accent}`} />
                                Últimas Publicações ({posts.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-[600px] overflow-y-auto">
                                {posts.map((post, idx) => (
                                    <div
                                        key={post.id}
                                        className={`p-4 transition-colors ${
                                            post.isNew
                                                ? 'bg-purple-50/80 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/30 border-l-4 border-purple-700'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold text-slate-300 dark:text-slate-600">
                                                        #{idx + 1}
                                                    </span>
                                                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                                        {post.type}
                                                    </span>
                                                    {post.isNew && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-800 text-white">
                                                            Novo
                                                        </span>
                                                    )}
                                                    {post.timestamp && (
                                                        <span className="text-xs text-slate-400">
                                                            {new Date(post.timestamp).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
                                                    {cfg.postText(post)}
                                                </p>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        {platform === 'instagram' ? (
                                                            <Heart className="w-3.5 h-3.5 text-pink-500" />
                                                        ) : (
                                                            <ThumbsUp className="w-3.5 h-3.5 text-blue-500" />
                                                        )}
                                                        <strong>{formatNumber(post.likes)}</strong>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MessageCircle className="w-3.5 h-3.5 text-indigo-500" />
                                                        <strong>{formatNumber(post.comments)}</strong>
                                                    </span>
                                                    {platform === 'facebook' && post.shares !== undefined && (
                                                        <span className="flex items-center gap-1">
                                                            <Share2 className="w-3.5 h-3.5 text-green-500" />
                                                            <strong>{formatNumber(post.shares)}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {post.url && (
                                                <a
                                                    href={post.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`text-slate-400 hover:${cfg.accent} transition-colors shrink-0`}
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-amber-500" />
                                Top {ranking.length} Engajadores
                            </CardTitle>
                            <p className="text-xs text-slate-400 mt-1">
                                Pessoas que mais comentam no perfil, ponderado pelas curtidas nos comentários.
                            </p>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="max-h-[600px] overflow-y-auto">
                                {ranking.length > 0 ? (
                                    <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                        {ranking.map((fan, idx) => (
                                            <div
                                                key={`${fan.username || fan.name}-${idx}`}
                                                className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                                            >
                                                <div
                                                    className={`w-8 h-8 rounded-full bg-gradient-to-tr ${cfg.avatarGradient} flex items-center justify-center font-bold text-xs shrink-0`}
                                                >
                                                    {idx === 0
                                                        ? '🏆'
                                                        : idx === 1
                                                          ? '🥈'
                                                          : idx === 2
                                                            ? '🥉'
                                                            : idx + 1}
                                                </div>
                                                <a
                                                    href={cfg.engagerHref(fan)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 min-w-0 font-semibold text-slate-900 dark:text-white truncate hover:opacity-80 transition-colors"
                                                >
                                                    {cfg.engagerLabel(fan)}
                                                </a>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                                                    <span className="flex items-center gap-1" title="Comentários">
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        {fan.comments}
                                                    </span>
                                                    <span
                                                        className="flex items-center gap-1"
                                                        title="Curtidas nos comentários"
                                                    >
                                                        {platform === 'instagram' ? (
                                                            <Heart className="w-3.5 h-3.5" />
                                                        ) : (
                                                            <ThumbsUp className="w-3.5 h-3.5" />
                                                        )}
                                                        {formatNumber(fan.commentLikes)}
                                                    </span>
                                                    <span
                                                        className={`font-bold ${cfg.scoreColor} w-10 text-right`}
                                                        title="Pontuação de engajamento"
                                                    >
                                                        {fan.score}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-3">
                                        <Users className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                                        <p className="text-sm max-w-xs">
                                            Não foi possível extrair comentários suficientes para montar o ranking.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {!loadingCache && !loadingSync && !profile && !error && connectedHandle && !hasCachedData && (
                <div className="text-center py-12 text-slate-400">
                    {platform === 'instagram' ? (
                        <Instagram className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    ) : (
                        <FacebookIcon className="w-10 h-10 mx-auto mb-3 opacity-40 text-blue-500" />
                    )}
                    <p className="text-sm">Nenhum dado salvo ainda. Clique em Sincronizar para coletar.</p>
                </div>
            )}

            {loadingCache && !profile && (
                <div className="text-center py-12 text-slate-400">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
                    <p className="text-sm">Carregando dados salvos...</p>
                </div>
            )}

            {snapshotModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="flex justify-between items-start p-6 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-indigo-500" />
                                    Salvar snapshot?
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Sincronização do {cfg.label} concluída com sucesso.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSnapshotModal(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-3 text-sm">
                            <p className="text-slate-600 dark:text-slate-300">
                                Deseja guardar estes dados como <strong>snapshot histórico</strong>?
                                Assim você poderá consultar como estava nesta data no futuro.
                            </p>
                            <ul className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-1.5 text-slate-700 dark:text-slate-300">
                                <li>
                                    <strong>Seguidores:</strong>{' '}
                                    {formatCompact(snapshotModal.profile?.followers)}
                                </li>
                                <li>
                                    <strong>Posts analisados:</strong>{' '}
                                    {snapshotModal.meta?.postsAnalyzed ?? snapshotModal.posts.length}
                                </li>
                                <li>
                                    <strong>Comentários lidos:</strong>{' '}
                                    {formatNumber(snapshotModal.meta?.commentsAnalyzed)}
                                </li>
                                <li>
                                    <strong>Engajadores:</strong> {snapshotModal.ranking.length}
                                </li>
                            </ul>
                            <p className="text-xs text-slate-400">
                                Se escolher &quot;Não&quot;, os dados atuais continuam visíveis normalmente,
                                mas não ficam guardados no histórico.
                            </p>
                        </div>
                        <div className="flex gap-3 p-6 pt-0">
                            <button
                                type="button"
                                onClick={() => setSnapshotModal(null)}
                                disabled={savingSnapshot}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                            >
                                Não, só usar agora
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveSnapshot()}
                                disabled={savingSnapshot}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {savingSnapshot ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Camera className="w-4 h-4" />
                                )}
                                Sim, salvar snapshot
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Search,
    Loader2,
    Heart,
    MessageCircle,
    Users,
    ExternalLink,
    Trophy,
    AlertCircle,
    Instagram,
} from 'lucide-react';

interface ExplorerPost {
    id: string;
    caption: string;
    type: string;
    likes: number;
    comments: number;
    timestamp: string | null;
    url: string;
}

interface ExplorerEngager {
    username: string;
    comments: number;
    commentLikes: number;
    score: number;
}

interface ExplorerProfile {
    username: string;
    fullName: string | null;
    followers: number | null;
    postsCount: number | null;
}

interface ExplorerMeta {
    postsAnalyzed: number;
    commentsAnalyzed: number;
    uniqueEngagers: number;
}

const formatNumber = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return new Intl.NumberFormat('pt-BR').format(n);
};

const formatCompact = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
};

export function InstagramExplorer() {
    const [handle, setHandle] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [error, setError] = useState('');

    const [profile, setProfile] = useState<ExplorerProfile | null>(null);
    const [posts, setPosts] = useState<ExplorerPost[]>([]);
    const [ranking, setRanking] = useState<ExplorerEngager[]>([]);
    const [meta, setMeta] = useState<ExplorerMeta | null>(null);

    const reset = () => {
        setError('');
        setProfile(null);
        setPosts([]);
        setRanking([]);
        setMeta(null);
    };

    const handleAnalyze = async () => {
        if (!handle.trim() || loading) return;
        reset();
        setLoading(true);
        setStatusText('Iniciando análise...');

        try {
            const startRes = await fetch('/api/instagram/explore/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ handle }),
            });
            const startData = await startRes.json();
            if (!startRes.ok) throw new Error(startData.error || 'Falha ao iniciar a análise.');

            const { runId, handle: cleanHandle, profile: startProfile } = startData;

            // Mostra os dados do perfil (seguidores) imediatamente, antes dos posts ficarem prontos
            if (startProfile) {
                setProfile(startProfile);
            }

            setStatusText('Coletando publicações e comentários no Instagram...');

            let finished = false;
            let attempts = 0;
            const maxAttempts = 60; // ~4 min

            while (!finished && attempts < maxAttempts) {
                attempts++;
                await new Promise((r) => setTimeout(r, 4000));

                const statusRes = await fetch(`/api/instagram/sync/status?runId=${runId}`);
                const statusData = await statusRes.json();

                if (statusData.status === 'SUCCEEDED') {
                    setStatusText('Processando dados e montando o ranking...');

                    const resultRes = await fetch('/api/instagram/explore/result', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ datasetId: statusData.datasetId, handle: cleanHandle }),
                    });
                    const resultData = await resultRes.json();
                    if (!resultRes.ok) throw new Error(resultData.error || 'Falha ao processar os dados.');

                    // Mescla: prioriza os dados detalhados do perfil (seguidores) obtidos no início
                    const mergedProfile: ExplorerProfile | null = resultData.profile || startProfile
                        ? {
                            username: startProfile?.username || resultData.profile?.username || cleanHandle,
                            fullName: startProfile?.fullName ?? resultData.profile?.fullName ?? null,
                            followers: startProfile?.followers ?? resultData.profile?.followers ?? null,
                            postsCount: startProfile?.postsCount ?? resultData.profile?.postsCount ?? null,
                        }
                        : null;
                    setProfile(mergedProfile);
                    setPosts(resultData.posts || []);
                    setRanking(resultData.ranking || []);
                    setMeta(resultData.meta || null);

                    if ((resultData.posts || []).length === 0) {
                        setError('Nenhuma publicação encontrada. O perfil pode ser privado, inexistente ou sem posts.');
                    }

                    finished = true;
                } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(statusData.status)) {
                    throw new Error('A coleta foi interrompida. Tente novamente em alguns minutos.');
                }
            }

            if (!finished) {
                throw new Error('A análise demorou mais que o esperado. Tente novamente.');
            }
        } catch (err: any) {
            setError(err.message || 'Erro inesperado na análise.');
        } finally {
            setLoading(false);
            setStatusText('');
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    <Instagram className="w-8 h-8 text-pink-600 dark:text-pink-500" />
                    Explorador de Instagram
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                    Exclusivo para Super Admin. Digite o @ de qualquer perfil público para ver as últimas
                    publicações (com curtidas) e o ranking das 100 pessoas que mais engajam.
                </p>
            </div>

            {/* Search Bar */}
            <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">@</span>
                            <input
                                type="text"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                                placeholder="nome_do_perfil"
                                disabled={loading}
                                className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50"
                            />
                        </div>
                        <button
                            onClick={handleAnalyze}
                            disabled={loading || !handle.trim()}
                            className="flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                            <span>{loading ? 'Analisando...' : 'Analisar'}</span>
                        </button>
                    </div>

                    {loading && statusText && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
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
                </CardContent>
            </Card>

            {/* Profile Summary */}
            {profile && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardContent className="p-5">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Perfil</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white truncate">@{profile.username}</p>
                            {profile.fullName && (
                                <p className="text-xs text-gray-500 truncate">{profile.fullName}</p>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardContent className="p-5">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Seguidores</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCompact(profile.followers)}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardContent className="p-5">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Posts analisados</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{meta?.postsAnalyzed ?? 0}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardContent className="p-5">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Comentários lidos</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{formatNumber(meta?.commentsAnalyzed)}</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Results Grid */}
            {(posts.length > 0 || ranking.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Posts (sem fotos) */}
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardHeader className="border-b border-gray-50 dark:border-gray-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
                                <Heart className="w-5 h-5 text-pink-500" />
                                Últimas Publicações ({posts.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-gray-50 dark:divide-gray-800/50 max-h-[600px] overflow-y-auto">
                                {posts.map((post, idx) => (
                                    <div key={post.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold text-gray-300 dark:text-gray-600">#{idx + 1}</span>
                                                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{post.type}</span>
                                                    {post.timestamp && (
                                                        <span className="text-xs text-gray-400">
                                                            {new Date(post.timestamp).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                                                    {post.caption || 'Publicação sem legenda'}
                                                </p>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <Heart className="w-3.5 h-3.5 text-pink-500" />
                                                        <strong>{formatNumber(post.likes)}</strong>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
                                                        <strong>{formatNumber(post.comments)}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                            {post.url && (
                                                <a
                                                    href={post.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-gray-400 hover:text-pink-500 transition-colors shrink-0"
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

                    {/* Ranking de Engajadores */}
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardHeader className="border-b border-gray-50 dark:border-gray-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
                                <Trophy className="w-5 h-5 text-amber-500" />
                                Top {ranking.length} Engajadores
                            </CardTitle>
                            <p className="text-xs text-gray-400 mt-1">
                                Pessoas que mais comentam no perfil, ponderado pelas curtidas nos comentários.
                            </p>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="max-h-[600px] overflow-y-auto">
                                {ranking.length > 0 ? (
                                    <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                        {ranking.map((fan, idx) => (
                                            <div key={fan.username} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-100 to-purple-100 dark:from-pink-900/40 dark:to-purple-900/40 flex items-center justify-center text-purple-700 dark:text-purple-400 font-bold text-xs shrink-0">
                                                    {idx === 0 ? '🏆' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                                </div>
                                                <a
                                                    href={`https://www.instagram.com/${fan.username}/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 min-w-0 font-semibold text-gray-900 dark:text-white truncate hover:text-pink-500 transition-colors"
                                                >
                                                    @{fan.username}
                                                </a>
                                                <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                                                    <span className="flex items-center gap-1" title="Comentários">
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        {fan.comments}
                                                    </span>
                                                    <span className="flex items-center gap-1" title="Curtidas nos comentários">
                                                        <Heart className="w-3.5 h-3.5" />
                                                        {formatNumber(fan.commentLikes)}
                                                    </span>
                                                    <span className="font-bold text-purple-600 dark:text-purple-400 w-10 text-right" title="Pontuação de engajamento">
                                                        {fan.score}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-3">
                                        <Users className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                        <p className="text-sm max-w-xs">
                                            Não foi possível extrair comentários suficientes para montar o ranking deste perfil.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

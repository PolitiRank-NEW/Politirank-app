'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users, BarChart3, TrendingUp, MessageCircle, Heart, Image as ImageIcon, Video, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function InstagramAnalyticsPage() {
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [superFans, setSuperFans] = useState<any[]>([]);
    const [topPosts, setTopPosts] = useState<any[]>([]);
    const [timeline, setTimeline] = useState<any[]>([]);
    const searchParams = useSearchParams();
    const viewAsUserId = searchParams.get('viewAs');

    const fetchData = async () => {
        setLoading(true);
        try {
            const urlParams = viewAsUserId ? `?viewAs=${viewAsUserId}` : '';

            // Buscando Fãs
            const fansRes = await fetch(`/api/instagram/insights${urlParams}`);
            const fansData = await fansRes.json();
            if (fansData.superFans) setSuperFans(fansData.superFans);

            // Buscando Posts
            const postsRes = await fetch(`/api/instagram/posts-performance${urlParams}`);
            const postsData = await postsRes.json();
            if (postsData.topPosts) setTopPosts(postsData.topPosts);

            // Buscando Timeline
            const timeRes = await fetch(`/api/instagram/timeline${urlParams}`);
            const timeData = await timeRes.json();
            if (timeData.timeline) setTimeline(timeData.timeline);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDeepSync = async () => {
        setSyncing(true);
        /** 
         * Fire a Toast notification that stays alive to show progress
         */
        Swal.fire({
            title: 'Analisando Engajamento',
            text: 'Isso pode demorar um pouco, estamos lendo todos as postagens e dezenas de comentários...',
            icon: 'info',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const syncUrl = viewAsUserId ? `/api/instagram/sync?viewAs=${viewAsUserId}` : '/api/instagram/sync';
            const res = await fetch(syncUrl, { method: 'POST' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Falha ao iniciar');

            if (data.useApify && data.runId) {
                // Polling loop
                let finished = false;
                let attempts = 0;
                while (!finished && attempts < 40) { // ~2 min max
                    attempts++;
                    await new Promise(r => setTimeout(r, 4000));
                    
                    const statusRes = await fetch(`/api/instagram/sync/status?runId=${data.runId}`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'SUCCEEDED') {
                        Swal.update({
                            title: 'Finalizando Processamento...',
                            text: 'Organizando as métricas e lideranças no banco de dados.'
                        });
                        
                        // Processamento final
                        const processRes = await fetch('/api/instagram/sync/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                runId: data.runId,
                                datasetId: statusData.datasetId,
                                viewAsUserId: viewAsUserId
                            })
                        });
                        
                        if (!processRes.ok) throw new Error('Erro ao salvar dados processados');
                        const result = await processRes.json();
                        
                        Swal.fire({
                            title: 'Sucesso!',
                            text: `${result.stats?.syncedPosts || 0} posts e ${result.stats?.syncedComments || 0} comentários analisados.`,
                            icon: 'success',
                            timer: 3000
                        });
                        finished = true;
                    } else if (statusData.status === 'FAILED' || statusData.status === 'ABORTED' || statusData.status === 'TIMED-OUT') {
                        throw new Error('A extração foi interrompida pelo servidor do Instagram.');
                    }
                }
            } else {
                // Caso não use Apify (fallback)
                Swal.fire({
                    title: 'Sucesso!',
                    text: 'Dados sincronizados com sucesso.',
                    icon: 'success',
                    timer: 2000
                });
            }

            await fetchData();
        } catch (err: any) {
            Swal.fire('Erro', err.message || 'Falha na extração de dados', 'error');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="p-8 space-y-8 bg-gray-50/50 dark:bg-[#0a0f1c] min-h-screen">
            {/* Header section with new sync button UX */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                        Deep Analytics (Instagram)
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        Análise profunda camada por camada das interações reais na sua conta.
                    </p>
                </div>

                <button
                    onClick={handleDeepSync}
                    disabled={syncing}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {syncing ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Extraindo...</span>
                        </>
                    ) : (
                        <>
                            <TrendingUp className="w-5 h-5" />
                            <span>Sincronizar Novos Dados</span>
                        </>
                    )}
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">Carregando painel de inteligência...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* TOP FULL WIDTH: Timeline Chart */}
                    <Card className="col-span-1 lg:col-span-2 border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardHeader className="border-b border-gray-50 dark:border-gray-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
                                <TrendingUp className="w-5 h-5 text-indigo-500" />
                                Linha do Tempo de Engajamento
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            {timeline.length > 0 ? (
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={timeline} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                            <XAxis dataKey="dateStr" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Legend verticalAlign="top" height={36} iconType="circle" />
                                            <Line type="monotone" name="Curtidas" dataKey="likes" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                            <Line type="monotone" name="Comentários" dataKey="comments" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-[300px] flex items-center justify-center text-gray-500">
                                    <p>Dados insuficientes para desenhar o gráfico. Sincronize novos dados.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* LEFTSIDE: Top Performing Posts */}
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardHeader className="border-b border-gray-50 dark:border-gray-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
                                <TrendingUp className="w-5 h-5 text-indigo-500" />
                                Postagens com Maior Engajamento
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {topPosts.length > 0 ? (
                                <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                    {topPosts.slice(0, 6).map((post, idx) => (
                                        <div key={post.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                            <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0 relative flex items-center justify-center border border-gray-200 dark:border-gray-700">
                                                {post.mediaUrl ? (
                                                    <img src={post.mediaUrl} alt="Post" className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImageIcon className="w-6 h-6 text-gray-400" />
                                                )}
                                                {post.mediaType === 'VIDEO' && (
                                                    <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
                                                        <Video className="w-3 h-3 text-white" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium truncate">
                                                    {post.caption || "Postagem sem legenda"}
                                                </p>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        <strong>{post.commentsCount}</strong>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Heart className="w-3.5 h-3.5" />
                                                        <strong>{post.likesCount}</strong>
                                                    </span>
                                                    <span className="text-gray-400">
                                                        {new Date(post.postedAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-xl font-bold text-gray-300 dark:text-gray-700">
                                                #{idx + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-gray-500">
                                    Nenhuma postagem encontrada. Sincronize os dados.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* RIGHTSIDE: Lideranças / Super Fans (Moved from old dashboard) */}
                    <Card className="border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#111827]">
                        <CardHeader className="border-b border-gray-50 dark:border-gray-800/50 pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Lideranças de Engajamento
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            {superFans && superFans.length > 0 ? (
                                <div className="space-y-5">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-12 gap-4 text-xs font-bold text-gray-400 pb-2 border-b border-gray-100 dark:border-gray-800 uppercase tracking-wider">
                                        <div className="col-span-6">Usuário</div>
                                        <div className="col-span-3 text-center">Score</div>
                                        <div className="col-span-3 text-right">Última Vez</div>
                                    </div>

                                    {superFans.map((fan, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-4 items-center">
                                            <div className="col-span-6 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs ring-1 ring-indigo-200 dark:ring-indigo-800/30">
                                                    {idx === 0 ? '🏆' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                                </div>
                                                <span className="font-semibold text-gray-900 dark:text-white truncate">
                                                    {fan.username.startsWith('Usuário') ? fan.username : `@${fan.username}`}
                                                </span>
                                            </div>

                                            <div className="col-span-3 flex flex-col items-center">
                                                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-1">
                                                    <div
                                                        className="bg-indigo-500 h-1.5 rounded-full"
                                                        style={{ width: `${Math.min((fan.interactionScore / (superFans[0]?.interactionScore || 1)) * 100, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-gray-500 font-medium">
                                                    {fan.interactionScore} int.
                                                </span>
                                            </div>

                                            <div className="col-span-3 text-right text-xs text-gray-500">
                                                {new Date(fan.lastInteractedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 text-center">
                                    <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                                    <p className="text-sm text-gray-500 max-w-sm">
                                        Ainda não extraímos os dados profundos de comentários das postagens para gerar este ranking.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>
            )}
        </div>
    );
}

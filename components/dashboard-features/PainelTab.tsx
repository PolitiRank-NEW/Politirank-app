import { cn } from "@/app/lib/utils";
import { Trophy, Medal, Plus, Instagram, Facebook, Twitter, TrendingUp, MessageCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PainelTabProps {
    hasInstagram?: boolean;
    hasFacebook?: boolean;
    hasWhatsapp?: boolean;
    superFans?: any[];
    totalInteractions?: number;
    whatsappLiderancas?: any[];
}

export function PainelTab({ hasInstagram = false, hasFacebook = false, hasWhatsapp = false, superFans, totalInteractions = 1, whatsappLiderancas = [] }: PainelTabProps) {
    // Mock Data based on Figma
    // Array totalmente vazio agora para remover os dados mockados residuais.
    const mockLeaders: any[] = [];

    const getWppMetrics = (lid: any) => {
        let members = lid.currentMembers || 0;
        let entries = lid.entryCount || 0;
        let exits = lid.exitCount || 0;
        if (lid.groups && lid.groups.length > 0) {
            lid.groups.forEach((g: any) => { 
                members += (g.currentMembers || 0);
                entries += (g.entryCount || 0);
                exits += (g.exitCount || 0);
            });
        }
        return { members, entries, exits };
    };

    // Função utilitária para calcular engajamento em percentual (igual no WhatsAppTracker)
    const calculateEngagementRate = (current: number, entries: number, exits: number) => {
        if (current === 0) return 0;
        const interactions = entries + exits;
        const rate = (interactions / current) * 100;
        return Math.min(100, Math.round(rate * 10) / 10);
    };

    const getEngagementTheme = (rate: number | string) => {
        const numRate = typeof rate === 'number' ? rate : parseFloat(rate.toString().replace('%',''));
        if (isNaN(numRate)) return "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700";
        if (numRate < 15) return "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50";
        if (numRate < 40) return "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50";
        return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50";
    };

    // Função helper para limpar arrobas e case na hora do match
    const cleanHandle = (handle?: string) => {
        if (!handle) return '';
        return handle.replace(/@/g, '').trim().toLowerCase();
    };

    // Cria um mapa para saber quais lideranças já cruzamos
    const matchedLiderancaIds = new Set<string>();

    let combinedLeaders: any[] = [];

    if (superFans && superFans.length > 0) {
        combinedLeaders = superFans.map((fan) => {
            const fanIgHandle = cleanHandle(fan.username);
            
            // Tenta achar essa pessoa nas lideranças do WhatsApp através do IG Handle
            const matchedWppLideranca = whatsappLiderancas.find(l => cleanHandle(l.instagramHandle) === fanIgHandle);
            
            let wppMetrics = { members: 0, entries: 0, exits: 0 };
            let finalName = fan.username;
            let displayWppHandle = false;

            if (matchedWppLideranca) {
                matchedLiderancaIds.add(matchedWppLideranca.id);
                wppMetrics = getWppMetrics(matchedWppLideranca);
                finalName = matchedWppLideranca.name || fan.username;
                displayWppHandle = !!matchedWppLideranca.whatsappHandle;
            }

            // Calculando IG (Max 100%)
            const igPercentageValue = totalInteractions > 0 ? ((fan.interactionScore / totalInteractions) * 100) : 0;
            const igPercentageString = igPercentageValue.toFixed(1);

            // Calculando WPP
            const wppRate = calculateEngagementRate(wppMetrics.members, wppMetrics.entries, wppMetrics.exits);

            // MEDIA PONDERADA (Peso maior pro WhatsApp: 70%, Instagram: 30%)
            let absEngagementNum = 0;
            if (matchedWppLideranca && hasWhatsapp && hasInstagram) {
                absEngagementNum = (wppRate * 0.7) + (igPercentageValue * 0.3);
            } else if (matchedWppLideranca && hasWhatsapp) {
                absEngagementNum = wppRate;
            } else if (hasInstagram) {
                absEngagementNum = igPercentageValue;
            }

            return {
                baseId: fanIgHandle,
                name: finalName,
                igHandle: fan.username, // para visualizacao
                wppHandle: matchedWppLideranca?.whatsappHandle,
                region: matchedWppLideranca ? (matchedWppLideranca.region || "Liderança Multi-Canal") : "Seguidor/Orgânico",
                mentions: "-",
                igComments: hasInstagram ? fan.interactionScore : "-",
                igShare: hasInstagram ? `${igPercentageString}%` : "-",
                groupEngagement: hasWhatsapp ? (matchedWppLideranca ? `${wppRate}%` : "Sem Vínculo WPP") : "-",
                groupEngagementRate: matchedWppLideranca ? wppRate : 0,
                absEngagement: absEngagementNum,
                absEngagementDisplay: `${absEngagementNum.toFixed(1)}%`,
                trendUp: true,
                hasIgConnected: hasInstagram,
                hasWppConnected: !!matchedWppLideranca && hasWhatsapp
            };
        });
    }

    // Agora adiciona as lideranças de WPP que não apareceram nos Top Fans do IG (ou que não tem IG vinculado)
    if (hasWhatsapp && whatsappLiderancas.length > 0) {
        whatsappLiderancas.forEach(lid => {
            if (!matchedLiderancaIds.has(lid.id)) {
                const wppMetrics = getWppMetrics(lid);
                const wppRate = calculateEngagementRate(wppMetrics.members, wppMetrics.entries, wppMetrics.exits);

                combinedLeaders.push({
                    baseId: lid.id,
                    name: lid.name,
                    igHandle: lid.instagramHandle,
                    wppHandle: lid.whatsappHandle,
                    region: lid.region || "Liderança WPP",
                    mentions: "-",
                    igComments: "-",
                    igShare: "-",
                    groupEngagement: `${wppRate}%`,
                    groupEngagementRate: wppRate,
                    absEngagement: wppRate, // Puramente WPP, logo Media final = 100% WPP
                    absEngagementDisplay: `${wppRate.toFixed(1)}%`,
                    trendUp: true,
                    hasIgConnected: !!lid.instagramHandle && hasInstagram,
                    hasWppConnected: true
                });
            }
        });
    }

    // Ordenar do maior engajamento absoluto pro menor
    combinedLeaders.sort((a, b) => b.absEngagement - a.absEngagement);

    // Mapear rank final
    const leaders = combinedLeaders.map((l, idx) => ({
        ...l,
        id: l.baseId + '-' + idx,
        rankId: idx + 1
    }));


    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
        if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
        if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
        return <span className="text-slate-500 font-semibold w-5 text-center">{rank}</span>;
    };

    return (
        <div className="space-y-6">
            {/* Cabecalho Painel */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-[1.35rem] font-bold text-slate-900 dark:text-white leading-tight">Lideranças</h2>
                    <p className="text-[15px] font-medium text-slate-500">Ranking de lideranças baseado no desempenho e engajamento</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button 
                        onClick={() => alert('Função de adicionar liderança (gestão manual) estará disponível em breve.')}
                        className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Adicionar Liderança
                    </button>
                </div>
            </div>

            {/* Tabela de Liderancas */}
            <div className="w-full bg-white dark:bg-gray-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Posição</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Nome</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Região</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-center">Menções da Liderança</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-center">Freq. Comentários (IG)</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-center">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex items-center gap-1 cursor-help">
                                                    Share Engajamento (IG)
                                                    <Info className="w-3.5 h-3.5 text-slate-400" />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-[220px] text-xs">
                                                Percentual do score de interação desta liderança em relação ao total de interações de todos os top-fãs do Instagram.
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-center">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex items-center gap-1 cursor-help">
                                                    Engajamento no Grupo
                                                    <Info className="w-3.5 h-3.5 text-slate-400" />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-[220px] text-xs">
                                                Fórmula WPP: (entradas + saídas) ÷ membros ativos × 100. Mede a movimentação do grupo.
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-center">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex items-center gap-1 cursor-help">
                                                    Engajamento Absoluto
                                                    <Info className="w-3.5 h-3.5 text-slate-400" />
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-[240px] text-xs">
                                                Média ponderada: 70% engajamento WPP + 30% share IG, quando ambos estão conectados. Caso contrário, usa apenas a fonte disponível.
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {leaders.length > 0 ? (
                                leaders.map((leader, index) => {
                                    const rank = index + 1;
                                    return (
                                        <tr key={leader.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    {getRankIcon(leader.rankId)}
                                                    {leader.rankId > 3 && <div className="w-5" />}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[150px]" title={leader.name}>{leader.name}</span>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                        {/* Instagram */}
                                                        <div className={`flex items-center gap-1 ${leader.igHandle ? 'opacity-90' : 'opacity-40 grayscale'}`} title={`Instagram: ${leader.igHandle || 'Não vinculado'}`}>
                                                            <Instagram className={`w-3.5 h-3.5 ${hasInstagram && leader.igHandle ? 'text-pink-500' : 'text-slate-400'}`} />
                                                            {leader.igHandle && <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">@{leader.igHandle}</span>}
                                                        </div>
                                                        
                                                        {/* Facebook */}
                                                        <div className="flex items-center gap-1 opacity-30 grayscale" title="Facebook não suportado ainda">
                                                            <Facebook className={`w-3.5 h-3.5 ${hasFacebook ? 'text-blue-600' : 'text-slate-400'}`} />
                                                        </div>

                                                        {/* WhatsApp */}
                                                        <div className={`flex items-center gap-1 ${leader.hasWppConnected ? 'opacity-90' : 'opacity-40 grayscale'}`} title={`WhatsApp: ${leader.wppHandle || 'Sem handle do WhatsApp'}`}>
                                                            <MessageCircle className={`w-3.5 h-3.5 ${hasWhatsapp && leader.hasWppConnected ? 'text-green-500' : 'text-slate-400'}`} />
                                                            {leader.wppHandle && <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{leader.wppHandle}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-[13px] font-medium border border-slate-200 dark:border-slate-700">
                                                    {leader.region}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-center font-bold text-slate-900 dark:text-slate-100">
                                                {leader.mentions}
                                            </td>
                                            <td className="px-6 py-5 text-center font-bold text-slate-900 dark:text-slate-100">
                                                {leader.igComments === "Conta Desconectada" ? (
                                                    <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">Desconectado</span>
                                                ) : leader.igComments === "-" ? "-" : (
                                                    <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-md text-xs border border-blue-100 dark:border-blue-800/50">
                                                        {leader.igComments}x comentários
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-center font-bold text-slate-900 dark:text-slate-100">
                                                {leader.igShare}
                                            </td>
                                            <td className="px-6 py-5 text-center font-bold text-slate-900 dark:text-slate-100">
                                                {leader.groupEngagement === "WhatsApp Não Conectado" || leader.groupEngagement === "Sem Vínculo WPP" || leader.groupEngagement === "-" ? (
                                                    <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
                                                        {leader.groupEngagement}
                                                    </span>
                                                ) : (
                                                    <div className="flex justify-center">
                                                        <div className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs ${getEngagementTheme(leader.groupEngagementRate)}`}>
                                                            {leader.groupEngagement}
                                                            {leader.trendUp && <TrendingUp className="w-3.5 h-3.5 opacity-80" />}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-center font-bold text-slate-900 dark:text-slate-100">
                                                <div className="flex justify-center">
                                                    <div className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs ${getEngagementTheme(leader.absEngagement)}`}>
                                                        {leader.absEngagementDisplay}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 whitespace-normal">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <Instagram className="w-8 h-8 opacity-20" />
                                            <p className="text-base font-medium">Nenhuma liderança orgânica carregada ainda.</p>
                                            <p className="text-sm opacity-80 max-w-sm mt-1 mx-auto">Conecte sua conta do Instagram ou aguarde a primeira sincronização de dados preencher esta tabela automaticamente.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

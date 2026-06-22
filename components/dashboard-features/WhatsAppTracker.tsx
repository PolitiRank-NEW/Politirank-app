import { useState, useRef } from "react";
import { MessageCircle, Database, Users, TrendingUp, Info, Activity, UserPlus, UserMinus, FileDigit, BarChart, User, LayoutGrid, LayoutList, Sprout, Loader2, CheckCircle, AlertCircle, Download, Upload, FileSpreadsheet, GitMerge, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppGroupDetail } from "./WhatsAppGroupDetail";
import Papa from "papaparse";

interface WhatsAppTrackerProps {
    hasWhatsapp?: boolean;
    messages?: number;
    liderancas?: any[];
    userRole?: string;
    candidateProfileId?: string;
}

export function WhatsAppTracker({ hasWhatsapp = false, messages = 0, liderancas = [], userRole, candidateProfileId }: WhatsAppTrackerProps) {
    const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
    const [seedLoading, setSeedLoading] = useState(false);
    const [seedResult, setSeedResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [crossLoading, setCrossLoading] = useState(false);
    const [crossResult, setCrossResult] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const canSeed = isAdmin && !!candidateProfileId;
    const canCrossRef = isAdmin && !!candidateProfileId;

    async function handleSeedData() {
        if (!candidateProfileId) return;
        setSeedLoading(true);
        setSeedResult(null);
        try {
            const res = await fetch('/api/admin/seed-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateProfileId }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSeedResult({ type: 'success', message: data.message });
                setTimeout(() => window.location.reload(), 1500);
            } else {
                setSeedResult({ type: 'error', message: data.error || 'Erro ao executar seed.' });
            }
        } catch (err: any) {
            setSeedResult({ type: 'error', message: err.message || 'Erro de conexão.' });
        } finally {
            setSeedLoading(false);
        }
    }

    async function handleCrossReference() {
        if (!candidateProfileId) return;
        setCrossLoading(true);
        setCrossResult(null);
        try {
            const res = await fetch('/api/whatsapp/cross-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId: candidateProfileId }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setCrossResult(data.message);
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setCrossResult(data.error || 'Erro no cruzamento.');
            }
        } catch (err: any) {
            setCrossResult(err.message || 'Erro de conexão.');
        } finally {
            setCrossLoading(false);
        }
    }

    function handleExportCsv() {
        if (!candidateProfileId) return;
        window.open(`/api/whatsapp/export?candidateId=${candidateProfileId}`, '_blank');
    }

    function handleDownloadTemplate() {
        window.open('/api/whatsapp/import', '_blank');
    }

    function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !candidateProfileId || !isAdmin) return;

        setImportResult(null);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as Record<string, unknown>[];
                if (rows.length === 0) {
                    setImportResult('CSV vazio ou sem linhas válidas.');
                    return;
                }

                const confirmImport = window.confirm(
                    `Importar ${rows.length} pessoa(s) para os grupos do candidato?\n\nA coluna "Grupo" deve corresponder ao nome do grupo.\nDuplicados serão ignorados.`
                );
                if (!confirmImport) return;

                setImporting(true);
                try {
                    const res = await fetch('/api/whatsapp/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ candidateId: candidateProfileId, rows, skipDuplicates: true }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Erro na importação.');
                    setImportResult(data.message);
                    setTimeout(() => window.location.reload(), 2000);
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Erro na importação.';
                    setImportResult(message);
                } finally {
                    setImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            },
            error: (parseError: Error) => {
                setImportResult(`Erro ao ler CSV: ${parseError.message}`);
                if (fileInputRef.current) fileInputRef.current.value = '';
            },
        });
    }

    const readOnly = userRole === 'CANDIDATO';

    // Cálculos Agregados de Hierarquia para o Candidato
    let totalLiderancas = liderancas.length;
    let totalGrupos = 0;
    
    // As lideranças também podem ter métricas próprias, então somamos tudo
    let totalCurrentMembers = 0;
    let totalEntries = 0;
    let totalExits = 0;
    let totalDuplicates = 0;

    liderancas.forEach(l => {
        totalEntries += (l.entryCount || 0);
        totalExits += (l.exitCount || 0);
        totalCurrentMembers += (l.currentMembers || 0);
        totalDuplicates += (l.duplicateMembers || 0);
        
        if (l.groups && l.groups.length > 0) {
            totalGrupos += l.groups.length;
            l.groups.forEach((g: any) => {
                totalEntries += (g.entryCount || 0);
                totalExits += (g.exitCount || 0);
                totalCurrentMembers += (g.currentMembers || 0);
                totalDuplicates += (g.duplicateMembers || 0);
            });
        }
    });

    const hasHierarchicalData = totalLiderancas > 0;
    
    // Função utilitária para calcular engajamento simples
    const calculateEngagement = (current: number, entries: number, exits: number) => {
        if (current === 0) return 0;
        const interactions = entries + exits;
        const rate = (interactions / current) * 100;
        return Math.min(100, Math.round(rate * 10) / 10); // max 100%, 1 casa decimal
    };

    const getEngagementTheme = (rate: number) => {
        if (rate < 15) return "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50 ring-red-100 dark:ring-red-900";
        if (rate < 40) return "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 ring-amber-100 dark:ring-amber-900";
        return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 ring-emerald-100 dark:ring-emerald-900";
    };

    const overallEngagement = calculateEngagement(totalCurrentMembers, totalEntries, totalExits);

    if (hasWhatsapp && (messages > 0 || hasHierarchicalData)) {
        return (
            <>
            <div className="space-y-8">
                {/* 1. INSTÂNCIA MAIOR: CANDIDATO (Dados Globais) */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-[1.35rem] font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                                Rastreador do WhatsApp
                                {isAdmin && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[11px] font-bold rounded-full border border-amber-200 dark:border-amber-800">
                                        <Database className="w-3 h-3" />
                                        Dados Manuais
                                    </span>
                                )}
                            </h2>
                            <p className="text-[15px] font-medium text-slate-500">Visão Geral do Candidato (Soma de todas as instâncias)</p>
                        </div>

                        {/* Botões de ação — admins */}
                        {isAdmin && candidateProfileId && (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all shadow-sm"
                                >
                                    <FileSpreadsheet className="w-4 h-4" />
                                    Modelo CSV
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={importing}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition-all disabled:opacity-60 shadow-sm"
                                >
                                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    Importar CSV
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={handleImportFileChange}
                                />
                                <button
                                    onClick={handleExportCsv}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all shadow-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    Exportar CSV
                                </button>
                                <button
                                    onClick={handleCrossReference}
                                    disabled={crossLoading}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 transition-all disabled:opacity-60 shadow-sm"
                                >
                                    {crossLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                                    Cruzar IG/FB
                                </button>
                                {(crossResult || importResult) && (
                                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                        {importResult || crossResult}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Botão de Seed — visível apenas para admins impersonando um candidato */}
                        {canSeed && (
                            <div className="flex flex-col items-end gap-2">
                                <button
                                    onClick={handleSeedData}
                                    disabled={seedLoading}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                                >
                                    {seedLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Sprout className="w-4 h-4" />
                                    )}
                                    {seedLoading ? 'Gerando dados...' : 'Carregar Dados de Demonstração'}
                                </button>
                                {seedResult && (
                                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${
                                        seedResult.type === 'success'
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-red-600 dark:text-red-400'
                                    }`}>
                                        {seedResult.type === 'success' ? (
                                            <CheckCircle className="w-3.5 h-3.5" />
                                        ) : (
                                            <AlertCircle className="w-3.5 h-3.5" />
                                        )}
                                        {seedResult.message}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-500 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500"/> Total Membros</span>
                            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{totalCurrentMembers.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-500 flex items-center gap-2"><UserPlus className="w-4 h-4 text-green-500"/> Entradas Totais</span>
                            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">+{totalEntries.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-500 flex items-center gap-2"><UserMinus className="w-4 h-4 text-red-500"/> Saídas Totais</span>
                            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">-{totalExits.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-500 flex items-center gap-2"><FileDigit className="w-4 h-4 text-slate-400"/> Duplicados Totais</span>
                            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{totalDuplicates.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className={`p-5 rounded-2xl border shadow-sm flex flex-col gap-1 transition-all ${getEngagementTheme(overallEngagement)}`}>
                            <span className="text-[11px] font-extrabold uppercase opacity-70 flex items-center gap-2 tracking-wider"><TrendingUp className="w-4 h-4"/> Engajamento Geral</span>
                            <span className="text-3xl font-extrabold leading-none mt-1">{overallEngagement}%</span>
                        </div>
                    </div>
                </div>

                {/* 2. INSTÂNCIA INTERMEDIÁRIA E MICRO: LIDERANÇAS E SEUS GRUPOS */}
                {hasHierarchicalData && (
                    <div className="space-y-6 pt-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-4">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <BarChart className="w-6 h-6 text-indigo-500" />
                                    Desempenho por Liderança
                                </h3>
                                <div className="hidden sm:block text-sm text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full font-medium">
                                    {totalLiderancas} Lideranças
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                <button 
                                    onClick={() => setViewMode('detailed')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'detailed' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                    Detalhado
                                </button>
                                <button 
                                    onClick={() => setViewMode('compact')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'compact' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    <LayoutList className="w-3.5 h-3.5" />
                                    Compacto
                                </button>
                            </div>
                        </div>

                        <div className="space-y-8">
                            {liderancas.map((lideranca) => {
                                const hasGroups = lideranca.groups && lideranca.groups.length > 0;
                                
                                // Somatorios exclusivos desta liderança incuindo os grupos abaixo dela
                                let lC = lideranca.currentMembers || 0;
                                let lE = lideranca.entryCount || 0;
                                let lEx = lideranca.exitCount || 0;
                                let lDup = lideranca.duplicateMembers || 0;
                                
                                if (hasGroups) {
                                    lideranca.groups.forEach((g: any) => {
                                        lC += (g.currentMembers || 0);
                                        lE += (g.entryCount || 0);
                                        lEx += (g.exitCount || 0);
                                        lDup += (g.duplicateMembers || 0);
                                    });
                                }

                                const lEngage = calculateEngagement(lC, lE, lEx);

                                return (
                                    <div key={lideranca.id} className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                                        
                                        {/* Card Maior: Header da Liderança */}
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                                                    <User className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                                                </div>
                                                <div>
                                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Liderança</span>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">{lideranca.name}</h4>
                                                        {lideranca.whatsappHandle && (
                                                            <span className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-200 dark:border-green-800/50">
                                                                WPP: {lideranca.whatsappHandle}
                                                            </span>
                                                        )}
                                                        {lideranca.instagramHandle && (
                                                            <span className="flex items-center gap-1 bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-fuchsia-200 dark:border-fuchsia-800/50">
                                                                IG: {lideranca.instagramHandle}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-medium text-slate-500">
                                                        {hasGroups ? `${lideranca.groups.length} Grupos vinculados` : 'Nenhum grupo vinculado'}
                                                        {lideranca.user && (
                                                            <span className="ml-2 inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold">
                                                                • Vinculado a: {lideranca.user.name}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status Resumidos da Liderança */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-center min-w-[80px]">
                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Membros</span>
                                                    <span className="font-bold text-slate-800 dark:text-slate-200">{lC}</span>
                                                </div>
                                                <div className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-center min-w-[80px]">
                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Entradas</span>
                                                    <span className="font-bold text-slate-800 dark:text-slate-200">+{lE}</span>
                                                </div>
                                                <div className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-center min-w-[80px]">
                                                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Saídas</span>
                                                    <span className="font-bold text-slate-800 dark:text-slate-200">-{lEx}</span>
                                                </div>
                                                <div className={`px-4 py-2 rounded-xl text-center min-w-[100px] border ring-2 ring-transparent transition-all shadow-sm ${getEngagementTheme(lEngage)}`}>
                                                    <span className="block text-[10px] uppercase font-extrabold opacity-70 tracking-wider mb-0.5">Engajamento</span>
                                                    <span className="font-extrabold text-lg leading-none">{lEngage}%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {viewMode === 'detailed' ? (
                                            <>
                                                {/* Grade de Grupos (Cards Menores) */}
                                                {hasGroups && (
                                                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 mt-6 md:mt-0">
                                                        <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 px-1 pt-4">Grupos desta liderança</h5>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                                            {lideranca.groups.map((g: any) => {
                                                                const gMem = g.currentMembers || 0;
                                                                const gIn = g.entryCount || 0;
                                                                const gOut = g.exitCount || 0;
                                                                const gEngage = calculateEngagement(gMem, gIn, gOut);
                                                                const isActive = gMem > 0 || gIn > 0;

                                                                return (
                                                                    <button
                                                                        key={g.id}
                                                                        type="button"
                                                                        onClick={() => setSelectedGroupId(g.id)}
                                                                        className="w-full text-left bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all group"
                                                                    >
                                                                        <div className="flex items-start justify-between mb-4">
                                                                            <div className="flex flex-col gap-1 w-full pr-2">
                                                                                <div className="flex items-center gap-2">
                                                                                    <MessageCircle className="w-5 h-5 text-green-500 shrink-0" />
                                                                                    <h6 className="font-bold text-slate-800 dark:text-slate-100 truncate" title={g.name}>{g.name}</h6>
                                                                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                                                                                </div>
                                                                                {g.groupLeaderName && (
                                                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 pl-7">
                                                                                        <User className="w-3 h-3" /> Admin: {g.groupLeaderName}
                                                                                    </span>
                                                                                )}
                                                                                {(g.members?.length ?? 0) > 0 && (
                                                                                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 pl-7">
                                                                                        {g.members.length} pessoas cadastradas
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {isActive ? (
                                                                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full border border-green-200 dark:border-green-800/50">
                                                                                    <Activity className="w-3 h-3" /> Ativo
                                                                                </span>
                                                                            ) : (
                                                                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded-full border border-slate-200 dark:border-slate-700">
                                                                                    Inativo
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 mb-4">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-medium text-slate-400">Membros</span>
                                                                                <span className="font-bold text-slate-800 dark:text-slate-200">{gMem}</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-medium text-slate-400">Duplicados</span>
                                                                                <span className="font-bold text-slate-800 dark:text-slate-200">{g.duplicateMembers || 0}</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-medium text-slate-400">Entradas</span>
                                                                                <span className="font-bold text-slate-800 dark:text-slate-200">+{gIn}</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-xs font-medium text-slate-400">Saídas</span>
                                                                                <span className="font-bold text-slate-800 dark:text-slate-200">-{gOut}</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="pt-4">
                                                                            <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold border shadow-sm w-full justify-center ${getEngagementTheme(gEngage)}`}>
                                                                                <TrendingUp className="w-4 h-4 opacity-80" />
                                                                                Engajamento: {gEngage}%
                                                                            </span>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {!hasGroups && (
                                                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 mt-6 md:mt-0">
                                                        <div className="bg-white dark:bg-slate-950 mt-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center">
                                                            <p className="text-sm text-slate-500">Esta liderança ainda não possui grupos detalhados catalogados.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            /* Visão Compacta (Lista Linear Enxuta) */
                                            hasGroups && (
                                                <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
                                                    <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                            {lideranca.groups.map((g: any) => {
                                                                const gMem = g.currentMembers || 0;
                                                                const gIn = g.entryCount || 0;
                                                                const gOut = g.exitCount || 0;
                                                                const gEngage = calculateEngagement(gMem, gIn, gOut);
                                                                const isActive = gMem > 0 || gIn > 0;

                                                                return (
                                                                    <button
                                                                        key={g.id}
                                                                        type="button"
                                                                        onClick={() => setSelectedGroupId(g.id)}
                                                                        className="w-full p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 text-left"
                                                                    >
                                                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                                                            <div className="w-8 h-8 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                                                                                <MessageCircle className="w-4 h-4 text-green-500" />
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <h6 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate flex items-center gap-1">
                                                                                    {g.name}
                                                                                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                                                                    {g.groupLeaderName && <span className="text-xs font-normal text-slate-400 ml-2">({g.groupLeaderName})</span>}
                                                                                </h6>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <span className="text-[10px] font-medium text-slate-500">{gMem} membros</span>
                                                                                    {(g.members?.length ?? 0) > 0 && (
                                                                                        <>
                                                                                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                                                            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">{g.members.length} cadastrados</span>
                                                                                        </>
                                                                                    )}
                                                                                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                                                    {isActive ? (
                                                                                        <span className="text-[10px] font-bold text-green-600 dark:text-green-400">Ativo</span>
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-bold text-slate-400">Inativo</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
                                                                            <div className="flex flex-col text-right shrink-0">
                                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entrou</span>
                                                                                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">+{gIn}</span>
                                                                            </div>
                                                                            <div className="flex flex-col text-right shrink-0">
                                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saiu</span>
                                                                                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">-{gOut}</span>
                                                                            </div>
                                                                            <div className="flex flex-col text-right shrink-0">
                                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Engaj.</span>
                                                                                <span className={`text-[13px] font-extrabold px-2 py-0.5 rounded-md border ${getEngagementTheme(gEngage)}`}>{gEngage}%</span>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <WhatsAppGroupDetail
                groupId={selectedGroupId}
                open={!!selectedGroupId}
                onClose={() => setSelectedGroupId(null)}
                userRole={userRole}
                readOnly={readOnly}
            />
            </>
        );
    }

    // Estado padrão: sem dados ou recém chegado
    return (
        <div className="bg-white dark:bg-slate-950 rounded-2xl p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[400px] border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6">
                <MessageCircle className="w-8 h-8 text-green-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">WhatsApp não conectado</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-md">Para monitorar grupos, lideranças e mensagens do WhatsApp, conecte a API oficial ou importe via painel do Turk.</p>
            <p className="text-slate-400 dark:text-slate-500 mb-6 max-w-md text-sm">Administradores e Gerentes podem acessar <strong>Clientes</strong> e alimentar dados pela Inserção Manual Turker.</p>

            {/* Botão de seed para admins impersonando um candidato sem dados */}
            {canSeed && (
                <div className="flex flex-col items-center gap-3 mb-6">
                    <button
                        onClick={handleSeedData}
                        disabled={seedLoading}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
                    >
                        {seedLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Sprout className="w-4 h-4" />
                        )}
                        {seedLoading ? 'Gerando dados...' : 'Carregar Dados de Demonstração'}
                    </button>
                    {seedResult && (
                        <span className={`flex items-center gap-1.5 text-xs font-semibold ${
                            seedResult.type === 'success'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                        }`}>
                            {seedResult.type === 'success' ? (
                                <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                                <AlertCircle className="w-3.5 h-3.5" />
                            )}
                            {seedResult.message}
                        </span>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Apenas visível para administradores</p>
                </div>
            )}

            <Button className="bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-6 rounded-xl transition-colors">
                Conectar ao WhatsApp Oficial
            </Button>
        </div>
    );
}

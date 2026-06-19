"use client";

import { useState, useEffect } from "react";
import { cn } from "@/app/lib/utils";
import { ConnectInstagramButton } from "@/components/dashboard-features/ConnectInstagramButton";
import { InstagramStats } from "@/components/dashboard-features/InstagramStats";
import { PainelTab } from "@/components/dashboard-features/PainelTab";
import { WhatsAppTracker } from "@/components/dashboard-features/WhatsAppTracker";
import { ClientesManager } from "@/components/dashboard-features/ClientesManager";
import { SyncInstagramButton } from "@/components/dashboard-features/SyncInstagramButton";
import type { SyncStats } from "@/components/dashboard/SyncResultCard";

type TabValue = "painel" | "instagram" | "whatsapp" | "clientes";

interface ClientDashboardTabsProps {
    hasInstagram: boolean;
    hasFacebook?: boolean;
    hasWhatsapp?: boolean;
    superFans: any[];
    totalInteractions?: number;
    userRole?: string;
    allUsers?: any[];
    viewAsUserId?: string;
    whatsappMessages?: number;
    whatsappLiderancas?: any[];
    candidateProfileId?: string;
}

export function ClientDashboardTabs({
    hasInstagram,
    hasFacebook = false,
    hasWhatsapp = false,
    whatsappMessages = 0,
    whatsappLiderancas = [],
    superFans,
    totalInteractions = 1,
    userRole = 'CANDIDATO',
    allUsers = [],
    viewAsUserId,
    candidateProfileId,
}: ClientDashboardTabsProps) {
    const [activeTab, setActiveTab] = useState<TabValue>("painel");
    const [syncResult, setSyncResult] = useState<{ stats: SyncStats; syncedAt: Date } | null>(null);

    useEffect(() => {
        const savedResult = sessionStorage.getItem('lastSyncResult');
        if (savedResult) {
            try {
                const parsed = JSON.parse(savedResult);
                setSyncResult({
                    stats: parsed.stats,
                    syncedAt: new Date(parsed.syncedAt)
                });
                setActiveTab("instagram"); // Auto-navega para mostrar o resultado
            } catch (e) {
                console.error("Erro ao ler lastSyncResult:", e);
            }
            sessionStorage.removeItem('lastSyncResult');
        }
    }, []);

    const tabs: { label: string; value: TabValue }[] = [
        { label: "Painel", value: "painel" },
        { label: "Instagram", value: "instagram" },
        { label: "WhatsApp", value: "whatsapp" },
    ];

    if (userRole !== 'CANDIDATO') {
        tabs.push({ label: "Clientes", value: "clientes" });
    }

    // O handleSyncComplete não é mais usado diretamente pelo botão (que recarrega a página),
    // mas mantemos por compatibilidade se decidirmos não recarregar no futuro.
    function handleSyncComplete(stats: SyncStats, syncedAt: Date) {
        setSyncResult({ stats, syncedAt });
        setActiveTab("instagram");
    }

    return (
        <div className="space-y-6">
            {/* Navegação por abas — centralizada, botão de sync flutuante à direita */}
            <div className="relative flex justify-center w-full">
                {/* Pill Navigation — sempre centralizado */}
                <div className="inline-flex flex-wrap items-center justify-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl sm:rounded-full w-full sm:w-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={cn(
                                "relative flex-1 sm:flex-none px-4 py-2 sm:px-10 sm:py-2.5 text-sm sm:text-[15px] font-semibold rounded-xl sm:rounded-full transition-all duration-300 whitespace-nowrap text-center",
                                activeTab === tab.value
                                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}
                        >
                            {tab.label}
                            {/* Indicador de resultado de sync na aba Instagram */}
                            {tab.value === "instagram" && syncResult && activeTab !== "instagram" && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Botão de Sync — posicionado absolutamente à direita sem deslocar as abas */}
                {hasInstagram && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden sm:block">
                        <SyncInstagramButton
                            viewAsUserId={viewAsUserId}
                            onSyncComplete={handleSyncComplete}
                        />
                    </div>
                )}
            </div>

            {/* Botão de Sync mobile (abaixo das abas em telas pequenas) */}
            {hasInstagram && (
                <div className="flex justify-end sm:hidden">
                    <SyncInstagramButton
                        viewAsUserId={viewAsUserId}
                        onSyncComplete={handleSyncComplete}
                    />
                </div>
            )}

            {/* Tab Views */}
            <div className="mt-6">
                {activeTab === "painel" && (
                    <PainelTab
                        hasInstagram={hasInstagram}
                        hasFacebook={hasFacebook}
                        hasWhatsapp={hasWhatsapp}
                        superFans={superFans}
                        totalInteractions={totalInteractions}
                        whatsappLiderancas={whatsappLiderancas}
                    />
                )}

                {activeTab === "instagram" && (
                    <div className="space-y-6">
                        {hasInstagram ? (
                            <InstagramStats
                                viewAsUserId={viewAsUserId}
                                syncResult={syncResult}
                                onClearSyncResult={() => setSyncResult(null)}
                            />
                        ) : (
                            <div className="bg-white dark:bg-slate-950 rounded-2xl p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[400px] border border-slate-200 dark:border-slate-800">
                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-6">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-slate-400">
                                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Instagram não conectado</h3>
                                <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">Para acessar o painel de métricas completas e extrair dados de engajamento, conecte agora a sua conta profissional.</p>
                                <ConnectInstagramButton isConnected={false} />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "whatsapp" && (
                    <WhatsAppTracker
                        hasWhatsapp={hasWhatsapp}
                        messages={whatsappMessages}
                        liderancas={whatsappLiderancas}
                        userRole={userRole}
                        candidateProfileId={candidateProfileId}
                    />
                )}

                {activeTab === "clientes" && userRole !== 'CANDIDATO' && (
                    <ClientesManager allUsers={allUsers} userRole={userRole} />
                )}
            </div>
        </div>
    );
}

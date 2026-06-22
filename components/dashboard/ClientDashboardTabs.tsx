"use client";

import { useState } from "react";
import { cn } from "@/app/lib/utils";
import { ConnectInstagramButton } from "@/components/dashboard-features/ConnectInstagramButton";
import { SocialProfileTracker } from "@/components/dashboard-features/SocialProfileTracker";
import { PainelTab } from "@/components/dashboard-features/PainelTab";
import { WhatsAppTracker } from "@/components/dashboard-features/WhatsAppTracker";
import { ClientesManager } from "@/components/dashboard-features/ClientesManager";

type TabValue = "painel" | "instagram" | "facebook" | "whatsapp" | "clientes";

interface ClientDashboardTabsProps {
    hasInstagram: boolean;
    hasFacebook?: boolean;
    hasWhatsapp?: boolean;
    instagramHandle?: string;
    facebookHandle?: string;
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
    instagramHandle = "",
    facebookHandle = "",
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

    const tabs: { label: string; value: TabValue }[] = [
        { label: "Painel", value: "painel" },
        { label: "Instagram", value: "instagram" },
    ];

    if (hasFacebook) {
        tabs.push({ label: "Facebook", value: "facebook" });
    }

    tabs.push({ label: "WhatsApp", value: "whatsapp" });

    if (userRole !== 'CANDIDATO') {
        tabs.push({ label: "Clientes", value: "clientes" });
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-center w-full">
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
                        </button>
                    ))}
                </div>
            </div>

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
                        {hasInstagram && instagramHandle ? (
                            <SocialProfileTracker
                                platform="instagram"
                                connectedHandle={instagramHandle}
                                viewAsUserId={viewAsUserId}
                                isActive={activeTab === "instagram"}
                                userRole={userRole}
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
                                <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">Conecte sua conta profissional ou peça ao administrador para vincular o @ do Instagram no cadastro.</p>
                                <ConnectInstagramButton isConnected={false} />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "facebook" && (
                    <div className="space-y-6">
                        {hasFacebook && facebookHandle ? (
                            <SocialProfileTracker
                                platform="facebook"
                                connectedHandle={facebookHandle}
                                viewAsUserId={viewAsUserId}
                                isActive={activeTab === "facebook"}
                                userRole={userRole}
                            />
                        ) : (
                            <div className="bg-white dark:bg-slate-950 rounded-2xl p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[400px] border border-slate-200 dark:border-slate-800">
                                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-blue-600">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Facebook não vinculado</h3>
                                <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
                                    Peça ao administrador para vincular a URL ou página do Facebook no cadastro do candidato.
                                </p>
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

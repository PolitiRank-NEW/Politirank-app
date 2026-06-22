'use client';

import { Loader2, CheckCircle2, Instagram } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type SyncPlatform = 'instagram' | 'facebook';

interface SyncProgressModalProps {
    isOpen: boolean;
    progress: number;
    phase: string;
    statusLabel: string;
    platform?: SyncPlatform;
}

function FacebookIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    );
}

const PLATFORM_CONFIG = {
    instagram: {
        label: 'Instagram',
        gradient: 'from-pink-500 via-purple-500 to-indigo-500',
        barGradient: 'from-indigo-500 via-purple-500 to-pink-500',
        pingColor: 'bg-indigo-500/20',
        iconColor: 'text-pink-500',
        spinnerColor: 'text-indigo-500',
        doneMessage: 'As métricas e os posts foram atualizados.',
        syncingMessage:
            'Buscando as atualizações mais recentes do seu perfil. Isso pode demorar alguns segundos.',
    },
    facebook: {
        label: 'Facebook',
        gradient: 'from-blue-600 via-blue-500 to-indigo-500',
        barGradient: 'from-blue-600 via-blue-500 to-indigo-400',
        pingColor: 'bg-blue-500/20',
        iconColor: 'text-blue-600',
        spinnerColor: 'text-blue-500',
        doneMessage: 'As métricas e as publicações foram atualizadas.',
        syncingMessage:
            'Buscando as publicações e métricas da sua página. Isso pode demorar alguns segundos.',
    },
} as const;

export function SyncProgressModal({
    isOpen,
    progress,
    phase,
    statusLabel,
    platform = 'instagram',
}: SyncProgressModalProps) {
    const [show, setShow] = useState(false);
    const [mounted, setMounted] = useState(false);
    const config = PLATFORM_CONFIG[platform];

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setShow(true);
        } else {
            const t = setTimeout(() => setShow(false), 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    if (!mounted || (!show && !isOpen)) return null;

    const modalContent = (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'bg-slate-900/60 backdrop-blur-sm opacity-100' : 'bg-transparent backdrop-blur-none opacity-0 pointer-events-none'}`}
        >
            <div
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] w-[90%] max-w-sm sm:max-w-md overflow-hidden transition-all duration-300 transform ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'}`}
            >
                <div className={`bg-gradient-to-r ${config.gradient} h-2 w-full`} />

                <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                    <div className="relative mb-6">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-50 dark:bg-slate-800 border-4 border-white dark:border-slate-900 shadow-lg flex items-center justify-center relative z-10">
                            {phase === 'done' ? (
                                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-500" />
                            ) : (
                                <div className="relative flex items-center justify-center">
                                    {platform === 'facebook' ? (
                                        <FacebookIcon
                                            className={`w-8 h-8 sm:w-10 sm:h-10 ${config.iconColor} absolute`}
                                        />
                                    ) : (
                                        <Instagram
                                            className={`w-8 h-8 sm:w-10 sm:h-10 ${config.iconColor} absolute`}
                                        />
                                    )}
                                    <Loader2
                                        className={`w-12 h-12 sm:w-14 sm:h-14 ${config.spinnerColor} animate-spin opacity-20`}
                                    />
                                </div>
                            )}
                        </div>
                        {phase !== 'done' && (
                            <div
                                className={`absolute inset-0 rounded-full ${config.pingColor} animate-ping`}
                            />
                        )}
                    </div>

                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        {phase === 'done'
                            ? 'Sincronização Concluída!'
                            : `Sincronizando ${config.label}`}
                    </h3>
                    <p className="text-sm sm:text-base font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-[280px] sm:max-w-[320px]">
                        {phase === 'done' ? config.doneMessage : config.syncingMessage}
                    </p>

                    <div className="w-full space-y-3">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 px-1">
                            <span>{statusLabel}</span>
                            <span className="tabular-nums">{Math.round(progress)}%</span>
                        </div>

                        <div className="w-full h-3 sm:h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                            <div
                                className={`absolute top-0 left-0 h-full bg-gradient-to-r ${config.barGradient} transition-all duration-700 ease-out rounded-full`}
                                style={{ width: `${progress}%` }}
                            />
                            <div className="absolute top-0 left-0 h-full w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] animate-[shimmer_2s_infinite] -translate-x-full" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}

'use client';

import { Loader2, RefreshCw, CheckCircle2, Instagram } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface SyncProgressModalProps {
    isOpen: boolean;
    progress: number;
    phase: string;
    statusLabel: string;
}

export function SyncProgressModal({ isOpen, progress, phase, statusLabel }: SyncProgressModalProps) {
    const [show, setShow] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setShow(true);
        } else {
            // Small delay to allow exit animations
            const t = setTimeout(() => setShow(false), 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    if (!mounted || (!show && !isOpen)) return null;

    const modalContent = (
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'bg-slate-900/60 backdrop-blur-sm opacity-100' : 'bg-transparent backdrop-blur-none opacity-0 pointer-events-none'}`}>
            <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] w-[90%] max-w-sm sm:max-w-md overflow-hidden transition-all duration-300 transform ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'}`}>
                
                {/* Header Decoration */}
                <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 h-2 w-full" />
                
                <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                    
                    {/* Icon Circle */}
                    <div className="relative mb-6">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-50 dark:bg-slate-800 border-4 border-white dark:border-slate-900 shadow-lg flex items-center justify-center relative z-10">
                            {phase === 'done' ? (
                                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-500" />
                            ) : (
                                <div className="relative flex items-center justify-center">
                                    <Instagram className="w-8 h-8 sm:w-10 sm:h-10 text-pink-500 absolute" />
                                    <Loader2 className="w-12 h-12 sm:w-14 sm:h-14 text-indigo-500 animate-spin opacity-20" />
                                </div>
                            )}
                        </div>
                        {/* Ping Animation background */}
                        {phase !== 'done' && (
                            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
                        )}
                    </div>

                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        {phase === 'done' ? 'Sincronização Concluída!' : 'Sincronizando Instagram'}
                    </h3>
                    <p className="text-sm sm:text-base font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-[280px] sm:max-w-[320px]">
                        {phase === 'done' 
                            ? 'As métricas e os posts foram atualizados.'
                            : 'Buscando as atualizações mais recentes do seu perfil. Isso pode demorar alguns segundos.'}
                    </p>

                    {/* Progress Bar Container */}
                    <div className="w-full space-y-3">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 px-1">
                            <span>{statusLabel}</span>
                            <span className="tabular-nums">{Math.round(progress)}%</span>
                        </div>
                        
                        <div className="w-full h-3 sm:h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                            <div 
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-700 ease-out rounded-full"
                                style={{ width: `${progress}%` }}
                            />
                            {/* Shiny overlay effect */}
                            <div className="absolute top-0 left-0 h-full w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] animate-[shimmer_2s_infinite] -translate-x-full" />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}

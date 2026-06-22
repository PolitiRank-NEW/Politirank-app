'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import type { SyncStats } from '@/components/dashboard/SyncResultCard';
import { SyncProgressModal } from '@/components/dashboard/SyncProgressModal';

interface SyncFacebookButtonProps {
    className?: string;
    viewAsUserId?: string;
    onSyncComplete?: (stats: SyncStats, syncedAt: Date) => void;
}

export function SyncFacebookButton({
    className = '',
    viewAsUserId,
    onSyncComplete,
}: SyncFacebookButtonProps) {
    const [phase, setPhase] = useState<'idle' | 'syncing' | 'done'>('idle');
    const [statusLabel, setStatusLabel] = useState('Sincronizar Agora');
    const [progress, setProgress] = useState(0);
    const searchParams = useSearchParams();

    const effectiveViewAs = viewAsUserId || searchParams.get('viewAs');

    const handleSync = async () => {
        setPhase('syncing');
        setStatusLabel('Conectando ao Facebook...');
        setProgress(5);

        try {
            const syncUrl = effectiveViewAs
                ? `/api/facebook/sync?viewAs=${effectiveViewAs}`
                : '/api/facebook/sync';

            const res = await fetch(syncUrl, { method: 'POST' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Falha ao iniciar sincronização');

            let finalStats: SyncStats | null = null;

            if (data.useApify && data.runId) {
                setProgress(15);

                let finished = false;
                let attempts = 0;
                const maxAttempts = 40;
                const phases = [
                    'Acessando a página...',
                    'Navegando nas publicações...',
                    'Verificando reações...',
                    'Coletando compartilhamentos...',
                    'Finalizando extração...',
                ];
                let phaseIdx = 0;

                while (!finished && attempts < maxAttempts) {
                    attempts++;
                    await new Promise((r) => setTimeout(r, 3000));

                    const newProg = 15 + Math.min(75, Math.floor((attempts / maxAttempts) * 100 * 2));
                    setProgress(newProg);
                    setStatusLabel(phases[phaseIdx % phases.length]);
                    phaseIdx++;

                    const statusRes = await fetch(
                        `/api/facebook/sync/status?runId=${data.runId}`
                    );
                    const statusData = await statusRes.json();

                    if (statusData.status === 'SUCCEEDED') {
                        setStatusLabel('Processando dados...');
                        setProgress(95);
                        const processRes = await fetch('/api/facebook/sync/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                runId: data.runId,
                                datasetId: statusData.datasetId,
                                viewAsUserId: effectiveViewAs,
                            }),
                        });
                        const processData = await processRes.json();
                        if (!processRes.ok) throw new Error('Erro ao processar dados finais');
                        finalStats = processData.stats ?? null;
                        finished = true;
                    } else if (
                        statusData.status === 'FAILED' ||
                        statusData.status === 'ABORTED' ||
                        statusData.status === 'TIMED-OUT'
                    ) {
                        throw new Error('A extração foi interrompida pelo Facebook.');
                    }
                }

                if (!finished) {
                    throw new Error('Tempo limite excedido. Tente novamente em alguns minutos.');
                }
            }

            setPhase('done');
            setStatusLabel('Sincronizado!');
            setProgress(100);

            if (finalStats) {
                sessionStorage.setItem(
                    'lastFacebookSyncResult',
                    JSON.stringify({
                        stats: finalStats,
                        syncedAt: new Date().toISOString(),
                    })
                );
                onSyncComplete?.(finalStats, new Date());
            }

            setTimeout(() => {
                setPhase('idle');
                setStatusLabel('Sincronizar Agora');
                setProgress(0);
                window.location.reload();
            }, 1500);
        } catch (err: unknown) {
            setPhase('idle');
            setStatusLabel('Sincronizar Agora');
            setProgress(0);
            const message = err instanceof Error ? err.message : 'Erro de conexão ao sincronizar.';
            alert(message);
        }
    };

    return (
        <>
            <button
                onClick={handleSync}
                disabled={phase === 'syncing'}
                className={`
          relative overflow-hidden
          px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300
          flex items-center gap-2 disabled:opacity-70
          ${
              phase === 'done'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/30'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-900'
          }
          ${className}
        `}
            >
                <span className="relative flex items-center gap-2 z-10">
                    {phase === 'syncing' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    {phase === 'done' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                    {phase === 'idle' && <RefreshCw className="w-4 h-4 shrink-0" />}
                    <span className="whitespace-nowrap">
                        {phase === 'idle' ? 'Sincronizar Agora' : 'Sincronizando...'}
                    </span>
                </span>
            </button>

            <SyncProgressModal
                isOpen={phase === 'syncing' || phase === 'done'}
                progress={progress}
                phase={phase}
                statusLabel={statusLabel}
                platform="facebook"
            />
        </>
    );
}

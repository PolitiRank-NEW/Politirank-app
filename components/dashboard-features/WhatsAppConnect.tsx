"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, QrCode, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhatsAppConnectProps {
    candidateProfileId?: string;
    evolutionInstanceName?: string | null;
    compact?: boolean;
    userRole?: string;
}

type ConnectionState = "not_configured" | "connecting" | "open" | "close" | "loading" | "error";

export function WhatsAppConnect({
    candidateProfileId,
    evolutionInstanceName,
    compact = false,
    userRole,
}: WhatsAppConnectProps) {
    const [state, setState] = useState<ConnectionState>("loading");
    const [instanceName, setInstanceName] = useState<string | null>(evolutionInstanceName || null);
    const [qrBase64, setQrBase64] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [syncProgress, setSyncProgress] = useState<string | null>(null);
    const autoSyncDone = useRef(false);
    const syncingLock = useRef(false);
    const wasConnecting = useRef(false);

    const syncStorageKey = candidateProfileId
        ? `politirank-wa-fullsync-${candidateProfileId}`
        : null;

    const fetchStatus = useCallback(async () => {
        if (!candidateProfileId) return;
        try {
            const res = await fetch(`/api/whatsapp/evolution/status?candidateId=${candidateProfileId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao consultar status.");

            if (!data.configured) {
                setState("not_configured");
                setInstanceName(null);
                return;
            }

            setInstanceName(data.instanceName);
            if (data.connected) {
                setState("open");
                setQrBase64(null);
            } else if (data.state === "connecting") {
                setState("connecting");
                wasConnecting.current = true;
            } else {
                setState("close");
            }
        } catch (err: unknown) {
            setState("error");
            setError(err instanceof Error ? err.message : "Erro de conexão.");
        }
    }, [candidateProfileId]);

    const fetchQr = useCallback(async () => {
        if (!candidateProfileId) return;
        try {
            const res = await fetch(`/api/whatsapp/evolution/connect?candidateId=${candidateProfileId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao obter QR Code.");

            setInstanceName(data.instanceName);
            setQrBase64(data.qrBase64 || null);
            setState(data.state === "open" ? "open" : "connecting");
            setError(null);
        } catch (err: unknown) {
            setState("error");
            setError(err instanceof Error ? err.message : "Evolution API indisponível.");
        }
    }, [candidateProfileId]);

    /** Sync completo: 1) lista todos os grupos rápido 2) membros em lotes paralelos */
    const runFullSync = useCallback(
        async (opts?: { force?: boolean }) => {
            if (!candidateProfileId) return;
            if (syncingLock.current && !opts?.force) return;
            syncingLock.current = true;
            setSyncing(true);
            setSyncResult(null);
            setError(null);

            try {
                setSyncProgress("Listando todos os grupos da conta…");
                const metaRes = await fetch("/api/whatsapp/evolution/sync-groups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        candidateId: candidateProfileId,
                        syncAll: true,
                        mode: "groups",
                    }),
                });
                const meta = await metaRes.json();
                if (!metaRes.ok) throw new Error(meta.error || "Falha ao listar grupos.");

                const total = meta.syncedGroups || meta.totalGroupsInAccount || 0;
                setSyncProgress(`${total} grupo(s) na lista. Carregando membros em lotes…`);
                setSyncResult(meta.message);

                let offset = 0;
                let hasMore = true;
                let rounds = 0;

                while (hasMore && rounds < 200) {
                    rounds += 1;
                    const batchRes = await fetch("/api/whatsapp/evolution/sync-groups", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            candidateId: candidateProfileId,
                            syncAll: true,
                            mode: "members",
                            batchOffset: offset,
                            batchSize: 25,
                        }),
                    });
                    const batch = await batchRes.json();
                    if (!batchRes.ok) throw new Error(batch.error || "Falha ao carregar membros.");

                    offset = batch.nextOffset ?? offset + 25;
                    hasMore = Boolean(batch.hasMoreMembers);
                    const done = Math.min(offset, total || offset);
                    setSyncProgress(
                        `Membros: ${done}/${total || "?"} grupos · ${batch.message || ""}`
                    );
                    setSyncResult(batch.message);
                }

                setSyncProgress(null);
                setSyncResult(
                    `Pronto: ${total} grupo(s) sincronizado(s) do celular de scan.`
                );
                autoSyncDone.current = true;
                if (syncStorageKey) {
                    try {
                        sessionStorage.setItem(syncStorageKey, String(Date.now()));
                    } catch {
                        /* ignore */
                    }
                }
                setTimeout(() => window.location.reload(), 1800);
            } catch (err: unknown) {
                setSyncProgress(null);
                setSyncResult(err instanceof Error ? err.message : "Erro ao sincronizar.");
            } finally {
                setSyncing(false);
                syncingLock.current = false;
            }
        },
        [candidateProfileId]
    );

    async function handleReconnect() {
        if (!candidateProfileId) return;
        setBusy(true);
        setError(null);
        try {
            await fetchQr();
        } catch (err: unknown) {
            setState("error");
            setError(err instanceof Error ? err.message : "Erro ao gerar QR Code.");
        } finally {
            setBusy(false);
        }
    }

    async function handleStartConnection() {
        if (!candidateProfileId) return;
        setBusy(true);
        setError(null);
        try {
            const hasInstance = Boolean(instanceName || evolutionInstanceName);

            if (!hasInstance) {
                const res = await fetch("/api/whatsapp/evolution/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ candidateId: candidateProfileId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Falha ao criar instância.");

                setInstanceName(data.instanceName);
            }

            await fetchQr();
        } catch (err: unknown) {
            setState("error");
            setError(err instanceof Error ? err.message : "Erro ao iniciar conexão.");
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (!candidateProfileId) return;
        fetchStatus();
    }, [candidateProfileId, fetchStatus]);

    useEffect(() => {
        if (!candidateProfileId || state !== "connecting") return;

        let ticks = 0;
        const interval = setInterval(async () => {
            ticks += 1;
            try {
                const res = await fetch(
                    `/api/whatsapp/evolution/status?candidateId=${candidateProfileId}`
                );
                const data = await res.json();
                if (data.connected) {
                    setState("open");
                    setQrBase64(null);
                    wasConnecting.current = true;
                    return;
                }
                if (ticks % 11 === 0) {
                    await fetchQr();
                }
            } catch {
                // mantém o QR atual
            }
        }, 4000);

        return () => clearInterval(interval);
    }, [candidateProfileId, state, fetchQr]);

    // Ao conectar o QR: sincroniza TODOS os grupos automaticamente (sem opção na UI).
    // Não reexecuta a cada F5 se já sincronizou nesta sessão — use "Atualizar todos".
    useEffect(() => {
        if (state !== "open" || !candidateProfileId) return;
        if (autoSyncDone.current || syncingLock.current) return;

        let already = false;
        if (syncStorageKey) {
            try {
                already = Boolean(sessionStorage.getItem(syncStorageKey));
            } catch {
                already = false;
            }
        }

        // Só auto se veio do fluxo de conexão OU ainda nunca sincronizou nesta sessão
        if (!wasConnecting.current && already) return;

        runFullSync();
    }, [state, candidateProfileId, runFullSync, syncStorageKey]);

    if (!candidateProfileId) {
        const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
        if (!isAdmin) return null;

        return (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-5 max-w-lg w-full text-left">
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-sm">Selecione um candidato primeiro</p>
                        <p className="text-xs mt-1 text-amber-700/90 dark:text-amber-400/90">
                            Como administrador, a conexão Evolution é feita <strong>por candidato</strong>.
                            Vá em <strong>Clientes</strong> → clique em <strong>Ver painel</strong> na
                            Aline (ou outro candidato) — ou acesse{" "}
                            <code className="text-[11px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                                /?viewAs=ID_DO_USUARIO
                            </code>
                            .
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const stateLabel: Record<ConnectionState, string> = {
        loading: "Verificando...",
        not_configured: "Não configurado",
        connecting: "Aguardando leitura do QR",
        open: "Conectado",
        close: "Desconectado",
        error: "Erro",
    };

    const StateIcon =
        state === "open" ? Wifi : state === "connecting" || state === "loading" ? Loader2 : WifiOff;

    return (
        <div
            className={
                compact
                    ? "rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20 p-4"
                    : "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm max-w-lg w-full"
            }
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-green-500" />
                        Conexão Evolution API
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                        Gateway local (Docker :8080) — escaneie o QR no celular
                    </p>
                </div>
                <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        state === "open"
                            ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400"
                            : state === "connecting"
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                >
                    <StateIcon
                        className={`w-3 h-3 ${
                            state === "connecting" || state === "loading" ? "animate-spin" : ""
                        }`}
                    />
                    {stateLabel[state]}
                </span>
            </div>

            {instanceName && (
                <p className="text-[11px] font-mono text-slate-400 mb-3">instância: {instanceName}</p>
            )}

            {state === "open" && (
                <div className="mb-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        WhatsApp vinculado. Todos os grupos do celular de scan entram
                        automaticamente.
                    </div>
                    {syncing && (
                        <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-900/40 rounded-xl px-3 py-2 border border-green-100 dark:border-green-900/40">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />
                            <span>{syncProgress || "Sincronizando grupos…"}</span>
                        </div>
                    )}
                    {syncResult && !syncing && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                            {syncResult}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            autoSyncDone.current = false;
                            if (syncStorageKey) {
                                try {
                                    sessionStorage.removeItem(syncStorageKey);
                                } catch {
                                    /* ignore */
                                }
                            }
                            runFullSync({ force: true });
                        }}
                        disabled={syncing}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-green-500 hover:bg-green-600 text-white transition-all disabled:opacity-60 shadow-sm"
                    >
                        {syncing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        {syncing ? "Sincronizando…" : "Atualizar todos os grupos"}
                    </button>
                    <p className="text-[11px] text-slate-400">
                        Primeiro aparecem todos os grupos; em seguida os membros entram em lotes
                        (paralelo) para reduzir a espera.
                    </p>
                </div>
            )}

            {qrBase64 && (state === "connecting" || state === "close") && (
                <div className="flex flex-col items-center gap-3 mb-4">
                    <img
                        src={qrBase64}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 rounded-xl border border-slate-200"
                    />
                    <p className="text-xs text-slate-500 text-center max-w-xs">
                        WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie o código
                    </p>
                    <button
                        type="button"
                        onClick={fetchQr}
                        className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1"
                    >
                        <QrCode className="w-3.5 h-3.5" />
                        Atualizar QR (expira em ~60s)
                    </button>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {state === "not_configured" && (
                    <Button
                        onClick={handleStartConnection}
                        disabled={busy}
                        className="bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl"
                    >
                        {busy ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Iniciando...
                            </>
                        ) : (
                            "Conectar WhatsApp (Evolution)"
                        )}
                    </Button>
                )}

                {(state === "close" || state === "error") && (
                    <>
                        <Button
                            onClick={handleReconnect}
                            disabled={busy}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl"
                        >
                            {busy ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Gerando QR...
                                </>
                            ) : (
                                <>
                                    <QrCode className="w-4 h-4 mr-2" />
                                    Gerar QR Code
                                </>
                            )}
                        </Button>
                        {state === "error" && (
                            <Button
                                onClick={handleStartConnection}
                                disabled={busy}
                                variant="outline"
                                className="rounded-xl text-sm"
                            >
                                Tentar novamente
                            </Button>
                        )}
                    </>
                )}

                {state === "connecting" && !qrBase64 && (
                    <Button onClick={fetchQr} variant="outline" className="rounded-xl" disabled={busy}>
                        {busy ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Gerando...
                            </>
                        ) : (
                            "Gerar QR Code"
                        )}
                    </Button>
                )}

                {state === "open" && (
                    <Button onClick={handleReconnect} variant="outline" className="rounded-xl text-sm">
                        Reconectar
                    </Button>
                )}
            </div>
        </div>
    );
}

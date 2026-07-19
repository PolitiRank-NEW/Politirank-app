"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    CheckCircle2,
    Download,
    GitMerge,
    Loader2,
    PenLine,
    ScanSearch,
    Star,
    XCircle,
} from "lucide-react";

interface SourcePoster {
    phone: string | null;
    pushName: string | null;
    matchedAt: string;
}

interface SourceByGroup {
    groupId: string;
    groupName: string;
    matched: boolean;
    posters: SourcePoster[];
}

interface SourcePost {
    id: string;
    caption: string;
    postedAt: string;
    pushName?: string | null;
    phone?: string | null;
    isManual?: boolean;
    summary: {
        groupsMatched: number;
        groupsTotal: number;
    };
    byGroup: SourceByGroup[];
}

interface WhatsAppSourceScannerDialogProps {
    open: boolean;
    onClose: () => void;
    candidateId: string;
    onOpenGroup?: (groupId: string) => void;
    canExport?: boolean;
    canCrossReference?: boolean;
}

function formatPhone(phone: string | null | undefined) {
    if (!phone) return "telefone não resolvido";
    if (/^\d{14,}$/.test(phone)) return `LID ${phone}`;
    return phone;
}

export function WhatsAppSourceScannerDialog({
    open,
    onClose,
    candidateId,
    onOpenGroup,
    canExport = true,
    canCrossReference = false,
}: WhatsAppSourceScannerDialogProps) {
    const [posts, setPosts] = useState<SourcePost[]>([]);
    const [sourceGroup, setSourceGroup] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [groupFilter, setGroupFilter] = useState("");
    const [showPending, setShowPending] = useState(false);
    const [crossLoading, setCrossLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState<string | null>(null);
    const [showManual, setShowManual] = useState(false);
    const [manualCaption, setManualCaption] = useState("");
    const [manualSaving, setManualSaving] = useState(false);

    const fetchSource = useCallback(async () => {
        if (!candidateId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/whatsapp/scan/source?candidateId=${candidateId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao carregar Scanner.");
            setPosts(data.posts || []);
            setSourceGroup(data.sourceGroup || null);
            if (data.posts?.[0]?.id) setExpanded(data.posts[0].id);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao carregar Scanner.");
        } finally {
            setLoading(false);
        }
    }, [candidateId]);

    useEffect(() => {
        if (open) {
            setActionMsg(null);
            fetchSource();
        }
    }, [open, fetchSource]);

    function handleExportCsv() {
        window.open(
            `/api/whatsapp/export?mode=scanner&candidateId=${candidateId}`,
            "_blank"
        );
    }

    async function handleCrossReference() {
        setCrossLoading(true);
        setActionMsg(null);
        setError(null);
        try {
            const res = await fetch("/api/whatsapp/cross-reference", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ candidateId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Erro no cruzamento.");
            }
            setActionMsg(data.message || "Cruzamento concluído.");
            setTimeout(() => window.location.reload(), 2000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro no cruzamento.");
        } finally {
            setCrossLoading(false);
        }
    }

    async function handleManualSubmit() {
        const caption = manualCaption.trim();
        if (!caption) {
            setError("Digite a legenda/conteúdo que deve ser procurado.");
            return;
        }
        if (!sourceGroup) {
            setError("Defina um grupo Source antes do input manual.");
            return;
        }
        setManualSaving(true);
        setError(null);
        setActionMsg(null);
        try {
            const res = await fetch("/api/whatsapp/scan/source", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ candidateId, caption }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Falha ao cadastrar.");
            setActionMsg(data.message);
            setManualCaption("");
            setShowManual(false);
            await fetchSource();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao cadastrar.");
        } finally {
            setManualSaving(false);
        }
    }

    const q = groupFilter.trim().toLowerCase();

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-white text-slate-900 border-slate-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <ScanSearch className="w-5 h-5 text-amber-500" />
                        Scanner de conteúdos
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Grupo Source e republicações nos demais grupos (legenda igual, últimas
                        48h). Use input manual se o conteúdo já estava no Source antes da
                        conexão.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2">
                    {canExport && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleExportCsv}
                            className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                        >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Exportar CSV
                        </Button>
                    )}
                    {canCrossReference && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCrossReference}
                            disabled={crossLoading}
                            className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                        >
                            {crossLoading ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <GitMerge className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Cruzar IG/FB
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowManual((v) => !v)}
                        className="border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100"
                    >
                        <PenLine className="w-3.5 h-3.5 mr-1.5" />
                        Input manual
                    </Button>
                </div>

                {showManual && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                        <p className="text-xs text-slate-600">
                            Cole a legenda exata do conteúdo que já está no Source. O Scanner
                            vai procurar a mesma legenda nos outros grupos daqui pra frente.
                        </p>
                        <textarea
                            value={manualCaption}
                            onChange={(e) => setManualCaption(e.target.value)}
                            rows={3}
                            placeholder="Ex.: Teste legenda"
                            className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                        />
                        <div className="flex gap-2 justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setShowManual(false);
                                    setManualCaption("");
                                }}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleManualSubmit}
                                disabled={manualSaving || !manualCaption.trim()}
                                className="bg-amber-500 hover:bg-amber-600 text-white"
                            >
                                {manualSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                ) : null}
                                Cadastrar conteúdo
                            </Button>
                        </div>
                    </div>
                )}

                {actionMsg && (
                    <div className="text-xs text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded">
                        {actionMsg}
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                    {sourceGroup ? (
                        <p className="text-sm text-slate-700 flex items-center gap-1.5 flex-wrap">
                            <Star className="w-4 h-4 text-amber-500 shrink-0" />
                            Source: <strong>{sourceGroup.name}</strong>
                            {onOpenGroup && (
                                <button
                                    type="button"
                                    className="text-indigo-600 text-xs font-semibold underline ml-1"
                                    onClick={() => {
                                        onOpenGroup(sourceGroup.id);
                                        onClose();
                                    }}
                                >
                                    abrir
                                </button>
                            )}
                        </p>
                    ) : (
                        <p className="text-sm text-slate-500">
                            Nenhum Source definido. Abra um grupo e marque como Source.
                        </p>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchSource}
                        disabled={loading}
                        className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                    >
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Atualizar"}
                    </Button>
                </div>

                {error && (
                    <div className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{error}</div>
                )}

                {loading && posts.length === 0 ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : !sourceGroup ? null : posts.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">
                        Ainda não há posts no Source. Publique imagem + legenda nesse grupo.
                    </p>
                ) : (
                    <ul className="space-y-4">
                        {posts.map((post) => {
                            const pendingCount =
                                post.summary.groupsTotal - post.summary.groupsMatched;
                            let groups = showPending
                                ? post.byGroup
                                : post.byGroup.filter((g) => g.matched);
                            if (q) {
                                groups = groups.filter((g) =>
                                    g.groupName.toLowerCase().includes(q)
                                );
                            }
                            return (
                                <li
                                    key={post.id}
                                    className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900 break-words">
                                                “{post.caption}”
                                                {post.isManual && (
                                                    <span className="ml-2 inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">
                                                        Manual
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                {new Date(post.postedAt).toLocaleString("pt-BR")}
                                                {" · "}
                                                <span className="text-emerald-700 font-semibold">
                                                    {post.summary.groupsMatched} bateram
                                                </span>
                                                {" · "}
                                                {pendingCount} pendentes / {post.summary.groupsTotal}{" "}
                                                grupos
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-slate-700"
                                            onClick={() =>
                                                setExpanded((id) =>
                                                    id === post.id ? null : post.id
                                                )
                                            }
                                        >
                                            {expanded === post.id ? "Ocultar" : "Ver grupos"}
                                        </Button>
                                    </div>

                                    {expanded === post.id && (
                                        <div className="space-y-2 border-t border-slate-200 pt-2">
                                            <div className="flex flex-wrap gap-2">
                                                <input
                                                    type="search"
                                                    value={groupFilter}
                                                    onChange={(e) => setGroupFilter(e.target.value)}
                                                    placeholder="Filtrar grupos nesta lista…"
                                                    className="flex-1 min-w-[160px] text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="border-slate-300 text-slate-700"
                                                    onClick={() => setShowPending((v) => !v)}
                                                >
                                                    {showPending
                                                        ? "Só quem bateu"
                                                        : `Ver pendentes (${pendingCount})`}
                                                </Button>
                                            </div>
                                            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                                                {groups.map((g) => (
                                                    <li
                                                        key={g.groupId}
                                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                                                    >
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {g.matched ? (
                                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                            ) : (
                                                                <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                                                            )}
                                                            {onOpenGroup ? (
                                                                <button
                                                                    type="button"
                                                                    className="text-sm font-semibold text-slate-900 hover:underline text-left"
                                                                    onClick={() => {
                                                                        onOpenGroup(g.groupId);
                                                                        onClose();
                                                                    }}
                                                                >
                                                                    {g.groupName}
                                                                </button>
                                                            ) : (
                                                                <span className="text-sm font-semibold text-slate-900">
                                                                    {g.groupName}
                                                                </span>
                                                            )}
                                                            <span
                                                                className={
                                                                    g.matched
                                                                        ? "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700"
                                                                        : "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 text-slate-500"
                                                                }
                                                            >
                                                                {g.matched ? "Bateu" : "Pendente"}
                                                            </span>
                                                        </div>
                                                        {g.posters.map((p, i) => (
                                                            <p
                                                                key={i}
                                                                className="text-[11px] text-slate-500 mt-1 ml-6"
                                                            >
                                                                {formatPhone(p.phone)}
                                                                {p.pushName ? ` · ${p.pushName}` : ""}
                                                                {" · "}
                                                                {new Date(p.matchedAt).toLocaleString(
                                                                    "pt-BR"
                                                                )}
                                                            </p>
                                                        ))}
                                                    </li>
                                                ))}
                                                {groups.length === 0 && (
                                                    <li className="text-slate-500 text-sm py-2">
                                                        {showPending
                                                            ? "Nenhum grupo com esse filtro."
                                                            : "Nenhum grupo bateu ainda."}
                                                    </li>
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}

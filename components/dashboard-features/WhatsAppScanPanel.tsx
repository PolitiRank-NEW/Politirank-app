"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, ScanSearch, Star, XCircle } from "lucide-react";

interface SourcePoster {
    phone: string | null;
    pushName: string | null;
    matchedAt: string;
    captionFound: string;
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
    hasMedia: boolean;
    summary: {
        groupsMatched: number;
        groupsTotal: number;
        uniquePhones: (string | null)[];
    };
    byGroup: SourceByGroup[];
}

interface WhatsAppScanPanelProps {
    candidateId: string;
    groupId: string;
    canEdit: boolean;
    isSourceGroup?: boolean;
    onSourceChanged?: () => void;
}

function formatPhone(phone: string | null | undefined) {
    if (!phone) return "telefone não resolvido";
    // LIDs do WA costumam ter 14+ dígitos sem parecer celular BR
    if (/^\d{14,}$/.test(phone)) return `LID ${phone}`;
    return phone;
}

function GroupMatchRow({ g }: { g: SourceByGroup }) {
    return (
        <li className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
                {g.matched ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                    <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0 break-words">
                    {g.groupName}
                </span>
                <span
                    className={
                        g.matched
                            ? "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }
                >
                    {g.matched ? "Bateu" : "Pendente"}
                </span>
            </div>
            {g.posters.length > 0 && (
                <ul className="mt-1.5 ml-6 space-y-0.5">
                    {g.posters.map((p, i) => (
                        <li key={i} className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatPhone(p.phone)}
                            {p.pushName ? ` · ${p.pushName}` : ""}
                            {" · "}
                            {new Date(p.matchedAt).toLocaleString("pt-BR")}
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}

export function WhatsAppScanPanel({
    candidateId,
    groupId,
    canEdit,
    isSourceGroup = false,
    onSourceChanged,
}: WhatsAppScanPanelProps) {
    const [posts, setPosts] = useState<SourcePost[]>([]);
    const [sourceGroup, setSourceGroup] = useState<{ id: string; name: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [showPending, setShowPending] = useState(false);
    const [listFilter, setListFilter] = useState("");

    const fetchSource = useCallback(async () => {
        if (!candidateId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/whatsapp/scan/source?candidateId=${candidateId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao carregar Scanner Source.");
            setPosts(data.posts || []);
            setSourceGroup(data.sourceGroup || null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao carregar Scanner.");
        } finally {
            setLoading(false);
        }
    }, [candidateId]);

    useEffect(() => {
        fetchSource();
    }, [fetchSource]);

    async function handleSetSource(enable: boolean) {
        setSaving(true);
        setError(null);
        setMsg(null);
        try {
            const res = await fetch(`/api/whatsapp/groups/${groupId}/source`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isSource: enable }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Falha ao definir Source.");
            setMsg(data.message);
            onSourceChanged?.();
            await fetchSource();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao definir Source.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <ScanSearch className="w-4 h-4" />
                    Scanner Source
                    {isSourceGroup && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                            <Star className="w-3 h-3" /> Este é o Source
                        </span>
                    )}
                </h4>
                <Button variant="outline" size="sm" onClick={fetchSource} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Atualizar"}
                </Button>
            </div>

            <p className="text-xs text-slate-500">
                Marque um grupo como <strong>Source</strong>. Posts com{" "}
                <strong>imagem + legenda</strong> viram referência. Nos outros grupos, legenda{" "}
                <strong>igual</strong> registra quem postou (telefone). Janela: 48h.
            </p>

            {canEdit && (
                <div className="flex flex-wrap gap-2">
                    {!isSourceGroup ? (
                        <Button
                            size="sm"
                            onClick={() => handleSetSource(true)}
                            disabled={saving}
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Star className="w-4 h-4 mr-1" />
                            )}
                            Definir este grupo como Source
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetSource(false)}
                            disabled={saving}
                        >
                            Remover Source deste grupo
                        </Button>
                    )}
                </div>
            )}

            {sourceGroup && !isSourceGroup && (
                <p className="text-[11px] text-slate-400">
                    Source atual: <strong>{sourceGroup.name}</strong>
                </p>
            )}

            {error && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded">
                    {error}
                </div>
            )}
            {msg && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1.5 rounded">
                    {msg}
                </div>
            )}

            {loading && posts.length === 0 ? (
                <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
            ) : !sourceGroup ? (
                <p className="text-xs text-slate-400 py-2">
                    Nenhum grupo Source definido. Abra o grupo de origem e clique em “Definir como
                    Source”.
                </p>
            ) : posts.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                    Ainda não há posts no Source. Publique uma imagem com legenda no grupo{" "}
                    <strong>{sourceGroup.name}</strong>.
                </p>
            ) : (
                <ul className="space-y-3">
                    {posts.map((post) => {
                        const isOpen = expanded === post.id;
                        const q = listFilter.trim().toLowerCase();
                        let rows = post.byGroup;
                        if (!showPending) rows = rows.filter((g) => g.matched);
                        if (q) rows = rows.filter((g) => g.groupName.toLowerCase().includes(q));
                        const pendingCount =
                            post.summary.groupsTotal - post.summary.groupsMatched;

                        return (
                            <li
                                key={post.id}
                                className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 space-y-2"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 break-words">
                                            “{post.caption}”
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {new Date(post.postedAt).toLocaleString("pt-BR")}
                                            {post.pushName || post.phone
                                                ? ` · Source: ${post.pushName || post.phone}`
                                                : ""}
                                            {" · "}
                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                                {post.summary.groupsMatched} bateram
                                            </span>
                                            {" · "}
                                            <span className="text-slate-500">
                                                {pendingCount} pendentes
                                            </span>
                                            {" / "}
                                            {post.summary.groupsTotal} grupos
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            setExpanded((id) => (id === post.id ? null : post.id))
                                        }
                                    >
                                        {isOpen ? "Ocultar" : "Ver grupos"}
                                    </Button>
                                </div>

                                {isOpen && (
                                    <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <input
                                                type="search"
                                                value={listFilter}
                                                onChange={(e) => setListFilter(e.target.value)}
                                                placeholder="Filtrar grupos…"
                                                className="flex-1 min-w-[140px] text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="text-xs"
                                                onClick={() => setShowPending((v) => !v)}
                                            >
                                                {showPending
                                                    ? "Só quem bateu"
                                                    : `Ver pendentes (${pendingCount})`}
                                            </Button>
                                        </div>
                                        {rows.length === 0 ? (
                                            <p className="text-xs text-slate-400 py-2">
                                                {showPending
                                                    ? "Nenhum grupo neste filtro."
                                                    : "Nenhum grupo bateu ainda."}
                                            </p>
                                        ) : (
                                            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                                                {rows.map((g) => (
                                                    <GroupMatchRow key={g.groupId} g={g} />
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

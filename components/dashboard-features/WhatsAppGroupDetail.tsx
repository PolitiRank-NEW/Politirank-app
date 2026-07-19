"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Loader2,
    UserPlus,
    Trash2,
    Save,
    Download,
    Upload,
    FileSpreadsheet,
    User,
    CheckCircle2,
    XCircle,
} from "lucide-react";
import Papa from "papaparse";
import {
    formatJoinedAt,
    formatPollVotesDetail,
    getPollVoteEntries,
    type PollVoteEntry,
} from "@/lib/whatsapp-export";
import { parsePollVotesDetail } from "@/lib/whatsapp-csv-import";
import { WhatsAppScanPanel } from "./WhatsAppScanPanel";

interface Member {
    id: string;
    name?: string | null;
    phone?: string | null;
    instagramHandle?: string | null;
    facebookHandle?: string | null;
    pollVotes?: number;
    pollVotesDetail?: unknown;
    igMatched?: boolean;
    igUsername?: string | null;
    igInteractionScore?: number | null;
    fbMatched?: boolean;
    fbUsername?: string | null;
    fbInteractionScore?: number | null;
    joinedAt?: string | null;
    createdAt?: string;
}

interface GroupInfo {
    id: string;
    name: string;
    candidateId?: string;
    liderancaName?: string;
    currentMembers?: number;
    isSource?: boolean;
}

interface WhatsAppGroupDetailProps {
    groupId: string | null;
    open: boolean;
    onClose: () => void;
    userRole?: string;
    readOnly?: boolean;
}

export function WhatsAppGroupDetail({
    groupId,
    open,
    onClose,
    userRole,
    readOnly = false,
}: WhatsAppGroupDetailProps) {
    const [group, setGroup] = useState<GroupInfo | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [newMember, setNewMember] = useState({
        name: "",
        phone: "",
        instagramHandle: "",
        facebookHandle: "",
    });
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isSuperAdmin = userRole === "SUPER_ADMIN";
    const isAdmin = userRole === "ADMIN" || isSuperAdmin;
    const canEdit = !readOnly && (isAdmin || userRole === "LIDER_CHAPA");

    const fetchGroup = useCallback(async () => {
        if (!groupId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/whatsapp/groups/${groupId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao carregar grupo.");
            setGroup({
                id: data.group.id,
                name: data.group.name,
                candidateId: data.group.candidateId,
                liderancaName: data.group.liderancaName || data.group.lideranca?.name,
                currentMembers: data.group.currentMembers,
                isSource: Boolean(data.group.isSource),
            });
            setMembers(data.group.members || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        if (open && groupId) fetchGroup();
    }, [open, groupId, fetchGroup]);

    async function handleAddMember() {
        if (!groupId || !canEdit) return;
        if (!newMember.name && !newMember.phone) {
            setError("Informe pelo menos nome ou telefone.");
            return;
        }
        setAdding(true);
        setError(null);
        try {
            const res = await fetch(`/api/whatsapp/groups/${groupId}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newMember),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao adicionar.");
            setMembers((prev) => [...prev, data.member]);
            setNewMember({ name: "", phone: "", instagramHandle: "", facebookHandle: "" });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setAdding(false);
        }
    }

    async function handleUpdateMember(memberId: string, updates: Partial<Member>) {
        if (!groupId || !canEdit) return;
        setSaving(memberId);
        setError(null);
        try {
            const res = await fetch(`/api/whatsapp/groups/${groupId}/members/${memberId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao salvar.");
            setMembers((prev) =>
                prev.map((m) => (m.id === memberId ? { ...m, ...data.member } : m))
            );
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    }

    async function handleDeleteMember(memberId: string) {
        if (!groupId || !isAdmin) return;
        if (!confirm("Remover esta pessoa da lista?")) return;
        setSaving(memberId);
        try {
            const res = await fetch(`/api/whatsapp/groups/${groupId}/members/${memberId}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao remover.");
            setMembers((prev) => prev.filter((m) => m.id !== memberId));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    }

    function handleExportGroup() {
        if (!groupId) return;
        window.open(`/api/whatsapp/export?groupId=${groupId}`, "_blank");
    }

    function handleDownloadTemplate() {
        if (!groupId) return;
        window.open(`/api/whatsapp/groups/${groupId}/members/import`, "_blank");
    }

    function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !groupId || !canEdit) return;

        setImportResult(null);
        setError(null);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as Record<string, unknown>[];
                if (rows.length === 0) {
                    setError("O CSV está vazio ou sem linhas válidas.");
                    return;
                }

                const confirmImport = window.confirm(
                    `Importar ${rows.length} linha(s) para o grupo "${group?.name || ""}"?\n\nDuplicados (mesmo telefone ou nome) serão ignorados.\nUse "Exportar CSV" e reimporte com a coluna Grupo preenchida para atualizar registros existentes.`
                );
                if (!confirmImport) return;

                setImporting(true);
                try {
                    const res = await fetch(`/api/whatsapp/groups/${groupId}/members/import`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ rows, skipDuplicates: true }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Erro na importação.");

                    setImportResult(data.message || `${data.created} pessoas importadas.`);
                    await fetchGroup();
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Erro na importação.";
                    setError(message);
                } finally {
                    setImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                }
            },
            error: (parseError: Error) => {
                setError(`Erro ao ler CSV: ${parseError.message}`);
                if (fileInputRef.current) fileInputRef.current.value = "";
            },
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-6xl w-[min(96vw,72rem)] max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
                        {group?.name || "Detalhes do Grupo"}
                    </DialogTitle>
                    <DialogDescription>
                        {group?.liderancaName && (
                            <span className="text-slate-500">
                                Liderança: <strong>{group.liderancaName}</strong>
                                {group.currentMembers !== undefined && (
                                    <span className="ml-2">• {members.length} pessoas cadastradas</span>
                                )}
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap gap-2 justify-end">
                            {canEdit && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleDownloadTemplate}
                                        className="gap-1.5"
                                    >
                                        <FileSpreadsheet className="w-4 h-4" />
                                        Modelo CSV
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={importing}
                                        className="gap-1.5"
                                    >
                                        {importing ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Upload className="w-4 h-4" />
                                        )}
                                        Importar CSV
                                    </Button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv,text/csv"
                                        className="hidden"
                                        onChange={handleImportFileChange}
                                    />
                                </>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportGroup}
                                className="gap-1.5"
                            >
                                <Download className="w-4 h-4" />
                                Exportar CSV
                            </Button>
                        </div>

                        {importResult && (
                            <div className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-lg px-3 py-2">
                                {importResult}
                            </div>
                        )}

                        {group?.candidateId && groupId && (
                            <WhatsAppScanPanel
                                candidateId={group.candidateId}
                                groupId={groupId}
                                canEdit={canEdit}
                                isSourceGroup={Boolean(group.isSource)}
                                onSourceChanged={fetchGroup}
                            />
                        )}

                        {canEdit && (
                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <UserPlus className="w-4 h-4" />
                                    Adicionar pessoa
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                    <Input
                                        placeholder="Nome"
                                        value={newMember.name}
                                        onChange={(e) =>
                                            setNewMember((p) => ({ ...p, name: e.target.value }))
                                        }
                                    />
                                    <Input
                                        placeholder="Telefone"
                                        value={newMember.phone}
                                        onChange={(e) =>
                                            setNewMember((p) => ({ ...p, phone: e.target.value }))
                                        }
                                    />
                                    <Input
                                        placeholder="@ Instagram"
                                        value={newMember.instagramHandle}
                                        onChange={(e) =>
                                            setNewMember((p) => ({
                                                ...p,
                                                instagramHandle: e.target.value,
                                            }))
                                        }
                                    />
                                    <Input
                                        placeholder="@ Facebook"
                                        value={newMember.facebookHandle}
                                        onChange={(e) =>
                                            setNewMember((p) => ({
                                                ...p,
                                                facebookHandle: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                    Ou importe várias pessoas com CSV (Telefone, Nome, Data de Entrada,
                                    Votos/Histórico Enquetes, Instagram, Facebook).
                                </p>
                                <Button
                                    size="sm"
                                    onClick={handleAddMember}
                                    disabled={adding}
                                    className="gap-1.5"
                                >
                                    {adding ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="w-4 h-4" />
                                    )}
                                    Adicionar
                                </Button>
                            </div>
                        )}

                        {members.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                                Nenhuma pessoa cadastrada neste grupo ainda.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                <table className="w-full min-w-[960px] text-sm table-fixed">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                                        <tr>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[160px]">
                                                Telefone
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[160px]">
                                                Nome
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[88px]">
                                                Entrada
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[140px]">
                                                Instagram
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[100px]">
                                                Interações IG
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[140px]">
                                                Facebook
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 w-[100px]">
                                                Interações FB
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400 min-w-[200px]">
                                                Enquetes
                                            </th>
                                            {isAdmin && (
                                                <th className="p-3 font-bold text-slate-600 dark:text-slate-400 w-16">
                                                    Ações
                                                </th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {members.map((m) => (
                                            <MemberRow
                                                key={m.id}
                                                member={m}
                                                groupName={group?.name || ""}
                                                canEdit={canEdit}
                                                isSuperAdmin={isSuperAdmin}
                                                isAdmin={isAdmin}
                                                saving={saving === m.id}
                                                onSave={handleUpdateMember}
                                                onDelete={handleDeleteMember}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function MemberRow({
    member,
    groupName,
    canEdit,
    isSuperAdmin,
    isAdmin,
    saving,
    onSave,
    onDelete,
}: {
    member: Member;
    groupName: string;
    canEdit: boolean;
    isSuperAdmin: boolean;
    isAdmin: boolean;
    saving: boolean;
    onSave: (id: string, updates: Partial<Member>) => void;
    onDelete: (id: string) => void;
}) {
    const [draft, setDraft] = useState({
        name: member.name || "",
        phone: member.phone || "",
        instagramHandle: member.instagramHandle || "",
        facebookHandle: member.facebookHandle || "",
        pollVotes: member.pollVotes ?? 0,
        pollHistory: formatPollVotesDetail(member.pollVotesDetail),
    });

    useEffect(() => {
        setDraft({
            name: member.name || "",
            phone: member.phone || "",
            instagramHandle: member.instagramHandle || "",
            facebookHandle: member.facebookHandle || "",
            pollVotes: member.pollVotes ?? 0,
            pollHistory: formatPollVotesDetail(member.pollVotesDetail),
        });
    }, [member]);

    const memberPollHistory = formatPollVotesDetail(member.pollVotesDetail);
    const changed =
        draft.name !== (member.name || "") ||
        draft.phone !== (member.phone || "") ||
        draft.instagramHandle !== (member.instagramHandle || "") ||
        draft.facebookHandle !== (member.facebookHandle || "") ||
        (isSuperAdmin &&
            (draft.pollVotes !== (member.pollVotes ?? 0) ||
                draft.pollHistory !== memberPollHistory));

    if (!canEdit) {
        const entrada = formatJoinedAt({
            joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
            createdAt: member.createdAt ? new Date(member.createdAt) : undefined,
        });
        return (
            <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                <td className="p-3 font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                    {member.phone || "—"}
                </td>
                <td className="p-3">
                    <span className="flex items-center gap-1.5 font-medium break-words">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="min-w-0 break-words">{member.name || "—"}</span>
                    </span>
                </td>
                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{entrada || "—"}</td>
                <td className="p-3 break-all">
                    {member.instagramHandle ? `@${member.instagramHandle}` : "—"}
                </td>
                <td className="p-3">
                    <SocialMatchBadge
                        matched={member.igMatched}
                        username={member.igUsername || member.instagramHandle}
                        score={member.igInteractionScore}
                    />
                </td>
                <td className="p-3 break-all">
                    {member.facebookHandle ? `@${member.facebookHandle}` : "—"}
                </td>
                <td className="p-3">
                    <SocialMatchBadge
                        matched={member.fbMatched}
                        username={member.fbUsername || member.facebookHandle}
                        score={member.fbInteractionScore}
                    />
                </td>
                <td className="p-3 align-top">
                    <PollVotesDisplay
                        detail={member.pollVotesDetail}
                        count={member.pollVotes ?? 0}
                    />
                </td>
            </tr>
        );
    }

    return (
        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
            <td className="p-2 align-top">
                <Input
                    className="h-8 text-sm font-mono w-full min-w-0"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="Telefone"
                />
            </td>
            <td className="p-2 align-top">
                <Input
                    className="h-8 text-sm w-full min-w-0"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Nome"
                />
            </td>
            <td className="p-2 text-xs text-slate-500 whitespace-nowrap align-top">
                {formatJoinedAt({
                    joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
                    createdAt: member.createdAt ? new Date(member.createdAt) : undefined,
                }) || "—"}
            </td>
            <td className="p-2 align-top">
                <Input
                    className="h-8 text-sm w-full min-w-0"
                    value={draft.instagramHandle}
                    onChange={(e) =>
                        setDraft((d) => ({ ...d, instagramHandle: e.target.value }))
                    }
                    placeholder="@instagram"
                />
            </td>
            <td className="p-2 align-top">
                <SocialMatchBadge
                    matched={member.igMatched}
                    username={member.igUsername || member.instagramHandle}
                    score={member.igInteractionScore}
                />
            </td>
            <td className="p-2 align-top">
                <Input
                    className="h-8 text-sm w-full min-w-0"
                    value={draft.facebookHandle}
                    onChange={(e) =>
                        setDraft((d) => ({ ...d, facebookHandle: e.target.value }))
                    }
                    placeholder="@facebook"
                />
            </td>
            <td className="p-2 align-top">
                <SocialMatchBadge
                    matched={member.fbMatched}
                    username={member.fbUsername || member.facebookHandle}
                    score={member.fbInteractionScore}
                />
            </td>
            <td className="p-2 align-top min-w-[200px]">
                {isSuperAdmin ? (
                    <div className="space-y-2">
                        <Input
                            className="h-8 text-sm w-16"
                            type="number"
                            min={0}
                            value={draft.pollVotes}
                            onChange={(e) =>
                                setDraft((d) => ({
                                    ...d,
                                    pollVotes: parseInt(e.target.value, 10) || 0,
                                }))
                            }
                        />
                        <Input
                            className="h-auto min-h-8 text-xs py-1.5"
                            value={draft.pollHistory}
                            onChange={(e) =>
                                setDraft((d) => ({ ...d, pollHistory: e.target.value }))
                            }
                            placeholder="Enquete → Opção"
                            title='Ex: Enquete 1 → Sim | Enquete 2 → Não'
                        />
                        <PollVotesDisplay
                            detail={member.pollVotesDetail}
                            count={member.pollVotes ?? 0}
                            compact
                        />
                    </div>
                ) : (
                    <PollVotesDisplay
                        detail={member.pollVotesDetail}
                        count={member.pollVotes ?? 0}
                    />
                )}
            </td>
            {isAdmin && (
                <td className="p-2">
                    <div className="flex items-center gap-1">
                        {changed && (
                            <button
                                onClick={() => {
                                    const pollVotesDetail = isSuperAdmin
                                        ? parsePollVotesDetail(draft.pollHistory)
                                        : undefined;
                                    onSave(member.id, {
                                        name: draft.name,
                                        phone: draft.phone,
                                        instagramHandle: draft.instagramHandle,
                                        facebookHandle: draft.facebookHandle,
                                        ...(isSuperAdmin
                                            ? {
                                                  pollVotes: draft.pollVotes,
                                                  pollVotesDetail: pollVotesDetail || [],
                                              }
                                            : {}),
                                    });
                                }}
                                disabled={saving}
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                title="Salvar"
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => onDelete(member.id)}
                            disabled={saving}
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Remover"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </td>
            )}
        </tr>
    );
}

function PollVotesDisplay({
    detail,
    count = 0,
    compact = false,
}: {
    detail: unknown;
    count?: number;
    compact?: boolean;
}) {
    const entries = getPollVoteEntries(detail);

    if (entries.length === 0 && count === 0) {
        return <span className="text-xs text-slate-400">—</span>;
    }

    return (
        <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"} min-w-[160px] max-w-[min(100%,320px)]`}>
            {count > 0 && entries.length === 0 && (
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {count} {count === 1 ? "voto" : "votos"}
                </span>
            )}
            {entries.map((entry, index) => (
                <PollVoteCard key={entry.pollId || `${entry.pollTitle}-${index}`} entry={entry} />
            ))}
        </div>
    );
}

function PollVoteCard({ entry }: { entry: PollVoteEntry }) {
    const title = entry.pollTitle?.trim() || "Enquete";
    const option = entry.option?.trim() || "?";

    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-2 text-xs leading-snug">
            <p className="font-medium text-slate-700 dark:text-slate-200 whitespace-normal break-words">
                {title}
            </p>
            <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-normal break-words">
                → {option}
            </p>
        </div>
    );
}

function SocialMatchBadge({
    matched,
    username,
    score,
}: {
    matched?: boolean;
    username?: string | null;
    score?: number | null;
}) {
    if (!matched) {
        return (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <XCircle className="w-3.5 h-3.5" />
                Não
            </span>
        );
    }
    return (
        <span className="inline-flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                @{username}
            </span>
            {score !== null && score !== undefined && (
                <span className="text-[10px] text-slate-400">Score: {score}</span>
            )}
        </span>
    );
}

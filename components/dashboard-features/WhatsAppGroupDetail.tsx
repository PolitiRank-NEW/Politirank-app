"use client";

import { useCallback, useEffect, useState } from "react";
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
    User,
    CheckCircle2,
    XCircle,
} from "lucide-react";

interface Member {
    id: string;
    name?: string | null;
    phone?: string | null;
    instagramHandle?: string | null;
    facebookHandle?: string | null;
    pollVotes?: number;
    igMatched?: boolean;
    igUsername?: string | null;
    igInteractionScore?: number | null;
}

interface GroupInfo {
    id: string;
    name: string;
    liderancaName?: string;
    currentMembers?: number;
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
                liderancaName: data.group.liderancaName || data.group.lideranca?.name,
                currentMembers: data.group.currentMembers,
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

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950">
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
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                                        <tr>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400">
                                                Nome
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400">
                                                Telefone
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400">
                                                Instagram
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400">
                                                Facebook
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400">
                                                Votos Enquete
                                            </th>
                                            <th className="text-left p-3 font-bold text-slate-600 dark:text-slate-400">
                                                IG Cruzado
                                            </th>
                                            {isAdmin && (
                                                <th className="p-3 font-bold text-slate-600 dark:text-slate-400 w-20">
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
    });

    useEffect(() => {
        setDraft({
            name: member.name || "",
            phone: member.phone || "",
            instagramHandle: member.instagramHandle || "",
            facebookHandle: member.facebookHandle || "",
            pollVotes: member.pollVotes ?? 0,
        });
    }, [member]);

    const changed =
        draft.name !== (member.name || "") ||
        draft.phone !== (member.phone || "") ||
        draft.instagramHandle !== (member.instagramHandle || "") ||
        draft.facebookHandle !== (member.facebookHandle || "") ||
        (isSuperAdmin && draft.pollVotes !== (member.pollVotes ?? 0));

    if (!canEdit) {
        return (
            <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                <td className="p-3">
                    <span className="flex items-center gap-1.5 font-medium">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {member.name || "—"}
                    </span>
                </td>
                <td className="p-3">{member.phone || "—"}</td>
                <td className="p-3">
                    {member.instagramHandle ? `@${member.instagramHandle}` : "—"}
                </td>
                <td className="p-3">
                    {member.facebookHandle ? `@${member.facebookHandle}` : "—"}
                </td>
                <td className="p-3">{member.pollVotes ?? 0}</td>
                <td className="p-3">
                    <IgMatchBadge
                        matched={member.igMatched}
                        username={member.igUsername}
                        score={member.igInteractionScore}
                    />
                </td>
            </tr>
        );
    }

    return (
        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
            <td className="p-2">
                <Input
                    className="h-8 text-sm"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Nome"
                />
            </td>
            <td className="p-2">
                <Input
                    className="h-8 text-sm"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="Telefone"
                />
            </td>
            <td className="p-2">
                <Input
                    className="h-8 text-sm"
                    value={draft.instagramHandle}
                    onChange={(e) =>
                        setDraft((d) => ({ ...d, instagramHandle: e.target.value }))
                    }
                    placeholder="@ig"
                />
            </td>
            <td className="p-2">
                <Input
                    className="h-8 text-sm"
                    value={draft.facebookHandle}
                    onChange={(e) =>
                        setDraft((d) => ({ ...d, facebookHandle: e.target.value }))
                    }
                    placeholder="@fb"
                />
            </td>
            <td className="p-2">
                {isSuperAdmin ? (
                    <Input
                        className="h-8 text-sm w-20"
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
                ) : (
                    <span className="text-slate-500 pl-2">{member.pollVotes ?? 0}</span>
                )}
            </td>
            <td className="p-2">
                <IgMatchBadge
                    matched={member.igMatched}
                    username={member.igUsername}
                    score={member.igInteractionScore}
                />
            </td>
            {isAdmin && (
                <td className="p-2">
                    <div className="flex items-center gap-1">
                        {changed && (
                            <button
                                onClick={() =>
                                    onSave(member.id, {
                                        name: draft.name,
                                        phone: draft.phone,
                                        instagramHandle: draft.instagramHandle,
                                        facebookHandle: draft.facebookHandle,
                                        ...(isSuperAdmin ? { pollVotes: draft.pollVotes } : {}),
                                    })
                                }
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

function IgMatchBadge({
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

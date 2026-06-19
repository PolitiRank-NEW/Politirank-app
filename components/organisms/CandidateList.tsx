"use client";

import { useState } from "react";
import { AddCandidateModal } from "@/components/molecules/AddCandidateModal";
import { EditCandidateModal } from "@/components/molecules/EditCandidateModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Instagram, Facebook, Ticket, PenSquare, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Helper to safely get social handle
const getHandle = (user: any, platform: string) => {
    if (!user.candidateProfile?.socialProfiles) return null;
    return user.candidateProfile.socialProfiles.find((p: any) => p.platform === platform)?.handle;
};

export function CandidateList({ candidates }: { candidates: any[] }) {
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [editingCandidate, setEditingCandidate] = useState<any | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const handleEdit = (candidate: any) => {
        setEditingCandidate(candidate);
    };

    const filteredCandidates = candidates.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Helper for initials
    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Gerenciamento de Equipe</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Gerencie os {candidates.length} membros da sua chapa e acompanhe o desempenho.
                    </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <Input
                            placeholder="Buscar membro..."
                            className="pl-9 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        onClick={() => setAddModalOpen(true)}
                        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm shadow-blue-500/20"
                    >
                        <Plus className="h-4 w-4" />
                        Novo Membro
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50/80 dark:bg-gray-800/80">
                        <TableRow className="hover:bg-transparent border-b border-gray-200 dark:border-gray-800">
                            <TableHead className="w-[80px] font-semibold text-gray-700 dark:text-gray-300 pl-6">#</TableHead>
                            <TableHead className="w-[300px] font-semibold text-gray-700 dark:text-gray-300">Candidato</TableHead>
                            <TableHead className="font-semibold text-gray-700 dark:text-gray-300">Canais Conectados</TableHead>
                            <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300">PolitiScore</TableHead>
                            <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300 pr-6">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredCandidates.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-gray-500">
                                    Nenhum membro encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredCandidates.map((person, index) => (
                                <TableRow key={person.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/60 transition-colors border-gray-100 dark:border-gray-800">
                                    <TableCell className="font-medium text-gray-500 dark:text-gray-400 pl-6">
                                        {(index + 1).toString().padStart(2, '0')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                                                {getInitials(person.name)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-900 dark:text-gray-100">{person.name || "Sem Nome"}</span>
                                                <span className="text-xs text-gray-500">{person.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            {/* Instagram Icon */}
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <div className={`p-2 rounded-lg border transition-all ${getHandle(person, 'INSTAGRAM')
                                                            ? 'bg-pink-50 border-pink-100 text-pink-600 dark:bg-pink-900/20 dark:border-pink-900/30 dark:text-pink-400'
                                                            : 'bg-gray-50 border-gray-100 text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-600 grayscale'}`}>
                                                            <Instagram className="w-4 h-4" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{getHandle(person, 'INSTAGRAM') || "Não conectado"}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>

                                            {/* Facebook Icon */}
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <div className={`p-2 rounded-lg border transition-all ${getHandle(person, 'FACEBOOK')
                                                            ? 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-400'
                                                            : 'bg-gray-50 border-gray-100 text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-600 grayscale'}`}>
                                                            <Facebook className="w-4 h-4" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{getHandle(person, 'FACEBOOK') || "Não conectado"}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>

                                            {/* TikTok Icon */}
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <div className={`p-2 rounded-lg border transition-all ${getHandle(person, 'TIKTOK')
                                                            ? 'bg-gray-100 border-gray-200 text-black dark:bg-white/10 dark:border-white/20 dark:text-white'
                                                            : 'bg-gray-50 border-gray-100 text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-600 grayscale'}`}>
                                                            <Ticket className="w-4 h-4" />
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{getHandle(person, 'TIKTOK') || "Não conectado"}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${(person.candidateProfile?.politiScore || 0) >= 80 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900' :
                                            (person.candidateProfile?.politiScore || 0) >= 50 ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900' :
                                                'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                                            }`}>
                                            {person.candidateProfile?.politiScore || 0} pts
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEdit(person)}
                                                        className="h-8 w-8 p-0 hover:bg-blue-50 text-blue-600 cursor-pointer"
                                                    >
                                                        <PenSquare className="h-4 w-4" />
                                                        <span className="sr-only">Editar</span>
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Editar Candidato</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AddCandidateModal isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} />
            {/* Edit Modal */}
            {editingCandidate && (
                <EditCandidateModal
                    isOpen={!!editingCandidate}
                    onClose={() => setEditingCandidate(null)}
                    candidate={editingCandidate}
                />
            )}
        </div>
    );
}

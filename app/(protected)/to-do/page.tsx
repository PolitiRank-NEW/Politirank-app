'use client';

import { useState, useEffect } from 'react';
import { getCandidatesForDataEntry, bulkUpdateCandidates, deleteCandidate } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import Papa from 'papaparse';
import Swal from 'sweetalert2';
import { Instagram, Facebook, Ticket, Upload, Save, Search, FileDown, Trash2, Pencil } from 'lucide-react';
// import { updateCandidate } from '@/app/lib/actions'; 

export default function DataEntryPage() {
    const [candidates, setCandidates] = useState<any[]>([]);
    const [filteredCandidates, setFilteredCandidates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    // Edit Form State - Expanded for all metrics
    const [editForm, setEditForm] = useState<any>({
        bio: '',
        instagram: '',
        facebook: '',
        tiktok: '',
        notes: '',
        instagramFollowers: '',
        instagramMentions: '',
        instagramComments: '',
        facebookFollowers: '',
        facebookMentions: '',
        facebookComments: '',
        tiktokFollowers: '',
        tiktokMentions: '',
        tiktokComments: '',
        whatsappMessages: ''
    });

    useEffect(() => {
        loadCandidates();
    }, []);

    useEffect(() => {
        const filtered = candidates.filter(c =>
            c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.email?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredCandidates(filtered);
    }, [searchTerm, candidates]);

    async function loadCandidates() {
        setLoading(true);
        const data = await getCandidatesForDataEntry();
        setCandidates(data);
        setFilteredCandidates(data);
        setLoading(false);
    }

    const getSocialHandle = (candidate: any, platform: string) => {
        return candidate.candidateProfile?.socialProfiles?.find((p: any) => p.platform === platform)?.handle || '';
    };

    const handleEditClick = (candidate: any) => {
        setSelectedCandidate(candidate);
        const p = candidate.candidateProfile || {};

        setEditForm({
            bio: p.bio || '',
            instagram: getSocialHandle(candidate, 'INSTAGRAM'),
            facebook: getSocialHandle(candidate, 'FACEBOOK'),
            tiktok: getSocialHandle(candidate, 'TIKTOK'),
            notes: p.notes || '',
            instagramFollowers: p.instagramFollowers || '',
            instagramMentions: p.instagramMentions || '',
            instagramComments: p.instagramComments || '',
            facebookFollowers: p.facebookFollowers || '',
            facebookMentions: p.facebookMentions || '',
            facebookComments: p.facebookComments || '',
            tiktokFollowers: p.tiktokFollowers || '',
            tiktokMentions: p.tiktokMentions || '',
            tiktokComments: p.tiktokComments || '',
            whatsappMessages: p.whatsappMessages || ''
        });
        setIsEditOpen(true);
    };

    const handleManualSave = async () => {
        const updateData = [{
            email: selectedCandidate.email,
            ...editForm
        }];

        try {
            const result = await bulkUpdateCandidates(updateData);
            if (result.success) {
                Swal.fire('Sucesso', 'Dados atualizados com sucesso!', 'success');
                setIsEditOpen(false);
                loadCandidates();
            } else {
                Swal.fire('Erro', 'Falha ao atualizar dados.', 'error');
            }
        } catch (e) {
            Swal.fire('Erro', 'Erro inesperado.', 'error');
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const result = await Swal.fire({
                    title: 'Confirmar Importação',
                    text: `Deseja importar ${results.data.length} registros?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sim, importar',
                    cancelButtonText: 'Cancelar'
                });

                if (result.isConfirmed) {
                    Swal.fire({ title: 'Processando...', didOpen: () => Swal.showLoading() });
                    const response = await bulkUpdateCandidates(results.data);

                    if (response.success) {
                        Swal.fire('Sucesso', `${response.count} candidatos atualizados!`, 'success');
                        loadCandidates();
                    } else {
                        Swal.fire('Erro', response.message as string, 'error');
                    }
                }
            },
            error: (error: Error) => {
                Swal.fire('Erro no CSV', error.message, 'error');
            }
        });
    };

    const handleDelete = async (candidate: any) => {
        const result = await Swal.fire({
            title: 'Tem certeza?',
            text: `Você vai excluir ${candidate.name || candidate.email}. Essa ação não pode ser desfeita.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, excluir',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            const response = await deleteCandidate(candidate.id);
            if (response.success) {
                Swal.fire('Excluído!', 'O candidato foi removido.', 'success');
                loadCandidates();
            } else {
                Swal.fire('Erro', response.message as string, 'error');
            }
        }
    };

    const downloadTemplate = () => {
        // Expanded CSV Header
        const headers = [
            'name', 'email', 'bio', 'notes',
            'instagram', 'facebook', 'tiktok',
            'instagramFollowers', 'instagramMentions', 'instagramComments',
            'facebookFollowers', 'facebookMentions', 'facebookComments',
            'tiktokFollowers', 'tiktokMentions', 'tiktokComments',
            'whatsappMessages'
        ];
        const example = [
            '"Nome do Candidato"', 'user@exemplo.com', '"Bio Exemplo"', '"Notas internas"',
            '@insta', 'fb_id', '@tiktok',
            '1000', '50', '20',
            '500', '10', '5',
            '2000', '100', '50',
            '5'
        ];

        const csv = headers.join(',') + '\n' + example.join(',');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modelo_completo_candidatos.csv';
        a.click();
    };

    // Helper for input styling
    const inputClass = "bg-white border-gray-300 text-gray-900 focus:border-blue-500";
    const labelClass = "text-sm font-medium text-gray-700";

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Entrada de Dados - Mechanical Turk</h1>
                    <p className="text-gray-500">Enriquecimento manual e em massa de dados de candidatos (Perfil + Métricas).</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={downloadTemplate}>
                        <FileDown className="mr-2 h-4 w-4" />
                        Modelo CSV Completo
                    </Button>
                    <div className="relative">
                        <input
                            type="file"
                            accept=".csv"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileUpload}
                        />
                        <Button>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload CSV
                        </Button>
                    </div>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl font-semibold text-gray-900">Candidatos Pendentes</CardTitle>
                    <CardDescription className="text-gray-500">
                        Liste e edite os dados completos dos candidatos.
                    </CardDescription>
                    <div className="pt-4">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome ou email..."
                                className="pl-8 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-gray-700 font-medium">Nome</TableHead>
                                    <TableHead className="text-gray-700 font-medium">Email</TableHead>
                                    <TableHead className="text-gray-700 font-medium">Status Bio</TableHead>
                                    <TableHead className="text-gray-700 font-medium">Métricas (Ex: Insta)</TableHead>
                                    <TableHead className="text-right text-gray-700 font-medium">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
                                    </TableRow>
                                ) : filteredCandidates.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">Nenhum candidato encontrado.</TableCell>
                                    </TableRow>
                                ) : (
                                    filteredCandidates.map((candidate) => (
                                        <TableRow key={candidate.id} className="hover:bg-gray-50">
                                            <TableCell className="font-medium text-gray-900">{candidate.name}</TableCell>
                                            <TableCell className="text-gray-600">{candidate.email}</TableCell>
                                            <TableCell>
                                                {candidate.candidateProfile?.bio ? (
                                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Preenchida</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-gray-500">Pendente</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-gray-600">
                                                {candidate.candidateProfile?.instagramFollowers || 0} Seg.
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(candidate)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(candidate)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[800px] bg-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-gray-900">Editar Dados Completos</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                        {/* Column 1: Basic Info */}
                        <div className="space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Dados Cadastrais</h3>
                            <div className="space-y-2">
                                <label className={labelClass}>Bio</label>
                                <Textarea
                                    value={editForm.bio}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, bio: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Instagram User</label>
                                <Input
                                    value={editForm.instagram}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, instagram: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>Facebook ID/Link</label>
                                <Input
                                    value={editForm.facebook}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, facebook: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={labelClass}>TikTok User</label>
                                <Input
                                    value={editForm.tiktok}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, tiktok: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        {/* Column 2: Metrics */}
                        <div className="space-y-4">
                            <h3 className="font-semibold text-gray-900 border-b pb-2">Métricas Sociais</h3>

                            {/* Instagram Metrics */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Insta Seg.</label>
                                    <Input type="number" value={editForm.instagramFollowers} onChange={(e) => setEditForm({ ...editForm, instagramFollowers: e.target.value })} className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Insta Menções</label>
                                    <Input type="number" value={editForm.instagramMentions} onChange={(e) => setEditForm({ ...editForm, instagramMentions: e.target.value })} className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Insta Coment.</label>
                                    <Input type="number" value={editForm.instagramComments} onChange={(e) => setEditForm({ ...editForm, instagramComments: e.target.value })} className={inputClass} />
                                </div>
                            </div>

                            {/* Facebook Metrics */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Face Seg.</label>
                                    <Input type="number" value={editForm.facebookFollowers} onChange={(e) => setEditForm({ ...editForm, facebookFollowers: e.target.value })} className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Face Menções</label>
                                    <Input type="number" value={editForm.facebookMentions} onChange={(e) => setEditForm({ ...editForm, facebookMentions: e.target.value })} className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Face Coment.</label>
                                    <Input type="number" value={editForm.facebookComments} onChange={(e) => setEditForm({ ...editForm, facebookComments: e.target.value })} className={inputClass} />
                                </div>
                            </div>

                            {/* TikTok Metrics */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">TikTok Seg.</label>
                                    <Input type="number" value={editForm.tiktokFollowers} onChange={(e) => setEditForm({ ...editForm, tiktokFollowers: e.target.value })} className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">TikTok Menções</label>
                                    <Input type="number" value={editForm.tiktokMentions} onChange={(e) => setEditForm({ ...editForm, tiktokMentions: e.target.value })} className={inputClass} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">TikTok Coment.</label>
                                    <Input type="number" value={editForm.tiktokComments} onChange={(e) => setEditForm({ ...editForm, tiktokComments: e.target.value })} className={inputClass} />
                                </div>
                            </div>

                            {/* WhatsApp */}
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500">Msgs WhatsApp</label>
                                <Input type="number" value={editForm.whatsappMessages} onChange={(e) => setEditForm({ ...editForm, whatsappMessages: e.target.value })} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 border-t pt-4">
                        <label className={labelClass}>Notas Internas</label>
                        <Textarea
                            value={editForm.notes}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, notes: e.target.value })}
                            className={inputClass}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)} className="text-gray-700">Cancelar</Button>
                        <Button onClick={handleManualSave} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Save className="mr-2 h-4 w-4" /> Salvar Tudo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

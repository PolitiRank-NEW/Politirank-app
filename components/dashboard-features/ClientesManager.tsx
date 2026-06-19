'use client';

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, User, Building, ExternalLink, Settings2, MoreVertical, Database, X, Save, Eye, Edit2, Trash2, Mail, Layers, MessageCircle, Instagram } from "lucide-react";

interface ClientesManagerProps {
    allUsers?: any[];
    userRole?: string;
}

export function ClientesManager({ allUsers = [], userRole = 'CANDIDATO' }: ClientesManagerProps) {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const router = useRouter();
    const searchParams = useSearchParams();
    const [turkUser, setTurkUser] = useState<any | null>(null);
    const [turkForm, setTurkForm] = useState({ 
        platform: 'INSTAGRAM', 
        turkMode: 'GERAL', // 'GERAL' | 'BULK' | 'MANUAL'
        bulkJson: '',
        manualPostUrl: '', manualPostType: 'IMAGE', manualPostCaption: '', manualPostLikes: '', manualPostCommentsCount: '',
        manualCommenter: '', manualCommentText: '',
        followers: '', postsCount: '', engagement: '', likes: '', comments: '',
        whatsappLevel: 'CANDIDATE',
        selectedLiderancaId: '', newLiderancaName: '',
        selectedGrupoId: '', newGrupoName: '',
        entryCount: '', exitCount: '', currentMembers: '', duplicateMembers: '',
        whatsappHandle: '', instagramHandle: '', phone: '',
        groupLeaderName: '', description: '', inviteLink: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [turkPostQueue, setTurkPostQueue] = useState<any[]>([]);
    
    // Estados do Modal da Estrutura
    const [structureUser, setStructureUser] = useState<any | null>(null);
    const [structureForm, setStructureForm] = useState({ 
        view: 'LIDERANCA', 
        liderancaName: '', whatsappHandle: '', instagramHandle: '', phone: '',
        selectedLiderancaId: '', groupName: '', inviteLink: '', groupLeaderName: ''
    });
    const [isCreatingStructure, setIsCreatingStructure] = useState(false);
    const [editingLiderancaId, setEditingLiderancaId] = useState<string | null>(null);
    const [editingGrupoId, setEditingGrupoId] = useState<string | null>(null);
    
    const [liderancasOptions, setLiderancasOptions] = useState<any[]>([]);
    const [gruposOptions, setGruposOptions] = useState<any[]>([]);

    // Estados do CRUD de Usuários (Clientes)
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [userForm, setUserForm] = useState({
        name: '', email: '', password: '', role: 'CANDIDATO', 
        partyId: '', 
        slateId: '', 
        whatsappLiderancaId: ''
    });

    const [parties, setParties] = useState<any[]>([]);
    const [slates, setSlates] = useState<any[]>([]);
    
    // Dropdown Control
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Fechar menu ao clicar fora
    useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // Carregar Partidos para o form de Usuarios
    useEffect(() => {
        if (isUserModalOpen) {
            fetch('/api/parties').then(res => res.json()).then(data => {
                if (Array.isArray(data)) setParties(data);
            });
            // Carrega lideranças WPP órfãs
            fetch('/api/admin/metrics/whatsapp/lideranca').then(res => res.json()).then(data => {
                if (data.success && Array.isArray(data.liderancas)) {
                    // Mantém todas para exibir no select
                    setLiderancasOptions(data.liderancas);
                }
            });
        }
    }, [isUserModalOpen]);

    // Deep Linking: Auto-editar se vier da URL
    useEffect(() => {
        const editId = searchParams.get('editId');
        if (editId && allUsers.length > 0) {
            const user = allUsers.find(u => u.id === editId);
            if (user && !isUserModalOpen) {
                openEditUserModal(user);
            }
        }
    }, [searchParams, allUsers]);

    // Carregar Chapas quando Partido muda
    useEffect(() => {
        if (userForm.partyId && isUserModalOpen) {
            fetch(`/api/slates?partyId=${userForm.partyId}`).then(res => res.json()).then(data => {
                if (Array.isArray(data)) setSlates(data);
            });
        } else {
            setSlates([]);
        }
    }, [userForm.partyId, isUserModalOpen]);

    useEffect(() => {
        const candidateId = turkUser?.candidateProfile?.id || structureUser?.candidateProfile?.id;
        if (candidateId) {
           fetch(`/api/admin/metrics/whatsapp/lideranca?candidateId=${candidateId}`)
              .then(res => res.json())
              .then(data => {
                  if(data.success) setLiderancasOptions(data.liderancas || []);
              });
        }
    }, [turkUser, structureUser, turkForm.platform]);

    useEffect(() => {
        const liderancaIdTarget = turkForm.selectedLiderancaId || structureForm.selectedLiderancaId;
        if (liderancaIdTarget && liderancaIdTarget !== 'NEW') {
           fetch(`/api/admin/metrics/whatsapp/grupo?liderancaId=${liderancaIdTarget}`)
              .then(res => res.json())
              .then(data => {
                  if(data.success) setGruposOptions(data.grupos || []);
              });
        }
    }, [turkForm.selectedLiderancaId, structureForm.selectedLiderancaId, turkForm.whatsappLevel, structureForm.view]);


    const handleAddPostToQueue = () => {
        if (!turkForm.manualPostUrl) return alert("Insira pelo menos a URL do Post.");
        
        setTurkPostQueue([
            ...turkPostQueue,
            {
               permalink: turkForm.manualPostUrl,
               caption: turkForm.manualPostCaption,
               mediaType: turkForm.manualPostType,
               likesCount: turkForm.manualPostLikes ? Number(turkForm.manualPostLikes) : 0,
               commentsCount: turkForm.manualPostCommentsCount ? Number(turkForm.manualPostCommentsCount) : 0,
               comments: turkForm.manualCommentText ? [
                  {
                     text: turkForm.manualCommentText,
                     username: turkForm.manualCommenter || 'usuario_anonimo',
                     likeCount: 0
                  }
               ] : []
            }
        ]);
        
        setTurkForm({
            ...turkForm,
            manualPostUrl: '', manualPostCaption: '', manualPostLikes: '', manualPostCommentsCount: '', manualCommentText: '', manualCommenter: ''
        });
    };

    const handleTurkSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (turkForm.platform === 'WHATSAPP' && turkForm.whatsappLevel !== 'CANDIDATE') {
                const endpoint = turkForm.whatsappLevel === 'LIDERANCA' 
                    ? '/api/admin/metrics/whatsapp/lideranca' 
                    : '/api/admin/metrics/whatsapp/grupo';
                
                if (turkForm.whatsappLevel === 'LIDERANCA' && !turkForm.selectedLiderancaId) {
                    alert("Selecione qual Liderança deseja alimentar os números.");
                    setIsSaving(false);
                    return;
                }
                if (turkForm.whatsappLevel === 'GRUPO' && (!turkForm.selectedLiderancaId || !turkForm.selectedGrupoId)) {
                    alert("Selecione Liderança e o Grupo que deseja alimentar.");
                    setIsSaving(false);
                    return;
                }

                const payload: any = {
                    candidateId: turkUser.candidateProfile?.id,
                    entryCount: turkForm.entryCount,
                    exitCount: turkForm.exitCount,
                    currentMembers: turkForm.currentMembers,
                    duplicateMembers: turkForm.duplicateMembers
                };

                if (turkForm.whatsappLevel === 'LIDERANCA') {
                    payload.liderancaId = turkForm.selectedLiderancaId;
                } else {
                    payload.liderancaId = turkForm.selectedLiderancaId; 
                    payload.grupoId = turkForm.selectedGrupoId;
                }

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    alert("Métricas hierárquicas WhatsApp salvas!");
                    setTurkUser(null);
                } else {
                    const err = await res.json();
                    alert(err.error || "Erro ao salvar métricas WPP.");
                }
                setIsSaving(false);
                return;
            }

            // FLUXO NORMAL (Geral / Meta)
            if (turkForm.platform === 'INSTAGRAM' && turkForm.turkMode === 'BULK') {
                if (!turkForm.bulkJson) return alert("Por favor cole o JSON gerado pelo Scraper.");
                const payload = JSON.parse(turkForm.bulkJson);
                payload.candidateId = turkUser.candidateProfile?.id;
                payload.platform = 'INSTAGRAM';
                if (turkForm.instagramHandle) {
                    payload.profileUsername = turkForm.instagramHandle.replace('@', '');
                }
                const res = await fetch('/api/admin/metrics/instagram/deep', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                   alert("JSON Ingerido com Sucesso no Deep Analytics!");
                   setTurkUser(null);
                } else {
                   const err = await res.json();
                   alert(err.error || "Erro ao processar JSON.");
                }
                setIsSaving(false);
                return;
            }

            if (turkForm.platform === 'INSTAGRAM' && turkForm.turkMode === 'MANUAL') {
                let postsToSend = [...turkPostQueue];
                
                // Se o usuário preencheu o formulário mas esqueceu de clicar em "Adicionar à Fila", enviamos a fila + o formulário atual
                if (turkForm.manualPostUrl) {
                    postsToSend.push({
                        permalink: turkForm.manualPostUrl,
                        caption: turkForm.manualPostCaption,
                        mediaType: turkForm.manualPostType,
                        likesCount: turkForm.manualPostLikes ? Number(turkForm.manualPostLikes) : 0,
                        commentsCount: turkForm.manualPostCommentsCount ? Number(turkForm.manualPostCommentsCount) : 0,
                        comments: turkForm.manualCommentText ? [
                             {
                                text: turkForm.manualCommentText,
                                username: turkForm.manualCommenter || 'usuario_anonimo',
                                likeCount: 0
                             }
                        ] : []
                    });
                }

                if (postsToSend.length === 0) {
                    alert("Adicione pelo menos um post à fila para enviar.");
                    setIsSaving(false);
                    return;
                }

                const payload: any = {
                    candidateId: turkUser.candidateProfile?.id,
                    platform: 'INSTAGRAM',
                    posts: postsToSend
                };
                if (turkForm.instagramHandle) {
                    payload.profileUsername = turkForm.instagramHandle.replace('@', '');
                }
                const res = await fetch('/api/admin/metrics/instagram/deep', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                   alert("Postagem Manual inserida com Sucesso no Deep Analytics!");
                   setTurkUser(null);
                } else {
                   const err = await res.json();
                   alert(err.error || "Erro ao processar Post Manual.");
                }
                setIsSaving(false);
                return;
            }

            // FLUXO GERAL BASE
            if (turkForm.turkMode === 'GERAL') {
                // A rota genérica /api/admin/metrics já trata todas as plataformas (inclusive WHATSAPP).
                const endpoint = '/api/admin/metrics';

                const payload: any = {
                    candidateId: turkUser.candidateProfile?.id,
                    platform: turkForm.platform,
                    followers: turkForm.followers ? Number(turkForm.followers) : undefined,
                    postsCount: turkForm.postsCount ? Number(turkForm.postsCount) : undefined,
                    engagement: turkForm.engagement ? Number(turkForm.engagement) : undefined,
                    likes: turkForm.likes ? Number(turkForm.likes) : undefined,
                    comments: turkForm.comments ? Number(turkForm.comments) : undefined,
                };
                
                if (turkForm.platform === 'INSTAGRAM' && turkForm.instagramHandle) {
                    payload.handle = turkForm.instagramHandle.replace('@', '');
                }

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    alert("Dados manuais cadastrados com sucesso!");
                    setTurkUser(null);
                } else {
                    const err = await res.json();
                    alert(err.error || "Erro ao salvar métricas.");
                }
            }
        } catch (error) {
            alert("Erro de conexão ao salvar métricas manuais.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateStructure = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!structureUser?.candidateProfile?.id) return;
        setIsCreatingStructure(true);

        try {
            if (structureForm.view === 'LIDERANCA') {
                if (!structureForm.liderancaName) return alert("O nome da liderança é obrigatório.");
                
                const payload: any = {
                    candidateId: structureUser.candidateProfile.id,
                    name: structureForm.liderancaName,
                    whatsappHandle: structureForm.whatsappHandle,
                    instagramHandle: structureForm.instagramHandle,
                    phone: structureForm.phone,
                };
                
                if (editingLiderancaId) {
                    payload.liderancaId = editingLiderancaId;
                } else {
                    payload.entryCount = 0;
                    payload.exitCount = 0;
                    payload.currentMembers = 0;
                    payload.duplicateMembers = 0;
                }

                const res = await fetch('/api/admin/metrics/whatsapp/lideranca', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    alert(editingLiderancaId ? "Liderança atualizada com sucesso!" : "Liderança de WPP criada com sucesso!");
                    setStructureForm(prev => ({...prev, liderancaName: '', whatsappHandle: '', instagramHandle: '', phone: ''}));
                    setEditingLiderancaId(null);
                    // Refetch options
                    const refetch = await fetch(`/api/admin/metrics/whatsapp/lideranca?candidateId=${structureUser.candidateProfile.id}`);
                    const data = await refetch.json();
                    if(data.success) setLiderancasOptions(data.liderancas || []);
                } else {
                    const err = await res.json();
                    alert(err.error || "Erro ao salvar liderança.");
                }
            } else {
                if (!structureForm.selectedLiderancaId || !structureForm.groupName) {
                    return alert("Selecione a liderança e preencha o nome do grupo.");
                }

                const payload: any = {
                    candidateId: structureUser.candidateProfile.id,
                    liderancaId: structureForm.selectedLiderancaId,
                    name: structureForm.groupName,
                    groupLeaderName: structureForm.groupLeaderName,
                    inviteLink: structureForm.inviteLink,
                };

                if (editingGrupoId) {
                    payload.grupoId = editingGrupoId;
                } else {
                    payload.entryCount = 0;
                    payload.exitCount = 0;
                    payload.currentMembers = 0;
                    payload.duplicateMembers = 0;
                }

                const res = await fetch('/api/admin/metrics/whatsapp/grupo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    alert(editingGrupoId ? "Grupo atualizado com sucesso!" : "Grupo vinculado com sucesso à Liderança!");
                    setStructureForm(prev => ({...prev, groupName: '', inviteLink: '', groupLeaderName: ''}));
                    setEditingGrupoId(null);
                    // Refetch groups
                    const refetch = await fetch(`/api/admin/metrics/whatsapp/grupo?liderancaId=${structureForm.selectedLiderancaId}`);
                    const data = await refetch.json();
                    if(data.success) setGruposOptions(data.grupos || []);
                } else {
                    const err = await res.json();
                    alert(err.error || "Erro ao salvar o grupo.");
                }
            }
        } catch (error) {
            alert("Falha na conexão.");
        } finally {
            setIsCreatingStructure(false);
        }
    };

    const handleEditLideranca = (lid: any) => {
        setStructureForm({
            ...structureForm,
            liderancaName: lid.name,
            whatsappHandle: lid.whatsappHandle || '',
            instagramHandle: lid.instagramHandle || '',
            phone: lid.phone || '',
        });
        setEditingLiderancaId(lid.id);
    };

    const handleEditGrupo = (grp: any) => {
        setStructureForm({
            ...structureForm,
            groupName: grp.name,
            groupLeaderName: grp.groupLeaderName || '',
            inviteLink: grp.inviteLink || '',
        });
        setEditingGrupoId(grp.id);
    };

    // ==========================================
    // CRUD DE USUÁRIOS
    // ==========================================
    const openCreateUserModal = () => {
        setUserForm({ name: '', email: '', password: '', role: 'CANDIDATO', partyId: '', slateId: '', whatsappLiderancaId: ''});
        setEditingUserId(null);
        setIsUserModalOpen(true);
    };

    const openEditUserModal = (user: any) => {
        setUserForm({
            name: user.name || '',
            email: user.email || '',
            password: '', // Não carrega a senha antiga
            role: user.role || 'CANDIDATO',
            partyId: user.partyId || '',
            slateId: user.slateId || '',
            whatsappLiderancaId: '' // Deveria puxar de user.whatsappLiderancas se estivesse populado
        });
        setEditingUserId(user.id);
        setIsUserModalOpen(true);
    };

    const handleDeleteUser = async (user: any) => {
        if (!confirm(`Tem certeza que deseja EXCLUIR o usuário ${user.name}? Esta ação é irreversível.`)) return;
        try {
            const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
            if (res.ok) {
                alert("Usuário excluído com sucesso!");
                window.location.reload(); // Refresh rápido
            } else {
                const err = await res.json();
                alert(err.error || "Erro ao excluir usuário");
            }
        } catch (e) {
            alert("Falha de conexão.");
        }
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingUser(true);
        try {
            const endpoint = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
            const method = editingUserId ? 'PUT' : 'POST';
            
            const payload: any = { ...userForm };
            if (!payload.password) delete payload.password; // não envia senha vazia se não mudou
            
            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // Se o usuário foi criado/editado e era uma LiderancaWPP, precisamos atualizar a liderança (fazer vincular o userID recém modificado)
                // Como não queremos criar um super endpoint complexo, recomendaremos fazer pela API futuramente se não der, mas isso basta para as requirements base
                alert(editingUserId ? "Usuário atualizado com sucesso!" : "Usuário criado com sucesso!");
                window.location.reload(); // Refresh completo pra atualizar listas e auth cookies se necessário ou views
            } else {
                const err = await res.json();
                alert(err.error || "Erro ao salvar usuário");
            }
        } catch(e) {
            alert("Erro de conexão ao salvar usuário");
        } finally {
            setIsSavingUser(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-[1.35rem] font-bold text-slate-900 dark:text-white leading-tight">Gestão de Clientes</h2>
                    <p className="text-[15px] font-medium text-slate-500">Acesse e gerencie múltiplos perfis políticos</p>
                </div>
                <button onClick={openCreateUserModal} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Adicionar Cliente
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white shadow-sm"
                        placeholder="Buscar cliente, partido ou cargo..."
                    />
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                    <select className="w-full sm:w-40 px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm focus:outline-none focus:border-blue-500 cursor-pointer appearance-none">
                        <option>Status: Todos</option>
                        <option>Ativos</option>
                        <option>Inativos</option>
                    </select>
                </div>
            </div>

            {/* Grid de Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {allUsers.length > 0 ? (
                    allUsers.map((user) => (
                        <div key={user.id} className="bg-white dark:bg-gray-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all p-5 flex flex-col group relative">
                            <div className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(openMenuId === user.id ? null : user.id);
                                    }}
                                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                                
                                {/* Dropdown Menu */}
                                {openMenuId === user.id && (
                                    <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-10" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => router.push(`/profile?id=${user.id}`)} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                                            <User className="w-4 h-4" /> Ver Perfil Completo
                                        </button>
                                        <button onClick={() => { setOpenMenuId(null); openEditUserModal(user); }} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800">
                                            <Edit2 className="w-4 h-4" /> Editar Cadastro
                                        </button>
                                        <button onClick={() => { setOpenMenuId(null); handleDeleteUser(user); }} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800">
                                            <Trash2 className="w-4 h-4" /> Excluir Cliente
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-900 shadow-sm flex items-center justify-center shrink-0">
                                    <User className="w-6 h-6 text-slate-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">{user.name || "Usuário Sem Nome"}</h3>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-green-50 dark:bg-green-900/20 text-[10px] font-bold text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                            Ativo
                                        </div>
                                        {user.whatsappLiderancas && user.whatsappLiderancas.length > 0 && (
                                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                                                <MessageCircle className="w-3 h-3" />
                                                WhatsApp
                                            </div>
                                        )}
                                        {user.whatsappLiderancas && user.whatsappLiderancas.some((l: any) => l.instagramHandle) && (
                                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-fuchsia-50 dark:bg-fuchsia-900/20 text-[10px] font-bold text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-100 dark:border-fuchsia-900/30">
                                                <Instagram className="w-3 h-3" />
                                                Instagram
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5 mb-6">
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg truncate">
                                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-medium truncate text-xs">{user.email}</span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1">
                                        {user.party ? (
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-800" title={`Partido: ${user.party.name}`}>
                                                <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                                <span className="font-bold truncate max-w-[80px]">{user.party.code || user.party.name}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-dashed border-slate-200 dark:border-slate-800">
                                                <Building className="w-3 h-3 shrink-0" />
                                                <span>Sem Partido</span>
                                            </div>
                                        )}
                                        {/* Etiquetas extras para Lideranças */}
                                        {user.role === 'LIDER_CHAPA' && user.whatsappLiderancas && user.whatsappLiderancas.map((l: any) => (
                                            <div key={l.id} className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-900/30">
                                                <Database className="w-3 h-3 shrink-0" />
                                                <span className="font-bold">Lid: {l.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {user.slate ? (
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-indigo-50/50 dark:bg-indigo-900/20 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-900/30" title={`Chapa: ${user.slate.name}`}>
                                                <Layers className="w-3 h-3 text-indigo-400 shrink-0" />
                                                <span className="font-bold truncate max-w-[80px]">{user.slate.name}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-dashed border-slate-200 dark:border-slate-800">
                                                <Layers className="w-3 h-3 shrink-0" />
                                                <span>Sem Chapa</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg mt-1">
                                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-medium truncate">Nível: {user.role.replace('_', ' ')}</span>
                                </div>
                            </div>

                            <div className="mt-auto flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="grid grid-cols-2 gap-2 w-full">
                                    <button
                                        onClick={() => router.push(`/?viewAs=${user.id}`)}
                                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:hover:bg-blue-900/50 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Eye className="w-4 h-4" />
                                        Painel
                                    </button>
                                    <button
                                        onClick={() => setStructureUser(user)}
                                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Settings2 className="w-4 h-4" />
                                        Estrutura
                                    </button>
                                    <button
                                        onClick={() => setTurkUser(user)}
                                        className="col-span-2 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Database className="w-4 h-4" />
                                        Entrada Manual de Dados
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-10">
                        <p className="text-slate-500">Nenhum usuário correspondente encontrado.</p>
                    </div>
                )}

                {/* Card "Adicionar Novo" */}
                <div onClick={openCreateUserModal} className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 transition-all p-5 flex flex-col items-center justify-center min-h-[250px] cursor-pointer group text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-200">Adicionar Cliente</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-[180px]">Comece a monitorar um novo perfil político hoje mesmo.</p>
                    </div>
                </div>
            </div>

            {/* Modal CRUD Usuários (Partidos, Chapas, Lideranças) */}
            {isUserModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <User className="w-5 h-5 text-blue-500" />
                                    {editingUserId ? "Editar Perfil do Usuário" : "Novo Cliente/Usuário"}
                                </h3>
                                <p className="text-sm text-slate-500">Preencha os dados e escolha as permissões</p>
                            </div>
                            <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            <form id="user-form" onSubmit={handleSaveUser} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome Completo</label>
                                        <input required type="text" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Ex: Maria José" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">E-mail de Login</label>
                                        <input required type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500" placeholder="maria@exemplo.com" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Senha {editingUserId && <span className="opacity-50 font-normal">(deixe vazio p/ manter)</span>}</label>
                                        <input type="password" required={!editingUserId} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500" placeholder="••••••••" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nível de Permissão (Role)</label>
                                        <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500">
                                            <option value="CANDIDATO">Candidato</option>
                                            <option value="LIDER_CHAPA">Liderança</option>
                                            <option value="DIRIGENTE">Dirigente</option>
                                            <option value="ADMIN">Administrador</option>
                                        </select>
                                    </div>
                                    <div className="py-2 sm:col-span-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Vínculos de Estrutura</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {/* Select Partido */}
                                            <div className="space-y-1">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Partido Principal</label>
                                                <select 
                                                    value={userForm.partyId} 
                                                    onChange={(e) => setUserForm({...userForm, partyId: e.target.value, slateId: ''})}
                                                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">Selecione um Partido</option>
                                                    {parties.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Select Chapa */}
                                            <div className="space-y-1">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Chapa / Coligação</label>
                                                <select 
                                                    value={userForm.slateId} 
                                                    onChange={(e) => setUserForm({...userForm, slateId: e.target.value})}
                                                    disabled={!userForm.partyId}
                                                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                                >
                                                    <option value="">Selecione uma Chapa</option>
                                                    {slates.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                                {!userForm.partyId && <p className="text-[10px] text-slate-500 italic mt-1">Selecione um partido primeiro</p>}
                                            </div>
                                        </div>

                                        {userForm.role === 'LIDER_CHAPA' && (
                                            <div className="sm:col-span-2 mt-4">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Conta do WhatsApp (Liderança Orgânica)</label>
                                                <select value={userForm.whatsappLiderancaId} onChange={e => setUserForm({...userForm, whatsappLiderancaId: e.target.value})} className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500">
                                                    <option value="">(Opcional) Vincule a métrica desta Liderança</option>
                                                    {liderancasOptions.map(l => (
                                                        <option key={l.id} value={l.id}>
                                                            {l.name} {l.candidate?.user?.name ? `(Referente a: ${l.candidate.user.name})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-slate-500 mt-1">Isso permitirá que os dados desta liderança sejam de responsabilidade deste usuário que fará login.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" form="user-form" disabled={isSavingUser} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                                {isSavingUser ? "Salvando..." : <><Save className="w-4 h-4" /> Gravar Usuário</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal do Mechanical Turk */}
            {turkUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Database className="w-5 h-5 text-amber-500" />
                                    Inserção Manual (Turk)
                                </h3>
                                <p className="text-sm text-slate-500">Métricas para {turkUser.name}</p>
                            </div>
                            <button onClick={() => { setTurkUser(null); setTurkPostQueue([]); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            <form id="turk-form" onSubmit={handleTurkSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Candidato ID</label>
                                    <input type="text" disabled value={turkUser.candidateProfile?.id || "SEM PERFIL"} className="w-full bg-slate-100 dark:bg-slate-900 text-slate-500 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Plataforma Alvo</label>
                                    <select
                                        value={turkForm.platform}
                                        onChange={(e) => setTurkForm({ ...turkForm, platform: e.target.value })}
                                        className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500"
                                    >
                                        <option value="INSTAGRAM">Instagram</option>
                                        <option value="FACEBOOK">Facebook</option>
                                        <option value="WHATSAPP">WhatsApp</option>
                                    </select>
                                </div>

                                {turkForm.platform === 'INSTAGRAM' && (
                                    <div className="space-y-4">
                                        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-full">
                                            <button type="button" onClick={() => setTurkForm({...turkForm, turkMode: 'GERAL'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${turkForm.turkMode === 'GERAL' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Geral</button>
                                            <button type="button" onClick={() => setTurkForm({...turkForm, turkMode: 'BULK'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${turkForm.turkMode === 'BULK' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Bulk JSON (Scraper)</button>
                                            <button type="button" onClick={() => setTurkForm({...turkForm, turkMode: 'MANUAL'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${turkForm.turkMode === 'MANUAL' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Post Único Manual</button>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Identificador da Conta (@)</label>
                                            <input type="text" value={turkForm.instagramHandle} onChange={e => setTurkForm({...turkForm, instagramHandle: e.target.value})} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500" placeholder="Ex: @jairmessiasbolsonaro" />
                                            <p className="text-[10px] text-slate-500 mt-1">Este é o @ oficial do candidato que você deseja associar a esta análise.</p>
                                        </div>
                                    </div>
                                )}

                                {/* ==== HIERARQUIA WHATSAPP ==== */}
                                {turkForm.platform === 'WHATSAPP' && (
                                    <>
                                        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Instância/Mundo WPP</label>
                                                <select
                                                    value={turkForm.whatsappLevel}
                                                    onChange={(e) => setTurkForm({ ...turkForm, whatsappLevel: e.target.value })}
                                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500"
                                                >
                                                    <option value="CANDIDATE">Geral (Métrica do Candidato)</option>
                                                    <option value="LIDERANCA">Sub-Nível: Liderança</option>
                                                    <option value="GRUPO">Sub-Nível: Grupo</option>
                                                </select>
                                            </div>

                                            {/* Select de Lideranca requerido para nivel Lideranca ou Grupo */}
                                            {turkForm.whatsappLevel !== 'CANDIDATE' && (
                                                <div>
                                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Selecione Liderança</label>
                                                    <select
                                                        value={turkForm.selectedLiderancaId}
                                                        onChange={(e) => setTurkForm({ ...turkForm, selectedLiderancaId: e.target.value })}
                                                        className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500"
                                                    >
                                                        <option value="">-- Escolha --</option>
                                                        {liderancasOptions.map(l => (
                                                            <option key={l.id} value={l.id}>{l.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            {/* Select de Grupo requerido para nivel Grupo */}
                                            {turkForm.whatsappLevel === 'GRUPO' && (
                                                <div>
                                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Selecione Grupo</label>
                                                    <select
                                                        value={turkForm.selectedGrupoId}
                                                        onChange={(e) => setTurkForm({ ...turkForm, selectedGrupoId: e.target.value })}
                                                        className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500"
                                                    >
                                                        <option value="">-- Escolha --</option>
                                                        {gruposOptions.map(g => (
                                                            <option key={g.id} value={g.id}>{g.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ==== CAMPOS (INSTAGRAM BULK) ==== */}
                                {turkForm.platform === 'INSTAGRAM' && turkForm.turkMode === 'BULK' && (
                                    <div className="space-y-3">
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 pt-2">Cole o JSON do Apify / Python</label>
                                        <p className="text-xs text-slate-500 mb-2">Após preencher o "@" acima, cole o código neste campo.</p>
                                        <textarea 
                                            value={turkForm.bulkJson} 
                                            onChange={(e) => setTurkForm({ ...turkForm, bulkJson: e.target.value })} 
                                            className="w-full h-48 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-amber-500 dark:text-slate-300" 
                                            placeholder='{"followers": 1500, "posts": [ { "permalink": "...", "likesCount": 15 ... } ] }'
                                        ></textarea>
                                    </div>
                                )}

                                {/* ==== CAMPOS (INSTAGRAM MANUAL INFO POST) ==== */}
                                {turkForm.platform === 'INSTAGRAM' && turkForm.turkMode === 'MANUAL' && (
                                    <div className="space-y-4">
                                        <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100 dark:border-amber-900/30 space-y-4">
                                            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">Detalhes do Post Específico</h4>
                                            
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">URL (Link) do Post</label>
                                                <input type="text" value={turkForm.manualPostUrl} onChange={e => setTurkForm({...turkForm, manualPostUrl: e.target.value})} className="w-full bg-white dark:bg-slate-950 border dark:border-slate-800 p-2 rounded-lg text-sm dark:text-slate-300" placeholder="https://instagram.com/p/..." />
                                            </div>
                                            
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Legenda da Foto (Opcional)</label>
                                                <textarea value={turkForm.manualPostCaption} onChange={e => setTurkForm({...turkForm, manualPostCaption: e.target.value})} className="w-full bg-white dark:bg-slate-950 border dark:border-slate-800 p-2 rounded-lg text-sm dark:text-slate-300" placeholder="Excelente dia na praça!" rows={2}></textarea>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Curtidas Totais</label>
                                                    <input type="number" value={turkForm.manualPostLikes} onChange={e => setTurkForm({...turkForm, manualPostLikes: e.target.value})} className="w-full bg-white dark:bg-slate-950 border dark:border-slate-800 p-2 rounded-lg text-sm dark:text-slate-300" placeholder="Ex: 50" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Comentários Totais</label>
                                                    <input type="number" value={turkForm.manualPostCommentsCount} onChange={e => setTurkForm({...turkForm, manualPostCommentsCount: e.target.value})} className="w-full bg-white dark:bg-slate-950 border dark:border-slate-800 p-2 rounded-lg text-sm dark:text-slate-300" placeholder="Ex: 5" />
                                                </div>
                                            </div>

                                            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-4 border-t border-amber-100 dark:border-amber-900/30 pt-3">Destacar um Comentário Específico (Super Fã)</h4>
                                            <p className="text-xs text-amber-600 mb-2">Simula que este usuário comentou, dando pontuação a ele no ranking.</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="sm:col-span-2">
                                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Texto do Comentário</label>
                                                    <input type="text" value={turkForm.manualCommentText} onChange={e => setTurkForm({...turkForm, manualCommentText: e.target.value})} className="w-full bg-white dark:bg-slate-950 border dark:border-slate-800 p-2 rounded-lg text-sm dark:text-slate-300" placeholder="Conte com meu voto!!" />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Nome do Usuário (@)</label>
                                                    <input type="text" value={turkForm.manualCommenter} onChange={e => setTurkForm({...turkForm, manualCommenter: e.target.value})} className="w-full bg-white dark:bg-slate-950 border dark:border-slate-800 p-2 rounded-lg text-sm dark:text-slate-300" placeholder="marcos_silva_19" />
                                                </div>
                                            </div>
                                            <div className="flex justify-end mt-4">
                                                <button type="button" onClick={handleAddPostToQueue} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-700">
                                                    <Plus className="w-4 h-4" />
                                                    Adicionar Post à Fila
                                                </button>
                                            </div>

                                            {turkPostQueue.length > 0 && (
                                                <div className="mt-4 pt-4 border-t border-amber-200/50 dark:border-amber-900/50">
                                                    <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-2">
                                                        <Layers className="w-4 h-4" />
                                                        Fila de Envio Diária ({turkPostQueue.length})
                                                    </h4>
                                                    <ul className="space-y-2">
                                                        {turkPostQueue.map((post, idx) => (
                                                            <li key={idx} className="bg-white dark:bg-slate-950 p-2 border border-amber-100 dark:border-amber-900/40 rounded flex justify-between items-center text-xs">
                                                                <div className="truncate pr-4">
                                                                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate inline-block max-w-[200px]" title={post.permalink}>{post.permalink.replace('https://instagram.com/p/', '')}</span>
                                                                    <p className="text-[10px] text-slate-500">{post.likesCount} curtidas • {post.comments?.length > 0 ? '1 fã mapeado' : 'sem comentários mapeados'}</p>
                                                                </div>
                                                                <button type="button" onClick={() => setTurkPostQueue(turkPostQueue.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 p-1">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ==== CAMPOS NUMÉRICOS (METAS VS WHATSAPP_HIERARQUICO) ==== */}
                                {(turkForm.platform === 'WHATSAPP' && turkForm.whatsappLevel !== 'CANDIDATE') ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Entradas (Período)</label>
                                            <input type="number" placeholder="Ex: 50" value={turkForm.entryCount} onChange={(e) => setTurkForm({ ...turkForm, entryCount: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Saídas (Período)</label>
                                            <input type="number" placeholder="Ex: 10" value={turkForm.exitCount} onChange={(e) => setTurkForm({ ...turkForm, exitCount: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Membros Atuais (Total)</label>
                                            <input type="number" placeholder="Ex: 450" value={turkForm.currentMembers} onChange={(e) => setTurkForm({ ...turkForm, currentMembers: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Números Duplicados</label>
                                            <input type="number" placeholder="Ex: 15" value={turkForm.duplicateMembers} onChange={(e) => setTurkForm({ ...turkForm, duplicateMembers: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm" />
                                        </div>
                                    </div>
                                ) : turkForm.turkMode === 'GERAL' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                                {turkForm.platform === 'WHATSAPP' ? 'Total Geral Mensagens' : 'Seguidores'}
                                            </label>
                                            <input type="number" placeholder="Ex: 15300" value={turkForm.followers} onChange={(e) => setTurkForm({ ...turkForm, followers: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500" />
                                        </div>
                                        {turkForm.platform !== 'WHATSAPP' && (
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Total Posts</label>
                                                <input type="number" placeholder="Ex: 345" value={turkForm.postsCount} onChange={(e) => setTurkForm({ ...turkForm, postsCount: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500" />
                                            </div>
                                        )}
                                        {turkForm.platform !== 'WHATSAPP' && (
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Total Curtidas</label>
                                                <input type="number" placeholder="Ex: 5000" value={turkForm.likes} onChange={(e) => setTurkForm({ ...turkForm, likes: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500" />
                                            </div>
                                        )}
                                        {turkForm.platform !== 'WHATSAPP' && (
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Total Comentários</label>
                                                <input type="number" placeholder="Ex: 1200" value={turkForm.comments} onChange={(e) => setTurkForm({ ...turkForm, comments: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500" />
                                            </div>
                                        )}
                                        {turkForm.platform !== 'WHATSAPP' && (
                                            <div className="col-span-2">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Engajamento (%)</label>
                                                <input type="number" step="0.01" placeholder="Ex: 2.4" value={turkForm.engagement} onChange={(e) => setTurkForm({ ...turkForm, engagement: e.target.value })} className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-amber-500" />
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                            </form>
                        </div>
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                            <button type="button" onClick={() => { setTurkUser(null); setTurkPostQueue([]); }} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" form="turk-form" disabled={isSaving || !turkUser.candidateProfile} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm">
                                {isSaving ? "Salvando..." : <><Database className="w-4 h-4" /> Inserir Dados</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Gestão Estrutural do WhatsApp */}
            {structureUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                        {/* HEADER MODAL */}
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <div>
                                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Settings2 className="w-6 h-6 text-indigo-500" />
                                    Gerenciar Estrutura do WhatsApp
                                </h3>
                                <p className="text-sm font-medium text-slate-500 mt-1">Hierarquia de base para: {structureUser.name}</p>
                            </div>
                            <button onClick={() => setStructureUser(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors bg-slate-100 dark:bg-slate-900 p-2 rounded-xl">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* CONTENT MODAL */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col bg-slate-50/50 dark:bg-slate-900/10">
                            {/* TABS */}
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl mb-6 shrink-0 w-fit">
                                <button
                                    onClick={() => setStructureForm({ ...structureForm, view: 'LIDERANCA' })}
                                    className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${structureForm.view === 'LIDERANCA' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    Lideranças (Cabeças)
                                </button>
                                <button
                                    onClick={() => setStructureForm({ ...structureForm, view: 'GRUPO' })}
                                    className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${structureForm.view === 'GRUPO' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    Grupos Vinculados
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto w-full">
                                {structureForm.view === 'LIDERANCA' ? (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-6">
                                            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                {editingLiderancaId ? "Editar Liderança Existente" : "Cadastrar Nova Liderança"}
                                            </h4>
                                            <form onSubmit={handleCreateStructure} className="space-y-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="sm:col-span-2">
                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome da Liderança *</label>
                                                        <input type="text" value={structureForm.liderancaName} onChange={e => setStructureForm({...structureForm, liderancaName: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="Ex: João da Silva Cordeiro"/>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Handle WhatsApp (@ ou Nº)</label>
                                                        <input type="text" value={structureForm.whatsappHandle} onChange={e => setStructureForm({...structureForm, whatsappHandle: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="@joaocordeiro" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Handle Instagram</label>
                                                        <input type="text" value={structureForm.instagramHandle} onChange={e => setStructureForm({...structureForm, instagramHandle: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="@joao.cordeiro.oficial" />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end pt-2">
                                                    {editingLiderancaId && (
                                                        <button type="button" onClick={() => { setEditingLiderancaId(null); setStructureForm({...structureForm, liderancaName: '', whatsappHandle: '', instagramHandle: '', phone: ''}) }} className="px-5 py-2.5 mr-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-xl shadow-md">
                                                            Cancelar
                                                        </button>
                                                    )}
                                                    <button type="submit" disabled={isCreatingStructure} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md disabled:bg-indigo-400">
                                                        {isCreatingStructure ? "Salvando..." : (editingLiderancaId ? "Salvar Alterações" : "+ Criar Liderança")}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Lideranças Existentes:</h4>
                                            {liderancasOptions.length > 0 ? (
                                                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {liderancasOptions.map(lid => {
                                                        const isMultiCandidate = lid.candidateIds && lid.candidateIds.length > 1;
                                                        const canEdit = isAdmin || !isMultiCandidate;
                                                        
                                                        return (
                                                            <li key={lid.id} className={`bg-white dark:bg-slate-800 border p-3 rounded-lg text-sm font-medium flex justify-between items-center shadow-sm ${!canEdit ? 'opacity-75 border-amber-200 dark:border-amber-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
                                                                <div className="flex flex-col truncate pr-2">
                                                                    <span className="truncate font-bold text-slate-900 dark:text-white" title={lid.name}>{lid.name}</span>
                                                                    {isMultiCandidate && (
                                                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold uppercase mt-0.5">Multi-Candidato</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {!canEdit ? (
                                                                        <span className="text-[10px] bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 px-2 py-1 rounded-md border border-amber-100 dark:border-amber-900/40 font-bold" title="Apenas administradores podem editar lideranças multi-candidato">Restrito</span>
                                                                    ) : (
                                                                        <button onClick={() => handleEditLideranca(lid)} className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1" title="Editar Liderança">
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <p className="text-xs text-slate-500">Nenhuma liderança vinculada a este candidato ainda.</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-6">
                                            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                                                {editingGrupoId ? "Editar Grupo Existente" : "Vincular Novo Grupo"}
                                            </h4>
                                            <form onSubmit={handleCreateStructure} className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Sob a Guarda (Dono) de qual Liderança? *</label>
                                                    <select value={structureForm.selectedLiderancaId} onChange={e => setStructureForm({...structureForm, selectedLiderancaId: e.target.value})} disabled={editingGrupoId !== null} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white disabled:opacity-60">
                                                        <option value="">-- Selecione o Guarda-Chuva --</option>
                                                        {liderancasOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="sm:col-span-2">
                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome do Grupo do WPP *</label>
                                                        <input type="text" value={structureForm.groupName} onChange={e => setStructureForm({...structureForm, groupName: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="Ex: Comunidade Bairro Centro 01" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome do Administrador (Sub-líder)</label>
                                                        <input type="text" value={structureForm.groupLeaderName} onChange={e => setStructureForm({...structureForm, groupLeaderName: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="Ex: Marcos" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Link de Convite Permanente</label>
                                                        <input type="url" value={structureForm.inviteLink} onChange={e => setStructureForm({...structureForm, inviteLink: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="https://chat.whatsapp.com/..." />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end pt-2">
                                                    {editingGrupoId && (
                                                        <button type="button" onClick={() => { setEditingGrupoId(null); setStructureForm({...structureForm, groupName: '', inviteLink: '', groupLeaderName: ''}) }} className="px-5 py-2.5 mr-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-xl shadow-md">
                                                            Cancelar
                                                        </button>
                                                    )}
                                                    <button type="submit" disabled={isCreatingStructure} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md disabled:bg-indigo-400">
                                                        {isCreatingStructure ? "Salvando..." : (editingGrupoId ? "Salvar Alterações" : "+ Criar Grupo")}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>

                                        {structureForm.selectedLiderancaId && (
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Grupos Base Destes Contatos:</h4>
                                                {gruposOptions.length > 0 ? (
                                                    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {gruposOptions.map(g => (
                                                            <li key={g.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-sm font-medium flex justify-between items-center shadow-sm">
                                                                <span className="truncate" title={g.name}>{g.name}</span>
                                                                <button onClick={() => handleEditGrupo(g)} className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1" title="Editar Grupo">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-xs text-slate-500">Nenhum grupo sob este guarda-chuva.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { User, Mail, Shield, Building2, Layers, Calendar, ArrowLeft, Instagram } from 'lucide-react';
import Link from 'next/link';

export default async function ProfilePage({ searchParams }: { searchParams?: Promise<{ id?: string }> }) {
    const session = await auth();
    if (!session?.user) redirect('/login');

    const resolvedParams = await searchParams;
    const requestedId = resolvedParams?.id;
    // @ts-ignore
    const currentUserId = session.user.id;
    // @ts-ignore
    const currentUserRole = session.user.role;

    const isAdmin = currentUserRole === 'ADMIN' || currentUserRole === 'SUPER_ADMIN';
    const targetId = (isAdmin && requestedId) ? requestedId : currentUserId;

    const userProfile = await prisma.user.findUnique({
        where: { id: targetId },
        include: {
            party: true,
            slate: true,
            whatsappLiderancas: true
        }
    });

    if (!userProfile) {
        return (
            <div className="max-w-4xl mx-auto space-y-6 pt-10 text-center">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Usuário não encontrado</h1>
                <Link href="/" className="text-blue-500 hover:underline">Voltar para o Painel</Link>
            </div>
        );
    }

    const isViewingOther = targetId !== currentUserId;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
            {isViewingOther && (
                <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
                </Link>
            )}

            <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-full md:w-1/3 space-y-6">
                    {/* Card de Identificação */}
                    <div className="bg-white dark:bg-slate-950 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-900 border-4 border-white dark:border-slate-950 shadow-md flex items-center justify-center mb-4">
                            {userProfile.image ? (
                                <img src={userProfile.image} alt={userProfile.name || ''} className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <User className="w-10 h-10 text-slate-400" />
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{userProfile.name}</h2>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            <Shield className="w-3.5 h-3.5" />
                            {userProfile.role.replace('_', ' ')}
                        </span>
                        
                        {userProfile.whatsappLiderancas && userProfile.whatsappLiderancas.length > 0 && (
                            <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-indigo-600 text-white shadow-sm ring-4 ring-indigo-500/10 dark:ring-indigo-500/5">
                                <Shield className="w-3 h-3" />
                                LIDERANÇA CONECTADA
                            </span>
                        )}

                        {userProfile.whatsappLiderancas && userProfile.whatsappLiderancas.some(l => (l as any).instagramHandle) && (
                            <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-fuchsia-600 text-white shadow-sm ring-4 ring-fuchsia-500/10 dark:ring-fuchsia-500/5">
                                <Instagram className="w-3 h-3" />
                                INSTAGRAM CONECTADO
                            </span>
                        )}
                    </div>

                    {/* Vínculos de Liderança (Se existir) */}
                    {userProfile.whatsappLiderancas && userProfile.whatsappLiderancas.length > 0 && (
                        <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Lideranças Gerenciadas (Meta/WPP)</h3>
                            <ul className="space-y-2">
                                {userProfile.whatsappLiderancas.map(lideranca => (
                                    <li key={lideranca.id} className="text-sm flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        {lideranca.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="w-full md:w-2/3 space-y-6">
                    {/* Detalhes Conta */}
                    <div className="bg-white dark:bg-slate-950 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 relative">
                        {isAdmin && (
                            <Link href={`/?tab=clientes&editId=${userProfile.id}`} className="absolute top-6 right-6 text-sm font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                                Editar Cadastro
                            </Link>
                        )}
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">Informações da Conta</h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> E-mail</p>
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{userProfile.email}</p>
                            </div>
                            
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Criado em</p>
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{new Date(userProfile.createdAt).toLocaleDateString('pt-BR')}</p>
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Partido</p>
                                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                        {userProfile.party ? `${userProfile.party.name} (${userProfile.party.code})` : 'Nenhum'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Chapa / Coligação</p>
                                <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-900/20">
                                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                                        {userProfile.slate ? userProfile.slate.name : 'Nenhuma'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

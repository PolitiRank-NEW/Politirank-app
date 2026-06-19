import { ConnectInstagramButton } from '@/components/dashboard-features/ConnectInstagramButton';
import { InstagramStats } from '@/components/dashboard-features/InstagramStats';
import { SocialPlatform } from '@prisma/client';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { Heart, Share2, MessageCircle, Users, Eye, TrendingUp, Settings, Instagram, Facebook, Eye as EyeIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ClientDashboardTabs } from '@/components/dashboard/ClientDashboardTabs';
import Link from 'next/link';

export default async function Home({ searchParams }: { searchParams?: Promise<{ viewAs?: string }> }) {
  const session = await auth();
  // @ts-ignore
  const userRole = session?.user?.role;
  // @ts-ignore
  const userId = session?.user?.id;
  const isAdminOrSuper = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  // Next.js 15+: searchParams é uma Promise que precisa ser await
  const resolvedParams = await searchParams;

  // Impersonation: viewAs param only works for Admin/SuperAdmin
  const viewAsId = isAdminOrSuper ? (resolvedParams?.viewAs ?? null) : null;
  const isImpersonating = !!viewAsId;

  // Target: O userId a ser exibido (o impersonado ou o próprio usuário)
  const targetUserId = viewAsId || userId;

  if (!session) {
    redirect('/login');
  }

  // 1. Redirect Rules
  if (userRole === 'DIRIGENTE') {
    redirect('/candidates');
  }

  // 2. Fetch User Data (For Everyone)
  // Se admin está impersonando, buscamos dados do target. Senão, do próprio usuário.
  const userData = await (prisma.user.findUnique as any)({
    where: { id: targetUserId },
    include: { 
      candidateProfile: { include: { socialProfiles: true } },
      party: true,
      slate: true
    }
  });

  const profile = userData?.candidateProfile;
  const instagramProfile = profile?.socialProfiles.find((p: any) => p.platform === (SocialPlatform as any).INSTAGRAM);
  const facebookProfile = profile?.socialProfiles.find((p: any) => p.platform === (SocialPlatform as any).FACEBOOK);

  const hasInstagram = !!instagramProfile;
  const hasFacebook = !!facebookProfile;

  // WhatsApp: detecta se há perfil manual inserido pelo Turk
  const whatsappProfile = profile?.socialProfiles.find((p: any) => (p.platform as string) === 'WHATSAPP');
  const hasWhatsapp = !!whatsappProfile;
  const whatsappMessages = whatsappProfile ? (whatsappProfile.followers || 0) : 0;

  // Busca Hierarquia Completa do Wpp (Multi-Candidato)
  const whatsappLiderancas = profile?.id ? await prisma.whatsappLideranca.findMany({
    where: { candidateIds: { has: profile.id } } as any,
    include: { groups: { include: { members: true } }, user: true }
  }) : [];

  // A aba do WhatsApp deve aparecer quando houver perfil manual OU estrutura (lideranças/grupos) cadastrada manualmente.
  const hasWhatsappData = hasWhatsapp || whatsappLiderancas.length > 0;

  // Busca lista de clientes reais (Usuarios) para quem for de nivel Gerencial
  let allUsers: any[] = [];
  if (userRole === 'LIDER_CHAPA' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    allUsers = await (prisma.user.findMany as any)({
      orderBy: { createdAt: 'desc' },
      include: {
        candidateProfile: { include: { socialProfiles: true } },
        party: true,
        slate: true,
        whatsappLiderancas: true
      }
    });
  }

  // 1. Busca o primeiro instagram profile ativo no sistema se o admin quiser ver no dashboard global
  // REVERTIDO: O Admin root não deve incorporar dados de candidatos arbitrários.

  let globalTopInteractors: any[] = [];
  let globalInteractionsSum = 1;
  let globalWhatsappLiderancas: any[] = [];
  let globalHasInstagram = false;

  // 2. Busca os dados para painel global (APENAS se o admin quiser ver tudo junto, ou nada se ele quiser neutro)
  if (isAdminOrSuper && !isImpersonating) {
      // Se quisermos manter neutro/vazio como antes:
      globalTopInteractors = [];
      globalWhatsappLiderancas = [];
      globalHasInstagram = false;
  }

  // 3. Candidate/Admin Personal View (Dashboard) OR Impersonated View
  if (userRole === 'CANDIDATO' || isImpersonating) {
    const candidateData = userData;

    // Busca de Liderancas reais
    let topInteractors: any[] = [];
    let totalInteractionsSum = 1; // Fallback caso não haja
    if (profile) {
      topInteractors = await prisma.userInteraction.findMany({
        where: { candidateId: profile.id },
        orderBy: { interactionScore: 'desc' },
        take: 10,
        select: { username: true, interactionScore: true }
      });

      const agg = await prisma.userInteraction.aggregate({
        where: { candidateId: profile.id },
        _sum: { interactionScore: true }
      });
      totalInteractionsSum = agg._sum.interactionScore || 1;
    }

    // Calculo Real das Metricas a partir do Instagram (Agora lendo Posts reais em todos os fluxos)
    let likes = 0; let comments = 0; let engagement = 0;
    if (instagramProfile) {
      const dbPosts = await prisma.mediaPost.findMany({
        where: { socialProfileId: instagramProfile.id }
      });

      dbPosts.forEach((post) => {
        likes += post.likesCount || 0;
        comments += post.commentsCount || 0;
      });

      const followers = instagramProfile.followers || 0;
      if (followers > 0 && dbPosts.length > 0) {
          const avgInteractionsPerPost = (likes + comments) / dbPosts.length;
          engagement = (avgInteractionsPerPost / followers) * 100;
      } else {
          engagement = Number(instagramProfile.engagement) || 0;
      }
    }

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const formatK = (num: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(num);

    const metrics = {
      followers: instagramProfile?.followers || 0,
      likes: likes || 0,
      mentions: topInteractors.reduce((acc, curr) => acc + curr.interactionScore, 0) || 0,
      comments: comments || 0,
      engagement: engagement.toFixed(1),
      whatsapp: whatsappMessages || 0,
      polls: 0
    };

    // --- CÁLCULO DE ENGAJAMENTO GERAL (Meta + WhatsApp) ---
    let totalWppCurrentMembers = 0;
    let totalWppInteractions = 0;
    
    whatsappLiderancas.forEach((l: any) => {
        totalWppCurrentMembers += (l.currentMembers || 0);
        totalWppInteractions += (l.entryCount || 0) + (l.exitCount || 0);
        if (l.groups) {
            l.groups.forEach((g: any) => {
                totalWppCurrentMembers += (g.currentMembers || 0);
                totalWppInteractions += (g.entryCount || 0) + (g.exitCount || 0);
            });
        }
    });

    const wppEngagement = totalWppCurrentMembers > 0 
        ? Math.min(100, Math.round((totalWppInteractions / totalWppCurrentMembers) * 1000) / 10) 
        : 0;

    let finalEngagement = 0;
    const instaEngagement = parseFloat(metrics.engagement) || 0;

    if (hasInstagram && totalWppCurrentMembers > 0) {
        // Média simples entre IG e WPP
        finalEngagement = Math.round(((instaEngagement + wppEngagement) / 2) * 10) / 10;
    } else if (hasInstagram) {
        finalEngagement = instaEngagement;
    } else if (totalWppCurrentMembers > 0) {
        finalEngagement = wppEngagement;
    }
    // --------------------------------------------------------

    return (
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Banner de Impersonação - só aparece para Admins vendo outro perfil */}
        {isImpersonating && (
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 rounded-2xl">
            <div className="flex items-center gap-3">
              <EyeIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Modo Visualização de Administrador</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Você está visualizando o painel de <strong>{candidateData?.name}</strong> como observador. Suas ações não afetam a conta deste candidato.</p>
              </div>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300 text-xs font-bold rounded-lg transition-colors shrink-0 border border-amber-200 dark:border-amber-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao meu painel
            </Link>
          </div>
        )}
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 py-2">
          <div className="flex items-center space-x-4">
            {candidateData?.image ? (
              <img src={candidateData.image} alt="" className="w-14 h-14 rounded-full border border-gray-200 shadow-sm object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 shadow-sm border border-slate-200 dark:border-slate-700">
                <span className="text-xl font-bold">{candidateData?.name?.[0]}</span>
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-[1.35rem] font-bold text-slate-900 dark:text-white leading-tight">{candidateData?.name || 'Donald Trump'}</h1>
              <p className="text-sm font-medium text-slate-400 dark:text-slate-500 mb-2">
                {userData?.party ? `${userData.party.name} (${userData.party.code})` : 'Sem Partido'}
                {userData?.slate ? ` • Chapa: ${userData.slate.name}` : ''}
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${hasInstagram ? 'bg-pink-50 border-pink-200 text-pink-700 dark:bg-pink-950/30 dark:border-pink-900/50 dark:text-pink-400' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400'}`}>
                  <Instagram className="w-3.5 h-3.5" />
                  Instagram
                  <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${hasInstagram ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${hasFacebook ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-400' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400'}`}>
                  <Facebook className="w-3.5 h-3.5" />
                  Facebook
                  <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${hasFacebook ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${hasWhatsapp ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900/50 dark:text-green-400' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400'}`}>
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                  <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${hasWhatsapp ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                </span>
              </div>
            </div>
          </div>

          {/* Botões de ação: ocultos no modo impersonação pra não alterar conta alheia */}
          {!isImpersonating && (
            <div className="flex flex-col md:flex-row flex-wrap items-stretch lg:items-center gap-3 w-full md:w-auto mt-4 lg:mt-0">
              <div className="w-full md:w-auto flex-1 md:flex-none">
                <ConnectInstagramButton
                  isConnected={!!instagramProfile}
                  instagramUsername={instagramProfile?.handle}
                />
              </div>
              <Button variant="outline" className="w-full md:w-auto justify-center gap-2 bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm font-medium rounded-lg h-[44px]">
                <Settings className="w-4 h-4 text-slate-500" />
                Atualizar Dados
              </Button>
            </div>
          )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <MetricCard isManual={(instagramProfile as any)?.isManual} isAdmin={isAdmin} icon={Users} label="Seguidores" value={hasInstagram ? formatK(metrics.followers) : '-'} color={hasInstagram ? "pink" : "gray"} tooltip="Número total de seguidores do perfil do Instagram conectado." />
          <MetricCard isManual={(instagramProfile as any)?.isManual} isAdmin={isAdmin} icon={Heart} label="Curtidas" value={hasInstagram ? formatK(metrics.likes) : '-'} color={hasInstagram ? "red" : "gray"} tooltip="Soma de todas as curtidas nos posts sincronizados do Instagram." />
          <MetricCard isManual={(instagramProfile as any)?.isManual} isAdmin={isAdmin} icon={Share2} label="Menções" value={hasInstagram ? formatK(metrics.mentions) : '-'} color={hasInstagram ? "blue" : "gray"} tooltip="Pontuação acumulada de interação dos top seguidores. Calculada como: soma dos scores de cada comentarista (comentários × peso de sentimento × multiplicador de influência por curtidas)." />
          <MetricCard isManual={(instagramProfile as any)?.isManual} isAdmin={isAdmin} icon={MessageCircle} label="Comentários" value={hasInstagram ? formatK(metrics.comments) : '-'} color={hasInstagram ? "green" : "gray"} tooltip="Total de comentários únicos registrados nos posts sincronizados do Instagram." />
          <MetricCard isManual={!!(whatsappProfile as any)?.isManual} isAdmin={isAdmin} icon={Users} label="Membros WhatsApp" value={hasWhatsapp ? formatK(metrics.whatsapp) : '-'} color={hasWhatsapp ? "purple" : "gray"} tooltip="Número total de membros ativos somados de todos os grupos das suas lideranças no WhatsApp." />
          <MetricCard isManual={(instagramProfile as any)?.isManual} isAdmin={isAdmin} icon={TrendingUp} label="Engajamento" value={finalEngagement > 0 ? `${finalEngagement}%` : '-'} color={finalEngagement > 0 ? "yellow" : "gray"} tooltip="Média ponderada: Instagram = ((curtidas + comentários) ÷ posts ÷ seguidores × 100). WhatsApp = ((entradas + saídas) ÷ membros × 100). Quando ambos presentes, média simples dos dois." />
        </div>

        {/* Tab Navigation & Detailed Views */}
        <ClientDashboardTabs
          hasInstagram={hasInstagram}
          hasFacebook={hasFacebook}
          hasWhatsapp={hasWhatsappData}
          whatsappMessages={whatsappMessages}
          whatsappLiderancas={whatsappLiderancas}
          superFans={topInteractors}
          totalInteractions={totalInteractionsSum}
          userRole={userRole as string}
          allUsers={allUsers}
          viewAsUserId={viewAsId || undefined}
          candidateProfileId={profile?.id}
        />
      </div>
    );
  }

  // 4. Admin View (Dashboard)
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Painel Administrativo</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Status Card */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg col-span-1">
          <dt className="text-indigo-100 text-sm font-medium">Sessão Ativa</dt>
          <dd className="mt-2 text-3xl font-bold">{userRole}</dd>
          <p className="mt-4 text-indigo-100 text-sm">Acesso total ao sistema.</p>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 col-span-1 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Atalhos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a href="/users" className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Gerenciar Usuários</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Controle de acessos.</p>
              </div>
            </a>
            <a href="/candidates" className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all flex items-center space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Ver Todos Candidatos</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Visão global.</p>
              </div>
            </a>
          </div>
        </div>

        {/* Integration Status */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 col-span-1 lg:col-span-3">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Integração com Meta</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {!!instagramProfile
                  ? 'Conta conectada e monitorando.'
                  : 'Nenhuma conta conectada neste painel administrativo.'}
              </p>
            </div>
            <ConnectInstagramButton
              isConnected={!!instagramProfile}
              instagramUsername={instagramProfile?.handle}
            />
          </div>
          {!!instagramProfile && (
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              <InstagramStats />
            </div>
          )}
        </div>
      </div>

      {/* Tabs Administrativas para Gestão Global e Visibilidade das Abas */}
      <div className="pt-8 border-t border-gray-200 dark:border-gray-800">
        <ClientDashboardTabs
          hasInstagram={globalHasInstagram || hasInstagram}
          hasFacebook={hasFacebook}
          hasWhatsapp={globalWhatsappLiderancas.length > 0 || hasWhatsapp}
          whatsappMessages={whatsappMessages}
          whatsappLiderancas={globalWhatsappLiderancas.length > 0 ? globalWhatsappLiderancas : whatsappLiderancas}
          superFans={globalTopInteractors}
          totalInteractions={globalInteractionsSum}
          userRole={userRole as string}
          allUsers={allUsers}
        />
      </div>
    </div>
  );
}

import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Dados Base para Geração Realista
// ---------------------------------------------------------------------------

const NOMES_LIDERANCAS = [
  'Zé Augusto Ferreira',
  'Conceição Meirelles',
  'Marcos Evangelista',
  'Rosangela Barros',
  'Djalma Cardoso',
  'Aparecida Nunes',
  'Antônio Rodrigues',
  'Fátima Lopes',
  'Sebastião Lima',
  'Nilza Carvalho',
];

const BAIRROS = [
  'Copacabana',
  'Zona Norte',
  'Méier',
  'Tijuca',
  'Jacarepaguá',
  'Santa Cruz',
  'Campo Grande',
  'Madureira',
  'Ilha do Governador',
  'Botafogo',
];

const PREFIXOS_GRUPOS = [
  'Apoiadores',
  'Comitê',
  'Grupo de Apoio',
  'Movimento',
  'Rede de Suporte',
  'Mobilização',
  'Frente Popular',
  'União do Bairro',
];

const SUFIXOS_GRUPOS = [
  'Zona Sul',
  'Zona Norte',
  'Centro',
  'Bairro Unidos',
  'Comunidade Ativa',
  'Líderes Locais',
  'Comunitário',
  'Jovens',
  'Mães e Famílias',
  'Trabalhadores',
];

const CATEGORIAS_GRUPOS = [
  'MOBILIZAÇÃO',
  'COMUNITÁRIO',
  'LIDERANÇA',
  'JOVENS',
  'FEMININO',
  'RELIGIOSO',
];

const NOMES_PESSOAS = [
  'Ana Silva', 'Bruno Costa', 'Carla Mendes', 'Diego Souza', 'Elena Rocha',
  'Felipe Alves', 'Gabriela Lima', 'Henrique Dias', 'Isabela Nunes', 'João Pedro',
  'Karina Freitas', 'Lucas Martins', 'Mariana Teixeira', 'Nicolas Barbosa', 'Olivia Campos',
  'Paulo Henrique', 'Rafaela Gomes', 'Samuel Ribeiro', 'Tatiana Pires', 'Vitor Azevedo',
  'Wesley Moura', 'Yasmin Cardoso', 'Zeca Pagodinho', 'Amanda Cruz', 'Bernardo Lopes',
];

const SOBRENOMES_IG = ['silva', 'costa', 'mendes', 'souza', 'rocha', 'alves', 'lima', 'dias', 'nunes', 'martins'];

const PROFISSOES = [
  'Comerciante',
  'Professora',
  'Vereador',
  'Liderança Religiosa',
  'Aposentado',
  'Motorista',
  'Empresário',
  'Assistente Social',
];

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gerarNomeGrupo(bairro: string, idx: number): string {
  const prefixo = pick(PREFIXOS_GRUPOS);
  const sufixo = pick(SUFIXOS_GRUPOS);
  const num = idx > 0 ? ` ${idx + 1}` : '';
  return `${prefixo} ${bairro}${num} – ${sufixo}`.trim();
}

function gerarPhone(): string {
  return `+55119${randInt(10000000, 99999999)}`;
}

function gerarIgHandle(nome: string): string {
  const base = nome.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${base}_${pick(SOBRENOMES_IG)}${randInt(1, 99)}`;
}

function gerarFbHandle(nome: string): string {
  const parts = nome.toLowerCase().split(' ');
  return `${parts[0]}.${parts[parts.length - 1] || 'user'}${randInt(10, 99)}`;
}

async function seedMembersForGroup(db: any, groupId: string): Promise<number> {
  const existing = await db.whatsappGroupMember.count({ where: { groupId } });
  if (existing > 0) return 0;

  const qtd = randInt(8, 15);
  const nomes = shuffle(NOMES_PESSOAS).slice(0, qtd);
  let created = 0;

  for (const nome of nomes) {
    await db.whatsappGroupMember.create({
      data: {
        groupId,
        name: nome,
        phone: gerarPhone(),
        instagramHandle: gerarIgHandle(nome),
        facebookHandle: gerarFbHandle(nome),
        pollVotes: randInt(0, 3),
        isManual: true,
      },
    });
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SeedSummary {
  liderancasCriadas: number;
  liderancasExistentes: number;
  gruposCriados: number;
  membrosCriados: number;
  totalCurrentMembers: number;
  totalEntries: number;
  totalExits: number;
}

// ---------------------------------------------------------------------------
// Função Principal de Seed (aceita prisma injetado ou cria próprio)
// ---------------------------------------------------------------------------

export async function seedWhatsappMockData(
  candidateProfileId: string,
  prismaClient?: any
): Promise<SeedSummary> {
  // Usa instância injetada (Next.js singleton) ou cria nova (CLI)
  const db: PrismaClient = prismaClient ?? new PrismaClient();
  const shouldDisconnect = !prismaClient;

  try {
    // Valida se candidateProfile existe
    const candidateProfile = await db.candidateProfile.findUnique({
      where: { id: candidateProfileId },
    });

    if (!candidateProfile) {
      throw new Error(`CandidateProfile não encontrado com ID: ${candidateProfileId}`);
    }

    let totalCurrentMembersGlobal = 0;
    let totalEntriesGlobal = 0;
    let totalExitsGlobal = 0;
    let liderancasCriadas = 0;
    let liderancasExistentes = 0;
    let gruposCriados = 0;
    let membrosCriados = 0;

    // Seleciona 3 lideranças distintas aleatórias (sem repetição)
    const nomesLiderancas = shuffle(NOMES_LIDERANCAS).slice(0, 3);
    const bairros = shuffle(BAIRROS).slice(0, 3);

    for (let i = 0; i < nomesLiderancas.length; i++) {
      const nomeLideranca = `${nomesLiderancas[i]} – ${bairros[i]}`;

      // Idempotência: verifica se liderança já existe para esse candidato
      const liderancaExistente = await db.whatsappLideranca.findFirst({
        where: {
          name: nomeLideranca,
          candidateIds: { has: candidateProfileId },
        } as any,
        include: { groups: true },
      });

      if (liderancaExistente) {
        console.log(`  ↳ Liderança já existe: "${nomeLideranca}" — pulando.`);
        liderancasExistentes++;

        for (const g of liderancaExistente.groups) {
          totalCurrentMembersGlobal += g.currentMembers || 0;
          totalEntriesGlobal += g.entryCount || 0;
          totalExitsGlobal += g.exitCount || 0;
          membrosCriados += await seedMembersForGroup(db, g.id);
        }
        continue;
      }

      // Métricas da liderança (nível da liderança em si)
      const liderancaMembers = randInt(50, 150);
      const liderancaEntries = randInt(30, 100);
      const liderancaExits = randInt(5, 25);
      const liderancaDuplicates = randInt(2, 12);

      // Cria liderança
      const lideranca = await db.whatsappLideranca.create({
        data: {
          name: nomeLideranca,
          candidateIds: [candidateProfileId],
          whatsappHandle: gerarPhone(),
          region: bairros[i],
          neighborhood: bairros[i],
          segment: pick(['Residencial', 'Comercial', 'Misto']),
          profession: pick(PROFISSOES),
          influenceLevel: randInt(5, 10),
          status: 'ATIVO',
          isManual: true,
          currentMembers: liderancaMembers,
          entryCount: liderancaEntries,
          exitCount: liderancaExits,
          duplicateMembers: liderancaDuplicates,
          lastUpdate: new Date(),
        },
      });

      liderancasCriadas++;

      // Gera 3–5 grupos para esta liderança
      const qtdGrupos = randInt(3, 5);
      for (let j = 0; j < qtdGrupos; j++) {
        const currentMembers = randInt(80, 500);
        const entryCount = randInt(40, 250);
        const exitCount = randInt(10, 80);
        const duplicateMembers = randInt(3, 30);

        totalCurrentMembersGlobal += currentMembers;
        totalEntriesGlobal += entryCount;
        totalExitsGlobal += exitCount;

        const grupo = await db.whatsappGroup.create({
          data: {
            name: gerarNomeGrupo(bairros[i], j),
            liderancaId: lideranca.id,
            candidateId: candidateProfileId,
            groupLeaderName: pick(NOMES_LIDERANCAS),
            groupLeaderPhone: gerarPhone(),
            groupType: pick(['ABERTO', 'FECHADO']),
            category: pick(CATEGORIAS_GRUPOS),
            locationRegion: bairros[i],
            description: `Grupo de apoio e mobilização política na região de ${bairros[i]}.`,
            currentMembers,
            entryCount,
            exitCount,
            duplicateMembers,
            pollsCount: randInt(0, 5),
            reactionsCount: randInt(0, 80),
            repliesCount: randInt(0, 120),
            isManual: true,
            lastUpdate: new Date(),
          },
        });

        gruposCriados++;
        membrosCriados += await seedMembersForGroup(db, grupo.id);
      }

      // Acumula métricas da própria liderança
      totalCurrentMembersGlobal += liderancaMembers;
      totalEntriesGlobal += liderancaEntries;
      totalExitsGlobal += liderancaExits;
    }

    // Atualiza o SocialProfile de WHATSAPP do candidato (ou cria, se não existir)
    const whatsappSocialProfile = await db.socialProfile.findFirst({
      where: { candidateId: candidateProfileId, platform: 'WHATSAPP' } as any,
    });

    if (whatsappSocialProfile) {
      await db.socialProfile.update({
        where: { id: whatsappSocialProfile.id },
        data: {
          followers: totalCurrentMembersGlobal,
          isManual: true,
          lastUpdate: new Date(),
        },
      });
    } else {
      await db.socialProfile.create({
        data: {
          candidateId: candidateProfileId,
          platform: 'WHATSAPP' as any,
          handle: 'whatsapp_grupos',
          followers: totalCurrentMembersGlobal,
          isManual: true,
          lastUpdate: new Date(),
        },
      });
    }

    // Sincroniza no campo legado do CandidateProfile
    await db.candidateProfile.update({
      where: { id: candidateProfileId },
      data: { whatsappMessages: totalCurrentMembersGlobal },
    });

    return {
      liderancasCriadas,
      liderancasExistentes,
      gruposCriados,
      membrosCriados,
      totalCurrentMembers: totalCurrentMembersGlobal,
      totalEntries: totalEntriesGlobal,
      totalExits: totalExitsGlobal,
    };
  } finally {
    if (shouldDisconnect) {
      await (db as PrismaClient).$disconnect();
    }
  }
}

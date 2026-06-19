import { PrismaClient } from '@prisma/client';
import { seedWhatsappMockData } from '../lib/whatsapp-seed-data';

const prisma = new PrismaClient();

async function main() {
    const email = process.argv[2] || 'candidato1@chapa1.com';

    const user = await prisma.user.findUnique({
        where: { email },
        include: { candidateProfile: true },
    });

    if (!user?.candidateProfile) {
        throw new Error(`Candidato não encontrado ou sem profile: ${email}`);
    }

    const candidateProfileId = user.candidateProfile.id;
    console.log(`Gerando dados mock para: ${user.name} (${candidateProfileId})`);

    const summary = await seedWhatsappMockData(candidateProfileId, prisma);

    console.log('\n==== RESUMO ====');
    console.log(`Lideranças criadas:  ${summary.liderancasCriadas}`);
    console.log(`Lideranças existentes: ${summary.liderancasExistentes}`);
    console.log(`Grupos criados:      ${summary.gruposCriados}`);
    console.log(`Pessoas criadas:     ${summary.membrosCriados}`);
    console.log(`Total membros (métricas): ${summary.totalCurrentMembers}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

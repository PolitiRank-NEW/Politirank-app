import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Garante que todo usuário com papel CANDIDATO tenha um CandidateProfile.
 * Candidatos criados via API já recebem o profile; os criados pelo seed antigo não.
 * Sem o profile, a entrada manual de dados (estrutura e métricas) fica bloqueada.
 */
async function main() {
    const candidatos = await prisma.user.findMany({
        where: { role: 'CANDIDATO' },
        include: { candidateProfile: true },
    });

    let criados = 0;
    let jaExistiam = 0;

    for (const u of candidatos) {
        if (u.candidateProfile) {
            jaExistiam++;
            continue;
        }
        await prisma.candidateProfile.create({ data: { userId: u.id } });
        criados++;
        console.log(`+ CandidateProfile criado para: ${u.name} <${u.email}>`);
    }

    console.log('\n==== RESUMO ====');
    console.log(`Total de candidatos:        ${candidatos.length}`);
    console.log(`Profiles já existentes:     ${jaExistiam}`);
    console.log(`Profiles criados agora:     ${criados}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

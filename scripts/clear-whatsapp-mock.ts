/**
 * Remove dados de WhatsApp (mock ou reais) de um candidato.
 * Uso: npx tsx scripts/clear-whatsapp-mock.ts <email>
 */
import { PrismaClient, SocialPlatform } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

async function main() {
    const email = process.argv[2] || 'aline.teixiera@politirank.com';

    const user = await prisma.user.findUnique({
        where: { email },
        include: { candidateProfile: true },
    });

    if (!user?.candidateProfile) {
        throw new Error(`Candidato não encontrado: ${email}`);
    }

    const candidateId = user.candidateProfile.id;
    console.log(`Limpando WhatsApp de: ${user.name} (${email})`);
    console.log(`candidateId: ${candidateId}`);

    const groups = await prisma.whatsappGroup.findMany({
        where: { candidateId },
        select: { id: true, name: true },
    });

    const groupIds = groups.map((g) => g.id);

    const membersDeleted = groupIds.length
        ? await prisma.whatsappGroupMember.deleteMany({
              where: { groupId: { in: groupIds } },
          })
        : { count: 0 };

    const groupsDeleted = await prisma.whatsappGroup.deleteMany({
        where: { candidateId },
    });

    const liderancas = await prisma.whatsappLideranca.findMany({
        where: { candidateIds: { has: candidateId } } as never,
        select: { id: true, name: true, candidateIds: true },
    });

    let liderancasDeleted = 0;
    for (const lid of liderancas) {
        const onlyThisCandidate =
            lid.candidateIds.length === 1 && lid.candidateIds[0] === candidateId;

        if (onlyThisCandidate) {
            await prisma.whatsappLideranca.delete({ where: { id: lid.id } });
            liderancasDeleted++;
        } else {
            await prisma.whatsappLideranca.update({
                where: { id: lid.id },
                data: {
                    candidateIds: lid.candidateIds.filter((id) => id !== candidateId),
                },
            });
        }
    }

    await prisma.candidateProfile.update({
        where: { id: candidateId },
        data: {
            whatsappLiderancaIds: [],
            whatsappMessages: 0,
        },
    });

    const wppProfile = await prisma.socialProfile.findFirst({
        where: { candidateId, platform: SocialPlatform.WHATSAPP },
    });

    if (wppProfile) {
        await prisma.socialProfile.delete({ where: { id: wppProfile.id } });
    }

    console.log('---');
    console.log(`Grupos removidos:      ${groupsDeleted.count}`);
    console.log(`Membros removidos:     ${membersDeleted.count}`);
    console.log(`Lideranças removidas:  ${liderancasDeleted}`);
    console.log('Perfil WHATSAPP e métricas zerados.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

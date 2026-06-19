import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log("🔍 Verificando banco de dados...")

    try {
        const count = await prisma.user.count()
        console.log(`✅ Total de usuários encontrados: ${count}`)

        if (count > 0) {
            const users = await prisma.user.findMany()
            console.log("📋 Lista de usuários:")
            users.forEach(u => console.log(` - ${u.name} (${u.email}) [${u.role}]`))
        } else {
            console.log("⚠️ Nenhum usuário encontrado. Rode o seed novamente.")
        }

    } catch (error) {
        console.error("❌ Erro ao conectar no banco:", error)
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })

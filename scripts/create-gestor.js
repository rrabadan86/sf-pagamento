const path = require("path");
process.env.DATABASE_URL = `file:${path.resolve(__dirname, "..", "dev.db")}`;

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
    const prisma = new PrismaClient();
    try {
        const existing = await prisma.gestorUser.findFirst({
            where: { email: "gestor@academia.com" },
        });

        if (existing) {
            console.log("Gestor já existe:", existing.email);
            return;
        }

        const senha = await bcrypt.hash("admin123", 12);
        const user = await prisma.gestorUser.create({
            data: {
                email: "gestor@academia.com",
                senha,
                nome: "Gestor",
            },
        });
        console.log("Gestor criado com sucesso:", user.email);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);

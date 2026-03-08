import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@slimfit.com';
    const senhaStr = 'admin123';

    const existing = await prisma.gestorUser.findUnique({ where: { email } });
    if (existing) {
        console.log('User already exists:', existing);
        return;
    }

    const senha = await (bcrypt.hash ? bcrypt.hash(senhaStr, 10) : require('bcryptjs').hash(senhaStr, 10)).catch(async () => {
        return await require('bcryptjs').hash(senhaStr, 10);
    });

    const user = await prisma.gestorUser.create({
        data: {
            email,
            senha,
            nome: 'Administrador'
        }
    });

    console.log('Created user:', user);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

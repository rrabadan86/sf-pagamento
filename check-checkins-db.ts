import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function run() {
    const total = await prisma.checkin.count();
    console.log('Total checkins no banco:', total);
    
    // Count by month
    const checkins = await prisma.checkin.findMany({ select: { dataHora: true } });
    const byMonth: Record<string, number> = {};
    for (const c of checkins) {
        const key = `${c.dataHora.getFullYear()}-${String(c.dataHora.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
    }
    console.log('\nCheckins por mês:');
    Object.entries(byMonth).sort().forEach(([k,v]) => console.log(`  ${k}: ${v}`));
    
    // Check Feb 2026 specifically
    const fev = await prisma.checkin.findMany({
        where: {
            dataHora: {
                gte: new Date(2026, 1, 1),
                lte: new Date(2026, 1, 28, 23, 59, 59)
            }
        },
        include: { aluno: true },
        orderBy: { dataHora: 'asc' }
    });
    console.log(`\nCheckins Fev/2026: ${fev.length}`);
    fev.slice(0, 20).forEach((c: any) => {
        console.log(`  ${c.dataHora.toISOString()} - ${c.aluno.nome}`);
    });
}

run().catch(console.error);

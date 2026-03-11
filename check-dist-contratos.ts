import { config } from 'dotenv';
config({ path: '.env' });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function run() {
    const total = await prisma.contrato.count();
    console.log('Total contratos no banco:', total);

    // Count by year of membershipEnd (dataFim)
    const contratos = await prisma.contrato.findMany({ select: { dataFim: true, dataInicio: true, nomePlano: true } });
    
    // Bucket by end year
    const byYear: Record<string, number> = {};
    for (const c of contratos) {
        const year = c.dataFim.getFullYear().toString();
        byYear[year] = (byYear[year] || 0) + 1;
    }
    console.log('\nContratos por Ano de Término (dataFim):');
    Object.entries(byYear).sort().forEach(([y, n]) => console.log(`  ${y}: ${n} contratos`));

    // Check Fev 2026 overlap specifically
    const mes = 2;
    const ano = 2026;
    const dataInicioBusca = new Date(ano, mes - 1, 1);
    const dataFimBusca = new Date(ano, mes, 0, 23, 59, 59);

    const fev26 = await prisma.contrato.findMany({
        where: {
            dataInicio: { lte: dataFimBusca },
            dataFim: { gte: dataInicioBusca }
        },
        include: { aluno: true }
    });
    console.log('\nContratos Fev/2026:', fev26.length);
    const unique = new Set(fev26.map((c: any) => c.idAluno));
    console.log('Alunas únicas Fev/2026:', unique.size);
    
    // Also check March 2026
    const mar26 = await prisma.contrato.findMany({
        where: {
            dataInicio: { lte: new Date(2026, 2, 31) },
            dataFim: { gte: new Date(2026, 2, 1) }
        }
    });
    console.log('\nContratos Mar/2026:', mar26.length);
    const uniqueMar = new Set(mar26.map((c: any) => c.idAluno));
    console.log('Alunas únicas Mar/2026:', uniqueMar.size);
}

run();

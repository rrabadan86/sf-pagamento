import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function run() {
    const mar26Start = new Date(2026, 2, 1);
    const mar26End = new Date(2026, 2, 31, 23, 59, 59);
    const fev26Start = new Date(2026, 1, 1);
    const fev26End = new Date(2026, 1, 28, 23, 59, 59);

    // Issue 1: Janaina Paiva - does she have ANY contract in Feb/Mar 2026?
    const janaina = await prisma.aluno.findFirst({ where: { nome: { contains: 'Janaina' } } });
    console.log('Janaina:', janaina?.nome, 'idEvo:', janaina?.idEvo);
    if (janaina) {
        const contratos = await prisma.contrato.findMany({
            where: { idAluno: janaina.idEvo },
            orderBy: { dataFim: 'desc' }
        });
        console.log(`  ${contratos.length} contratos:`);
        contratos.forEach((c: any) => console.log(`    ${c.nomePlano} | ${c.dataInicio.toISOString().substring(0,10)} -> ${c.dataFim.toISOString().substring(0,10)} | status: ${c.status}`));
    }

    // Issue 2: Ana Michele Lima - does she have a FIXO contract?
    const anaMichele = await prisma.aluno.findMany({ where: { nome: { contains: 'Ana Michele' } } });
    console.log('\nAna Michele:', anaMichele.map((a: any) => `${a.nome} (${a.idEvo})`));
    for (const a of anaMichele) {
        const contratos = await prisma.contrato.findMany({
            where: {
                idAluno: a.idEvo,
                OR: [
                    { dataInicio: { lte: mar26End }, dataFim: { gte: mar26Start } }
                ]
            }
        });
        console.log(`  Contratos Mar/2026 para ${a.nome}:`);
        contratos.forEach((c: any) => console.log(`    ${c.nomePlano} | ${c.dataInicio.toISOString().substring(0,10)} -> ${c.dataFim.toISOString().substring(0,10)}`));
        if (contratos.length === 0) {
            const all = await prisma.contrato.findMany({ where: { idAluno: a.idEvo }, orderBy: { dataFim: 'desc' } });
            console.log(`  Todos os contratos (${all.length}):`);
            all.slice(0, 3).forEach((c: any) => console.log(`    ${c.nomePlano} | ${c.dataInicio.toISOString().substring(0,10)} -> ${c.dataFim.toISOString().substring(0,10)}`));
        }
    }

    // Issue 3: Bruna Brandão contracts - does she have BOTH fixo and free?
    const bruna = await prisma.aluno.findFirst({ where: { nome: { contains: 'Bruna Vieira' } } });
    console.log('\nBruna Vieira:', bruna?.nome, 'idEvo:', bruna?.idEvo);
    if (bruna) {
        const contratos = await prisma.contrato.findMany({
            where: {
                idAluno: bruna.idEvo,
                OR: [
                    { dataInicio: { lte: fev26End }, dataFim: { gte: fev26Start } }
                ]
            }
        });
        console.log(`  Contratos Fev/2026:`);
        contratos.forEach((c: any) => console.log(`    ${c.nomePlano} | status: ${c.status} | valor: ${c.valor}`));
    }
}

run().catch(console.error);

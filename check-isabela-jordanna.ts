import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Buscar Isabela
    const isabela = await prisma.aluno.findMany({
        where: { nome: { contains: 'Isabela', mode: 'insensitive' } },
        include: { contratos: true, gradesFixas: true }
    });
    console.log('=== ISABELA ===');
    for (const a of isabela) {
        console.log(`${a.nome} (id: ${a.idEvo})`);
        console.log('  Contratos:', a.contratos.map(c => ({ id: c.idEvo, plano: c.nomePlano, status: c.status, valor: c.valor, inicio: c.dataInicio.toISOString().substring(0,10), fim: c.dataFim.toISOString().substring(0,10) })));
        console.log('  Grades:', a.gradesFixas.map(g => ({ day: g.weekDay, time: g.startTime, status: g.status, start: g.startDate.toISOString().substring(0,10), end: g.endDate?.toISOString().substring(0,10) })));
    }

    // Buscar Jordanna
    const jordanna = await prisma.aluno.findMany({
        where: { nome: { contains: 'Jordanna', mode: 'insensitive' } },
        include: { contratos: true, gradesFixas: true }
    });
    console.log('\n=== JORDANNA ===');
    for (const a of jordanna) {
        console.log(`${a.nome} (id: ${a.idEvo})`);
        console.log('  Contratos:', a.contratos.map(c => ({ id: c.idEvo, plano: c.nomePlano, status: c.status, valor: c.valor, inicio: c.dataInicio.toISOString().substring(0,10), fim: c.dataFim.toISOString().substring(0,10) })));
        console.log('  Grades:', a.gradesFixas.map(g => ({ day: g.weekDay, time: g.startTime, status: g.status, start: g.startDate.toISOString().substring(0,10), end: g.endDate?.toISOString().substring(0,10) })));
    }

    // Check: query getMemberMemberships for March 2026
    const dataInicioBusca = new Date(2026, 2, 1);
    const dataFimBusca = new Date(2026, 3, 0, 23, 59, 59);
    
    const idsToCheck = [...isabela.map(a => a.idEvo), ...jordanna.map(a => a.idEvo)];
    console.log('\n=== CONTRACTS MATCHING MARCH 2026 QUERY ===');
    for (const id of idsToCheck) {
        const contratos = await prisma.contrato.findMany({
            where: {
                idAluno: id,
                OR: [
                    { dataInicio: { lte: dataFimBusca }, dataFim: { gte: dataInicioBusca } }
                ]
            }
        });
        console.log(`ID ${id}: ${contratos.length} contracts match`, contratos.map(c => ({ plano: c.nomePlano, status: c.status, fim: c.dataFim.toISOString().substring(0,10) })));
    }

    await prisma.$disconnect();
}

main().catch(console.error);

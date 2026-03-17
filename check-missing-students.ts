import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Find the missing students by name (partial match)
    const names = ['Fabiana', 'Daniela Rezende', 'Viviane Zielak'];
    
    console.log('=== BUSCANDO ALUNAS ===');
    for (const name of names) {
        const alunos = await prisma.aluno.findMany({
            where: { nome: { contains: name, mode: 'insensitive' } },
            include: { 
                contratos: true,
                gradesFixas: true
            }
        });
        
        console.log(`\n--- ${name} ---`);
        if (alunos.length === 0) {
            console.log('  NENHUMA ALUNA ENCONTRADA!');
            continue;
        }
        
        for (const a of alunos) {
            console.log(`  ID: ${a.idEvo}, Nome: ${a.nome}`);
            console.log(`  Contratos (${a.contratos.length}):`);
            for (const c of a.contratos) {
                console.log(`    - [${c.status}] ${c.nomePlano} | Valor: R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
            }
            console.log(`  Grades Fixas (${a.gradesFixas.length}):`);
            for (const g of a.gradesFixas) {
                const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
                console.log(`    - ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
            }
        }
    }
    
    // 2. Check contract date filtering for March 2026
    console.log('\n\n=== CONTRATOS QUE SERÃO RETORNADOS PARA MARÇO/2026 ===');
    const dataInicioBusca = new Date(2026, 2, 1); // March 1, 2026
    const dataFimBusca = new Date(2026, 3, 0, 23, 59, 59); // March 31, 2026
    
    console.log(`Busca: ${dataInicioBusca.toISOString()} até ${dataFimBusca.toISOString()}`);
    
    const contratosMarco = await prisma.contrato.findMany({
        where: {
            OR: [
                {
                    dataInicio: { lte: dataFimBusca },
                    dataFim: { gte: dataInicioBusca }
                }
            ]
        },
        include: { aluno: true }
    });
    
    // Filter for our missing students
    const missing = ['fabiana', 'daniela rezende', 'viviane zielak'];
    const found = contratosMarco.filter(c => 
        missing.some(name => c.aluno.nome.toLowerCase().includes(name))
    );
    
    console.log(`\nTotal contratos ativos em março: ${contratosMarco.length}`);
    console.log(`Contratos das alunas faltantes: ${found.length}`);
    for (const c of found) {
        console.log(`  ${c.aluno.nome}: [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
    }
    
    if (found.length === 0) {
        console.log('\n  >>> PROBLEMA IDENTIFICADO: Nenhum contrato dessas alunas cobre março/2026!');
        // Search ALL contracts for these students
        console.log('\n=== TODOS OS CONTRATOS DESSAS ALUNAS (sem filtro de data) ===');
        for (const name of missing) {
            const alunos = await prisma.aluno.findMany({
                where: { nome: { contains: name, mode: 'insensitive' } },
                include: { contratos: true }
            });
            for (const a of alunos) {
                for (const c of a.contratos) {
                    console.log(`  ${a.nome}: [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
                }
            }
        }
    }
    
    await prisma.$disconnect();
}

main().catch(console.error);

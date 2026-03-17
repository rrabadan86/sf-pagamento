import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Check Viviane with broader search
    console.log('=== Buscando Viviane ===');
    const vivianes = await prisma.aluno.findMany({
        where: { nome: { contains: 'Viviane', mode: 'insensitive' } },
        include: { contratos: true, gradesFixas: true }
    });
    console.log(`Resultados: ${vivianes.length}`);
    for (const v of vivianes) {
        console.log(`  ID: ${v.idEvo}, Nome: ${v.nome}`);
        console.log(`  Contratos: ${v.contratos.length}`);
        for (const c of v.contratos) {
            console.log(`    - [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
        }
        console.log(`  Grades Fixas: ${v.gradesFixas.length}`);
        for (const g of v.gradesFixas) {
            const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
            console.log(`    - ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
        }
    }
    
    // Also check by ID 4017 (from the screenshot)
    console.log('\n=== Buscando por ID 4017 ===');
    const byId = await prisma.aluno.findUnique({ 
        where: { idEvo: '4017' },
        include: { contratos: true, gradesFixas: true }
    });
    if (byId) {
        console.log(`  Nome: ${byId.nome}`);
        console.log(`  Contratos: ${byId.contratos.length}`);
        for (const c of byId.contratos) {
            console.log(`    - [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
        }
    } else {
        console.log('  NÃO ENCONTRADO');
    }
    
    // Now the key question: check Fabiana (5058) - 
    // Her fixed schedule for Monday 07:00 has status=2 and endDate=2025-05-12
    // But she clearly still attends on Mondays as shown in the system screenshot
    // The issue is her GRADE was updated to Qua (Wednesday) only
    
    console.log('\n=== Análise do Problema ===');
    console.log('Fabiana (5058):');
    console.log('  Grade fixa Seg 07:00 -> status=2, endDate=2025-05-12 (REMOVIDA)');
    console.log('  Grade fixa Qua 07:00 -> status=1, startDate=2025-05-14 (ATIVA)');
    console.log('  => Na segunda-feira 02/03/2026, ehOficialmenteDela = FALSE');
    console.log('  => isFixoEmReposicao = TRUE');
    console.log('  => Sem contrato FREE -> DESCARTADA!');
    
    console.log('\nDaniela (6215):');
    console.log('  Grade fixa Seg 07:00 -> status=2, endDate=2025-05-05 (REMOVIDA)');
    console.log('  Grade fixa Sex 07:00 -> status=1, startDate=2025-05-05 (ATIVA na SEXTA)');
    console.log('  => Na segunda-feira 02/03/2026, ehOficialmenteDela = FALSE');
    console.log('  => isFixoEmReposicao = TRUE');
    console.log('  => Sem contrato FREE -> DESCARTADA!');

    // Check what Daniela's NEW schedule looks like
    // She has 3x/semana plan - which days?
    console.log('\nDaniela - Grades fixas ativas (status=1):');
    const danielaGrades = await prisma.gradeFixaAluno.findMany({
        where: { idAluno: '6215', status: 1 }
    });
    for (const g of danielaGrades) {
        const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
        console.log(`  ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
    }

    console.log('\nFabiana - Grades fixas ativas (status=1):');
    const fabianaGrades = await prisma.gradeFixaAluno.findMany({
        where: { idAluno: '5058', status: 1 }
    });
    for (const g of fabianaGrades) {
        const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
        console.log(`  ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
    }

    await prisma.$disconnect();
}

main().catch(console.error);

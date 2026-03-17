import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Check Vivianne's fixed schedules
    console.log('=== Vivianne (4017) - ALL Grades Fixas ===');
    const grades = await prisma.gradeFixaAluno.findMany({
        where: { idAluno: '4017' }
    });
    const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
    for (const g of grades) {
        console.log(`  ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
    }
    
    // Check if Vivianne's contract is included in March 2026 query
    const dataInicioBusca = new Date(2026, 2, 1); // March 1, 2026
    const dataFimBusca = new Date(2026, 3, 0, 23, 59, 59); // March 31, 2026
    
    const contratos = await prisma.contrato.findMany({
        where: {
            idAluno: '4017',
            OR: [
                {
                    dataInicio: { lte: dataFimBusca },
                    dataFim: { gte: dataInicioBusca }
                }
            ]
        },
        include: { aluno: true }
    });
    
    console.log(`\n=== Contratos de Vivianne válidos para Março/2026 ===`);
    console.log(`Encontrados: ${contratos.length}`);
    for (const c of contratos) {
        console.log(`  [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
    }

    // Count how many students may be affected by this bug — students with active contracts
    // but no active fixed schedule for a weekday they attend
    console.log('\n=== Potencialmente Afetadas: alunas com contratos ativos mas sem grade ativa para algum dia ===');
    // Get all students with active contracts for March 2026
    const allContratos = await prisma.contrato.findMany({
        where: {
            dataInicio: { lte: dataFimBusca },
            dataFim: { gte: dataInicioBusca }
        },
        include: { aluno: true }
    });
    
    // Get unique student IDs
    const alunaIds = [...new Set(allContratos.map(c => c.idAluno))];
    
    // For each student, check if they have any active fixed schedule
    const semGradeAtiva: string[] = [];
    for (const id of alunaIds) {
        const gradesAtivas = await prisma.gradeFixaAluno.findMany({
            where: { idAluno: id, status: 1 }
        });
        if (gradesAtivas.length === 0) {
            const nome = allContratos.find(c => c.idAluno === id)?.aluno.nome || 'Desconhecida';
            const contratosAluna = allContratos.filter(c => c.idAluno === id);
            const planos = contratosAluna.map(c => c.nomePlano).join(', ');
            semGradeAtiva.push(`  ${nome} (${id}) - Planos: ${planos}`);
        }
    }
    
    // Also check students whose active schedules don't match the EVO sessions they attend
    // (like Fabiana who has Qua active but attends Seg)
    console.log(`\nAlunas com contrato ativo mas SEM grade fixa ativa: ${semGradeAtiva.length}`);
    for (const s of semGradeAtiva) {
        console.log(s);
    }

    await prisma.$disconnect();
}

main().catch(console.error);

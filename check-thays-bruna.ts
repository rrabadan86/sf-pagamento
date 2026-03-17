import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { getMemberFixedSchedules } from './lib/evo/enrollments';

const prisma = new PrismaClient();
const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];

async function main() {
    // ============================================================
    // ISSUE 1: Thays da Silva Omoto - reposição aparecendo como fixo
    // ============================================================
    console.log('=== THAYS DA SILVA OMOTO ===');
    const thays = await prisma.aluno.findMany({
        where: { nome: { contains: 'Thays', mode: 'insensitive' } },
        include: { contratos: true, gradesFixas: true }
    });
    for (const a of thays) {
        console.log(`ID: ${a.idEvo}, Nome: ${a.nome}`);
        console.log('  Contratos:');
        for (const c of a.contratos) {
            console.log(`    [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
        }
        console.log('  Grades Fixas (BD local):');
        for (const g of a.gradesFixas) {
            const tag = g.status === 1 ? '✅' : '❌';
            console.log(`    ${tag} ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
        }
        
        // Buscar da EVO API
        console.log('  Grades da EVO API:');
        const evoGrades = await getMemberFixedSchedules(parseInt(a.idEvo));
        for (const g of evoGrades) {
            const tag = g.status === 1 ? '✅' : '❌';
            console.log(`    ${tag} ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate?.substring(0,10)} até ${g.endDate?.substring(0,10) || 'NULL'}`);
        }
        
        const ativas = evoGrades.filter(g => g.status === 1);
        console.log(`  → Grades ativas na EVO: ${ativas.length}`);
        for (const g of ativas) {
            console.log(`    ✅ ${dias[g.weekDay]} ${g.startTime}`);
        }
    }

    // ============================================================
    // ISSUE 2: Bruna Vieira Brandão - free 3x mostrando como fixo
    // ============================================================
    console.log('\n=== BRUNA VIEIRA BRANDÃO ===');
    const bruna = await prisma.aluno.findMany({
        where: { nome: { contains: 'Bruna Vieira', mode: 'insensitive' } },
        include: { contratos: true }
    });
    for (const a of bruna) {
        console.log(`ID: ${a.idEvo}, Nome: ${a.nome}`);
        console.log('  Contratos:');
        
        const dataInicioBusca = new Date(2026, 2, 1);
        const dataFimBusca = new Date(2026, 3, 0, 23, 59, 59);
        
        for (const c of a.contratos) {
            const start = new Date(c.dataInicio);
            const end = new Date(c.dataFim);
            const vigente = start <= dataFimBusca && end >= dataInicioBusca ? '📅 VIGENTE' : '';
            const lower = c.nomePlano.toLowerCase();
            const isFree = lower.includes('free') || lower.includes('vip');
            const isFixa = lower.includes('fixa') || lower.includes('recorrente');
            const tipo = isFree ? 'FREE' : isFixa ? 'FIXO' : 'FIXO';
            
            console.log(`    [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)} ${vigente} → tipo=${tipo}`);
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);

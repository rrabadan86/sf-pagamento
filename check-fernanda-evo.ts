import 'dotenv/config';
import { getMemberFixedSchedules } from './lib/evo/enrollments';

const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];

async function main() {
    console.log('=== EVO API - Fernanda Siqueira (5310) ===');
    const grades = await getMemberFixedSchedules(5310);
    console.log(`Total enrollments: ${grades.length}\n`);
    
    for (const g of grades) {
        const tag = g.status === 1 ? '✅ ATIVO' : '❌ REMOVIDO';
        console.log(`  [${tag}] ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | idActivity=${g.idActivity} | ${g.startDate?.substring(0,10)} até ${g.endDate?.substring(0,10) || 'NULL'}`);
    }
    
    const ativos = grades.filter(g => g.status === 1);
    console.log(`\nAtivos: ${ativos.length}  |  Removidos: ${grades.length - ativos.length}`);
}

main().catch(console.error);

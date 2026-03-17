import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { getMemberFixedSchedules } from './lib/evo/enrollments';

const prisma = new PrismaClient();
const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];

async function main() {
    // Fabiana dos Santos Reis (ID 5058 do debug anterior)
    console.log('=== FABIANA - BD LOCAL ===');
    const fab = await prisma.gradeFixaAluno.findMany({ where: { idAluno: '5058' } });
    for (const g of fab) {
        const tag = g.status === 1 ? '✅ ATIVO' : '❌ REMOVIDO';
        console.log(`  [${tag}] ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
    }

    console.log('\n=== FABIANA - EVO API ===');
    const evoGrades = await getMemberFixedSchedules(5058);
    console.log(`Total: ${evoGrades.length}`);
    for (const g of evoGrades) {
        const tag = g.status === 1 ? '✅ ATIVO' : '❌ REMOVIDO';
        console.log(`  [${tag}] ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | idActivity=${g.idActivity} | ${g.startDate?.substring(0,10)} até ${g.endDate?.substring(0,10) || 'NULL'}`);
    }
    
    // Mostrar o problema: mesma chave para ativo e removido?
    const chaves = new Map<string, typeof evoGrades>();
    for (const g of evoGrades) {
        const key = `${g.idActivity}_${g.weekDay}_${g.startTime}`;
        if (!chaves.has(key)) chaves.set(key, []);
        chaves.get(key)!.push(g);
    }
    console.log('\n=== CONFLITOS DE CHAVE ===');
    for (const [key, entries] of chaves) {
        if (entries.length > 1) {
            console.log(`  Chave: ${key} → ${entries.length} registros (CONFLITO!)`);
            for (const e of entries) {
                console.log(`    status=${e.status} | ${e.startDate?.substring(0,10)} até ${e.endDate?.substring(0,10) || 'NULL'}`);
            }
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);

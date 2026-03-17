import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { getMemberFixedSchedules } from './lib/evo/enrollments';

const prisma = new PrismaClient();

// Alunas com grade desatualizada no BD
const ALUNAS = [
    { id: 4643, nome: 'Isabela Costa Cunha Ribeiro' },
    { id: 3728, nome: 'Jordanna Porto Silva' },
];

async function main() {
    for (const aluna of ALUNAS) {
        console.log(`\n=== Sincronizando: ${aluna.nome} (${aluna.id}) ===`);
        const grades = await getMemberFixedSchedules(aluna.id);
        console.log(`EVO retornou ${grades.length} registros`);

        // Ordenar: removidos (status=2) primeiro, ativos (status=1) por último
        const gradesSorted = [...grades].sort((a, b) => (b.status ?? 1) - (a.status ?? 1));

        let count = 0;
        for (const g of gradesSorted) {
            if (!g.idActivity || g.weekDay == null || !g.startTime || !g.startDate) continue;
            const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
            console.log(`  ${dias[g.weekDay]} ${g.startTime} status=${g.status} start=${g.startDate?.substring(0,10)} end=${g.endDate?.substring(0,10) ?? 'null'}`);
            
            await prisma.gradeFixaAluno.upsert({
                where: {
                    idAluno_idActivity_weekDay_startTime: {
                        idAluno: aluna.id.toString(),
                        idActivity: g.idActivity,
                        weekDay: g.weekDay,
                        startTime: g.startTime,
                    }
                },
                update: {
                    activityName: g.activityName || '',
                    status: g.status ?? 1,
                    startDate: new Date(g.startDate),
                    endDate: g.endDate ? new Date(g.endDate) : null,
                },
                create: {
                    idAluno: aluna.id.toString(),
                    idActivity: g.idActivity,
                    activityName: g.activityName || '',
                    weekDay: g.weekDay,
                    startTime: g.startTime,
                    status: g.status ?? 1,
                    startDate: new Date(g.startDate),
                    endDate: g.endDate ? new Date(g.endDate) : null,
                }
            });
            count++;
        }
        console.log(`  ✅ ${count} registros salvos`);

        // Mostrar o estado final no BD
        const final = await prisma.gradeFixaAluno.findMany({ where: { idAluno: aluna.id.toString() } });
        const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        console.log('  BD após sync:');
        final.forEach(r => console.log(`    ${dias[r.weekDay]} ${r.startTime} status=${r.status} start=${r.startDate.toISOString().substring(0,10)} end=${r.endDate?.toISOString().substring(0,10) ?? 'null'}`));
    }

    await prisma.$disconnect();
    console.log('\n✅ Concluído!');
}

main().catch(console.error);

require("dotenv").config({ path: ".env.local" });
const { getSchedule } = require("../lib/evo/queries");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function test() {
    const mes = 2, ano = 2026;
    const schedule = await getSchedule(mes, ano);

    const porProfessor = {};
    for (const aula of schedule) {
        const pid = String(aula.instructorId);
        if (!porProfessor[pid]) {
            porProfessor[pid] = { nomeProfessor: aula.instructor, turmas: {} };
        }
        if (!porProfessor[pid].turmas[aula.name]) {
            porProfessor[pid].turmas[aula.name] = [];
        }
        porProfessor[pid].turmas[aula.name].push(aula);
    }

    console.log("Professores encontrados (keys):", Object.keys(porProfessor));
    console.log("Nomes dos professores:", Object.values(porProfessor).map(p => p.nomeProfessor));

    // Print number of classes per professor
    for (const p of Object.values(porProfessor)) {
        console.log(`\nProf: ${p.nomeProfessor}`);
        for (const [turma, aulas] of Object.entries(p.turmas)) {
            console.log(`  - ${turma}: ${aulas.length} aula(s)`);
        }
    }

    await prisma.$disconnect();
}

test().catch(console.error);

import { config } from "dotenv";
config({ path: ".env.local" });
import { getSchedule } from "../lib/evo/queries";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function test() {
    const mes = 2, ano = 2026;
    const schedule = await getSchedule(mes, ano);

    const porProfessor: Record<string, any> = {};
    for (const aula of schedule) {
        const pid = aula.instructor || "Desconhecido";
        if (!porProfessor[pid]) {
            porProfessor[pid] = { nomeProfessor: pid, turmas: {} };
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
            console.log(`  - ${turma}: ${(aulas as any[]).length} aula(s) unicas no mes`);
        }
    }

    await prisma.$disconnect();
}

test().catch(console.error);

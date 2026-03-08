import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

// GET /api/professores — lista todos com percentual atual
export async function GET() {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    // Agrupa por professor e pega o mais recente
    const todos = await prisma.professorPercentual.findMany({
        orderBy: { dataInicio: "desc" },
    });

    // Dedup — pega só o registro mais recente por professor
    const map = new Map<string, typeof todos[0]>();
    for (const p of todos) {
        if (!map.has(p.idProfessorEvo)) map.set(p.idProfessorEvo, p);
    }

    // Histórico completo por professor
    const professores = await Promise.all(
        Array.from(map.values()).map(async (p) => {
            const historico = await prisma.professorPercentual.findMany({
                where: { idProfessorEvo: p.idProfessorEvo },
                orderBy: { dataInicio: "desc" },
            });
            return {
                idProfessorEvo: p.idProfessorEvo,
                nomeProfessor: p.nomeProfessor,
                percentualAtual: p.percentual,
                pisoAtual: p.piso,
                tetoAtual: p.teto,
                historico,
            };
        })
    );

    professores.sort((a, b) => a.nomeProfessor.localeCompare(b.nomeProfessor));
    return NextResponse.json({ professores });
}

// PUT /api/professores — atualiza percentual
export async function PUT(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json();
    const { idProfessorEvo, nomeProfessor, percentual, piso, teto } = body;

    if (typeof percentual !== "number" || percentual < 0 || percentual > 100) {
        return NextResponse.json({ error: "Percentual inválido (0–100)" }, { status: 400 });
    }
    if (typeof piso !== "number" || typeof teto !== "number") {
        return NextResponse.json({ error: "Piso/Teto inválidos" }, { status: 400 });
    }

    const novo = await prisma.professorPercentual.create({
        data: {
            idProfessorEvo: String(idProfessorEvo),
            nomeProfessor,
            percentual,
            piso,
            teto,
            dataInicio: new Date(),
        },
    });

    return NextResponse.json({ success: true, registro: novo });
}

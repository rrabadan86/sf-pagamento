import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Diagnóstico protegido por secret: mostra o que o banco local e a EVO têm de
// contratos para uma aluna (busca por nome). Ajuda a entender por que a grade
// escolhe um plano antigo em vez do atual.
// GET /api/debug/aluno?nome=hiva&secret=...
export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nome = req.nextUrl.searchParams.get("nome") ?? "";
    if (!nome) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });

    const alunos = await prisma.aluno.findMany({
        where: { nome: { contains: nome } },
        include: { contratos: true },
    });

    const saida: unknown[] = [];
    for (const a of alunos) {
        const idMember = parseInt(a.idEvo);
        let evoContratos: unknown = null;
        try {
            // Todos os contratos da aluna direto da EVO (qualquer status)
            evoContratos = await evoFetchPaginated<unknown>("/api/v3/membermembership", {
                idMember,
                take: 50,
            });
        } catch (e: any) {
            evoContratos = { erro: e.message };
        }

        saida.push({
            idEvo: a.idEvo,
            nome: a.nome,
            contratosBancoLocal: a.contratos.map((c) => ({
                idEvo: c.idEvo,
                nomePlano: c.nomePlano,
                status: c.status,
                valor: c.valor,
                dataInicio: c.dataInicio,
                dataFim: c.dataFim,
            })),
            contratosEvoBruto: evoContratos,
        });
    }

    return NextResponse.json({ nome, encontrados: alunos.length, alunos: saida }, { status: 200 });
}

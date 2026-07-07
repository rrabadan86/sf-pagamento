import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Endpoint: ressincroniza os CONTRATOS (memberships) da EVO para a tabela local.
// O bulk v3/membermembership NÃO retorna a maioria dos contratos (planos RECORRENTE
// ficam de fora), então buscamos ALUNA POR ALUNA — o único jeito que traz a data de
// vencimento correta. Para cada aluna, SUBSTITUI os contratos locais (delete + insert),
// eliminando registros antigos de seed com datas velhas.
//
// GET /api/cron/refresh-memberships?secret=...
// Paginação opcional (se estourar 300s): &skip=0&take=150 e depois &skip=150
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const secretParam = request.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const skip = parseInt(request.nextUrl.searchParams.get("skip") ?? "0");
    const takeParam = request.nextUrl.searchParams.get("take");

    try {
        const alunos = await prisma.aluno.findMany({ select: { idEvo: true }, orderBy: { idEvo: "asc" } });
        const todosIds = alunos.map(a => a.idEvo);
        const take = takeParam ? parseInt(takeParam) : todosIds.length;
        const idsPagina = todosIds.slice(skip, skip + take);

        let alunasProcessadas = 0;
        let alunasAtualizadas = 0;
        let contratosGravados = 0;

        for (const idAluno of idsPagina) {
            alunasProcessadas++;
            const idMember = parseInt(idAluno);
            if (isNaN(idMember)) continue;

            let contratos: any[] = [];
            try {
                contratos = await evoFetchPaginated<any>("/api/v3/membermembership", {
                    idMember,
                    take: 50,
                });
            } catch {
                continue; // erro pontual numa aluna não interrompe o lote
            }

            // Considerar contratos não-cancelados (vigentes + expirados). O cálculo escolhe o vigente.
            const paraInserir = contratos
                .filter(c => !c.cancelDate)
                .map(c => {
                    const idContrato = (c.idMemberMemberShip ?? c.idMemberMembership);
                    if (!idContrato || !c.membershipStart) return null;
                    const fim = c.membershipEnd ? new Date(c.membershipEnd) : new Date("2099-12-31T23:59:59Z");
                    const status = fim < new Date() ? "expired" : "active";
                    return {
                        idEvo: idContrato.toString(),
                        idAluno,
                        nomePlano: (c.nameMembership || "").trim() || "Sem Nome",
                        status,
                        valor: c.saleValue ?? 0,
                        dataInicio: new Date(c.membershipStart),
                        dataFim: fim,
                    };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);

            if (paraInserir.length === 0) continue;

            // SUBSTITUIR: apaga os antigos (seed desatualizado) e insere os atuais da EVO.
            await prisma.contrato.deleteMany({ where: { idAluno } });
            for (const data of paraInserir) {
                await prisma.contrato.create({ data });
                contratosGravados++;
            }
            alunasAtualizadas++;
        }

        const proximoSkip = skip + take;
        const temMais = proximoSkip < todosIds.length;

        return NextResponse.json({
            success: true,
            totalAlunas: todosIds.length,
            alunasProcessadas,
            alunasAtualizadas,
            contratosGravados,
            proximaPagina: temMais
                ? `?secret=SECRET&skip=${proximoSkip}${takeParam ? `&take=${takeParam}` : ""}`
                : null,
        });
    } catch (err: any) {
        console.error("[refresh-memberships] Erro:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

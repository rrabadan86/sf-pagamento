import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Endpoint leve: ressincroniza os CONTRATOS (memberships) ativos da EVO para a tabela local.
// O cron completo (evo-sync) frequentemente estoura o timeout antes de terminar o Step 1,
// deixando contratos desatualizados/faltando — o que faz a data de vencimento aparecer errada.
//
// Estratégia: busca o bulk v3/membermembership (status ativo), agrupa por aluna e SUBSTITUI
// os contratos locais dela (delete + insert), eliminando registros antigos de seed com datas velhas.
//
// GET /api/cron/refresh-memberships?secret=...
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const secretParam = request.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Busca contratos ativos (status=1). Estes carregam a data de fim vigente correta.
        const contratos = await evoFetchPaginated<any>("/api/v3/membermembership", {
            statusMemberMembership: 1,
            take: 50,
        });

        // Agrupar por aluna
        const porAluna = new Map<number, any[]>();
        for (const c of contratos) {
            const idMember = c.idMember;
            if (!idMember) continue;
            if (!porAluna.has(idMember)) porAluna.set(idMember, []);
            porAluna.get(idMember)!.push(c);
        }

        let alunasAtualizadas = 0;
        let contratosGravados = 0;
        let alunasSemCadastro = 0;

        for (const [idMember, lista] of porAluna.entries()) {
            const idAluno = idMember.toString();

            // Garantir que a aluna existe (FK). Se não existir no cadastro local, pula.
            const aluno = await prisma.aluno.findUnique({ where: { idEvo: idAluno } });
            if (!aluno) { alunasSemCadastro++; continue; }

            // Montar os contratos válidos ANTES de apagar, para nunca deixar a aluna sem dados.
            const paraInserir = lista
                .map(c => {
                    const idContrato = (c.idMemberMemberShip ?? c.idMemberMembership);
                    if (!idContrato || !c.membershipStart) return null;
                    const cancelado = !!c.cancelDate;
                    const fim = c.membershipEnd ? new Date(c.membershipEnd) : new Date("2099-12-31T23:59:59Z");
                    const status = cancelado ? "canceled" : (fim < new Date() ? "expired" : "active");
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

            // SUBSTITUIR: apaga contratos antigos (seed desatualizado) e insere os atuais da EVO.
            await prisma.contrato.deleteMany({ where: { idAluno } });
            for (const data of paraInserir) {
                await prisma.contrato.create({ data });
                contratosGravados++;
            }
            alunasAtualizadas++;
        }

        return NextResponse.json({
            success: true,
            contratosRecebidosEvo: contratos.length,
            alunasNoResultado: porAluna.size,
            alunasAtualizadas,
            contratosGravados,
            alunasSemCadastroLocal: alunasSemCadastro,
        });
    } catch (err: any) {
        console.error("[refresh-memberships] Erro:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

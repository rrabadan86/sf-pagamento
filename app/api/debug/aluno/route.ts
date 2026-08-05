import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Replica a lógica de valorMes do /api/calculo para diagnóstico.
function computeValorMes(m: any): { valorMes: number; via: string } {
    const nameLower = (m.nameMembership || m.nomePlano || "").toLowerCase();
    let explicitMonths = 0;
    if (nameLower.includes("anual")) explicitMonths = 12;
    else if (nameLower.includes("semestral")) explicitMonths = 6;
    else if (nameLower.includes("trimestral") || nameLower.includes("trim.") || nameLower.includes(" trm ") || nameLower.startsWith("trm ") || nameLower.includes(" trm")) explicitMonths = 3;
    else if (nameLower.includes("bimestral")) explicitMonths = 2;
    else if (nameLower.includes("mensal")) explicitMonths = 1;

    const saleValue = m.saleValue ?? m.valor ?? 0;
    const start = m.membershipStart ?? m.dataInicio ?? null;
    const end = m.membershipEnd ?? m.dataFim ?? null;

    if (explicitMonths > 0) return { valorMes: saleValue / explicitMonths, via: `keyword/${explicitMonths}` };

    const rec = m.receivables?.find((r: any) => !r.canceled && r.totalInstallments > 1);
    let durMonths = 0;
    if (start && end) {
        const s = new Date(start), e = new Date(end);
        durMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
        if (durMonths <= 0) durMonths = 1;
    }
    if (rec && rec.totalInstallments > 1 && rec.totalInstallments <= 24) return { valorMes: saleValue / rec.totalInstallments, via: `receivables/${rec.totalInstallments}` };
    if (durMonths > 1 && durMonths <= 24) return { valorMes: saleValue / durMonths, via: `duracao/${durMonths}` };
    if (durMonths === 1) return { valorMes: saleValue, via: "mensal" };
    if (start) {
        const sy = new Date(start).getFullYear();
        const sm = new Date(start).getMonth();
        if (sy >= 2026 || (sy === 2025 && sm >= 6)) return { valorMes: saleValue / 12, via: "aberto2026/12" };
    }
    return { valorMes: saleValue, via: "cheio" };
}

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
        let evoContratos: any = null;
        try {
            evoContratos = await evoFetchPaginated<any>("/api/v3/membermembership", { idMember, take: 50 });
        } catch (e: any) {
            evoContratos = { erro: e.message };
        }

        saida.push({
            idEvo: a.idEvo,
            nome: a.nome,
            contratosBancoLocal: a.contratos.map((c) => ({
                idEvo: c.idEvo, nomePlano: c.nomePlano, status: c.status, valor: c.valor,
                dataInicio: c.dataInicio, dataFim: c.dataFim,
                _valorMes: computeValorMes(c),
            })),
            contratosEvo: Array.isArray(evoContratos) ? evoContratos.map((c: any) => ({
                nameMembership: c.nameMembership, saleValue: c.saleValue,
                membershipStart: c.membershipStart, membershipEnd: c.membershipEnd,
                cancelDate: c.cancelDate,
                receivables: (c.receivables || []).map((r: any) => ({ desc: r.description, canceled: r.canceled, tot: r.totalInstallments })),
                _valorMes: computeValorMes(c),
            })) : evoContratos,
        });
    }

    return NextResponse.json({ nome, encontrados: alunos.length, alunos: saida }, { status: 200 });
}

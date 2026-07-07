import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { evoFetchPaginated } from "@/lib/evo/client";

export const maxDuration = 60;

// Diagnóstico: contratos brutos da EVO (v3/membermembership) de uma aluna.
// GET /api/debug/evo-contratos?idMember=3890
export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const idMember = parseInt(req.nextUrl.searchParams.get("idMember") ?? "0");
    if (!idMember) return NextResponse.json({ error: "idMember obrigatório" }, { status: 400 });

    try {
        const contratos = await evoFetchPaginated<any>("/api/v3/membermembership", {
            idMember,
            take: 50,
        });

        // Resumo enxuto dos campos relevantes para o vencimento
        const resumo = contratos.map(c => ({
            nameMembership: c.nameMembership,
            membershipStart: c.membershipStart,
            membershipEnd: c.membershipEnd,
            statusMemberMembership: c.statusMemberMembership ?? c.membershipStatus,
            cancelDate: c.cancelDate,
            registerCancelDate: c.registerCancelDate,
            saleValue: c.saleValue,
            idMemberMemberShip: c.idMemberMemberShip ?? c.idMemberMembership,
        }));

        return NextResponse.json({ idMember, total: contratos.length, resumo }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ idMember, error: e.message }, { status: 500 });
    }
}

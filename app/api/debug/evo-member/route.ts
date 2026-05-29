import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { evoFetch, evoFetchPaginated } from "@/lib/evo/client";

export const maxDuration = 60;

// Endpoint de diagnóstico: retorna resposta bruta do EVO para um membro.
// GET /api/debug/evo-member?idMember=5789
export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const idMember = parseInt(req.nextUrl.searchParams.get("idMember") ?? "0");
    if (!idMember) return NextResponse.json({ error: "idMember obrigatório" }, { status: 400 });

    const results: Record<string, unknown> = {};

    // 1. Endpoint atual (retorna vazio para RECORRENTE?)
    try {
        const r1 = await evoFetch<unknown>("/api/v1/activities/enrollment/member-enrollment", { idMember });
        results["member-enrollment (evoFetch)"] = r1;
    } catch (e: any) { results["member-enrollment (evoFetch) ERRO"] = e.message; }

    // 2. Mesmo endpoint via paginação
    try {
        const r2 = await evoFetchPaginated<unknown>("/api/v1/activities/enrollment/member-enrollment", { idMember });
        results["member-enrollment (paginado)"] = r2;
    } catch (e: any) { results["member-enrollment (paginado) ERRO"] = e.message; }

    // 3. Somente status ativo
    try {
        const r3 = await evoFetch<unknown>("/api/v1/activities/enrollment/member-enrollment", { idMember, status: 1 });
        results["member-enrollment status=1"] = r3;
    } catch (e: any) { results["member-enrollment status=1 ERRO"] = e.message; }

    // 4. Endpoint sem /member-enrollment
    try {
        const r4 = await evoFetch<unknown>("/api/v1/activities/enrollment", { idMember });
        results["enrollment sem member-"] = r4;
    } catch (e: any) { results["enrollment sem member- ERRO"] = e.message; }

    // 5. Endpoint paginado sem /member-enrollment
    try {
        const r5 = await evoFetchPaginated<unknown>("/api/v1/activities/enrollment", { idMember });
        results["enrollment sem member- (paginado)"] = r5;
    } catch (e: any) { results["enrollment sem member- (paginado) ERRO"] = e.message; }

    // 6. schedule/member
    try {
        const r6 = await evoFetch<unknown>("/api/v1/activities/schedule/member", { idMember });
        results["schedule/member"] = r6;
    } catch (e: any) { results["schedule/member ERRO"] = e.message; }

    return NextResponse.json({ idMember, results }, { status: 200 });
}

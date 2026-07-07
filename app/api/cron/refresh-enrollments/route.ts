import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSchedule } from "@/lib/evo/queries";
import { getTurmaEnrollments } from "@/lib/evo/enrollments";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Endpoint leve: sincroniza APENAS os enrollments (presenças) das sessões de um mês.
// O cron completo (evo-sync) frequentemente estoura o timeout antes de terminar este
// passo, deixando sessões sem enrollment — o que faz alunas presentes sumirem do cálculo.
//
// GET /api/cron/refresh-enrollments?secret=...&mes=6&ano=2026
// Paginação opcional (se um mês grande estourar 60s): &skip=0&take=70 e depois &skip=70
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const secretParam = request.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agora = new Date();
    const mesAtualBRT = parseInt(agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-")[1]);
    const anoAtualBRT = parseInt(agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-")[0]);

    const mes = parseInt(request.nextUrl.searchParams.get("mes") ?? String(mesAtualBRT));
    const ano = parseInt(request.nextUrl.searchParams.get("ano") ?? String(anoAtualBRT));
    const skip = parseInt(request.nextUrl.searchParams.get("skip") ?? "0");
    const takeParam = request.nextUrl.searchParams.get("take");

    try {
        // Preferir a grade já cacheada (evita re-buscar schedule na EVO).
        const cacheKey = `schedule_${mes}_${ano}`;
        const cached = await prisma.cacheJSON.findUnique({ where: { chave: cacheKey } });

        let schedule: { idAtividadeSessao: number | null }[];
        if (cached) {
            schedule = JSON.parse(cached.dados);
        } else {
            schedule = await getSchedule(mes, ano);
            await prisma.cacheJSON.upsert({
                where: { chave: cacheKey },
                update: { dados: JSON.stringify(schedule) },
                create: { chave: cacheKey, dados: JSON.stringify(schedule) },
            });
        }

        const allSessionIds = schedule
            .map(a => a.idAtividadeSessao)
            .filter((id): id is number => id != null);

        const take = takeParam ? parseInt(takeParam) : allSessionIds.length;
        const sessionIds = allSessionIds.slice(skip, skip + take);

        let countEnrollments = 0;
        let sessoesProcessadas = 0;

        const chunkArray = <T>(arr: T[], size: number) =>
            Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

        for (const chunk of chunkArray(sessionIds, 3)) {
            await Promise.all(chunk.map(async (sessId) => {
                try {
                    const enrollments = await getTurmaEnrollments(sessId);
                    for (const e of enrollments) {
                        if (!e.idMember) continue;
                        await prisma.enrollmentSessao.upsert({
                            where: {
                                idAtividadeSessao_idMember: {
                                    idAtividadeSessao: sessId,
                                    idMember: e.idMember,
                                }
                            },
                            update: {
                                nome: e.name || "",
                                replacement: e.replacement ?? false,
                                status: e.status ?? 0,
                            },
                            create: {
                                idAtividadeSessao: sessId,
                                idMember: e.idMember,
                                nome: e.name || "",
                                replacement: e.replacement ?? false,
                                status: e.status ?? 0,
                            }
                        });
                        countEnrollments++;
                    }
                    sessoesProcessadas++;
                } catch (err) {
                    console.warn(`[refresh-enrollments] Erro na sessão ${sessId}:`, err);
                }
            }));
        }

        const proximoSkip = skip + take;
        const temMais = proximoSkip < allSessionIds.length;

        return NextResponse.json({
            success: true,
            mes,
            ano,
            totalSessoes: allSessionIds.length,
            sessoesProcessadas,
            enrollmentsSalvos: countEnrollments,
            proximaPagina: temMais
                ? `?secret=SECRET&mes=${mes}&ano=${ano}&skip=${proximoSkip}${takeParam ? `&take=${takeParam}` : ""}`
                : null,
        });
    } catch (err: any) {
        console.error("[refresh-enrollments] Erro:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

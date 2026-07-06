import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSchedule } from "@/lib/evo/queries";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Endpoint leve: apenas recacheia a grade de aulas (schedule) do mês.
// Use quando alterar professoras ou horários no EVO e precisar refletir imediatamente.
// GET /api/cron/refresh-schedule?secret=...&mes=6&ano=2026
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

    try {
        console.log(`[refresh-schedule] Atualizando schedule ${mes}/${ano}...`);
        const schedule = await getSchedule(mes, ano);

        const cacheKey = `schedule_${mes}_${ano}`;
        await prisma.cacheJSON.upsert({
            where: { chave: cacheKey },
            update: { dados: JSON.stringify(schedule) },
            create: { chave: cacheKey, dados: JSON.stringify(schedule) },
        });

        console.log(`[refresh-schedule] ${schedule.length} sessões cacheadas para ${mes}/${ano}`);

        const professores = [...new Set(schedule.map(s => s.instructor).filter(Boolean))].sort();

        return NextResponse.json({
            success: true,
            mes,
            ano,
            sessoes: schedule.length,
            professores,
        });
    } catch (err: any) {
        console.error("[refresh-schedule] Erro:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

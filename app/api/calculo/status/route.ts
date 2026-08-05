import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Endpoint leve: retorna quando a grade e a presença de um mês foram atualizadas
// pela última vez. Usado para exibir essa info na tela de cálculo sem precisar
// rodar o cálculo completo.
// GET /api/calculo/status?mes=7&ano=2026
export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mes = parseInt(searchParams.get("mes") ?? "0");
    const ano = parseInt(searchParams.get("ano") ?? "0");
    if (!mes || !ano) {
        return NextResponse.json({ error: "Parâmetros mes e ano são obrigatórios" }, { status: 400 });
    }

    // Grade: timestamp do cache do schedule do mês.
    const cache = await prisma.cacheJSON.findUnique({ where: { chave: `schedule_${mes}_${ano}` } });

    // Presença: enrollment mais recente entre as sessões do mês (se houver cache da grade).
    let presenca: Date | null = null;
    if (cache) {
        try {
            const schedule: { idAtividadeSessao: number | null }[] = JSON.parse(cache.dados);
            const sessionIds = schedule.map(a => a.idAtividadeSessao).filter((id): id is number => id != null);
            if (sessionIds.length > 0) {
                const recente = await prisma.enrollmentSessao.findFirst({
                    where: { idAtividadeSessao: { in: sessionIds } },
                    orderBy: { atualizadoEm: "desc" },
                    select: { atualizadoEm: true },
                });
                presenca = recente?.atualizadoEm ?? null;
            }
        } catch {
            // cache corrompido — ignora
        }
    }

    return NextResponse.json({
        grade: cache?.atualizadoEm ?? null,
        presenca,
    });
}

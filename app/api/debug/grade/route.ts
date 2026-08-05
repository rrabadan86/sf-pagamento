import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

// GET /api/debug/grade?nome=ana carolina&weekDay=5&time=09:30&date=2026-07-31&secret=...
// Dumpa a grade fixa (gradeFixaAluno) da(s) aluna(s) e, se weekDay/time/date forem
// informados, testa se cada entrada CASA com aquela sessão — replicando a lógica
// ehOficialmenteDela do /api/calculo. Serve para diagnosticar por que uma aluna
// aparece numa turma onde não deveria (grade removida/sem endDate, dia/hora errados).
export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nome = req.nextUrl.searchParams.get("nome") ?? "";
    if (!nome) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });

    const weekDayParam = req.nextUrl.searchParams.get("weekDay");
    const timeParam = req.nextUrl.searchParams.get("time"); // "09:30"
    const dateParam = req.nextUrl.searchParams.get("date"); // "2026-07-31"

    const weekDay = weekDayParam != null ? parseInt(weekDayParam, 10) : null;
    const timeMask = timeParam ?? null;
    let classDay: number | null = null;
    if (dateParam) {
        const [y, mo, d] = dateParam.substring(0, 10).split("-").map(Number);
        classDay = new Date(y, mo - 1, d).getTime();
    }

    const dayOnly = (date: Date) => {
        const y = date.getFullYear(), mo = date.getMonth(), d = date.getDate();
        return new Date(y, mo, d).getTime();
    };

    const alunos = await prisma.aluno.findMany({
        where: { nome: { contains: nome } },
        select: { idEvo: true, nome: true },
    });

    const saida: unknown[] = [];
    for (const a of alunos) {
        const grades = await prisma.gradeFixaAluno.findMany({ where: { idAluno: a.idEvo } });
        const linhas = grades.map((g) => {
            const inicio = dayOnly(g.startDate);
            const fim = g.endDate ? dayOnly(g.endDate) : Infinity;

            // Replica EXATA de ehOficialmenteDela (route.ts): NÃO checa status.
            let casaDiaHora: boolean | null = null;
            let casaData: boolean | null = null;
            let casaTudo: boolean | null = null;
            if (weekDay != null && timeMask != null && classDay != null) {
                casaDiaHora = g.weekDay === weekDay && g.startTime.startsWith(timeMask);
                casaData = classDay >= inicio && classDay <= fim;
                casaTudo = casaDiaHora && casaData;
            }

            return {
                activityName: g.activityName,
                weekDay: g.weekDay,
                dia: DIAS[g.weekDay] ?? `?${g.weekDay}`,
                startTime: g.startTime,
                status: g.status, // 1 = ativo, 2 = removido
                statusTxt: g.status === 1 ? "ATIVA" : g.status === 2 ? "REMOVIDA" : `?${g.status}`,
                startDate: g.startDate.toISOString().substring(0, 10),
                endDate: g.endDate ? g.endDate.toISOString().substring(0, 10) : null,
                casaDiaHora,
                casaData,
                casaTudo,
            };
        });

        saida.push({
            nome: a.nome,
            idEvo: a.idEvo,
            totalGrades: linhas.length,
            // Se alguma linha casaTudo=true, a aluna é considerada "oficialmente dela"
            // naquela sessão e NÃO é tratada como reposição.
            apareceComoMatriculada: linhas.some((l) => l.casaTudo === true),
            grades: linhas,
        });
    }

    return NextResponse.json({
        teste: weekDay != null ? { weekDay, dia: DIAS[weekDay], timeMask, date: dateParam } : null,
        alunos: saida,
    }, { headers: { "Cache-Control": "no-store" } });
}

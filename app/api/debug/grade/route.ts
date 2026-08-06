import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const norm = (s: string) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const dayOnly = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// GET /api/debug/grade?nome=ana carolina&weekDay=5&time=09:30&date=2026-07-31&secret=...
//   -> dumpa a grade fixa (gradeFixaAluno) da(s) aluna(s), testando casamento com a sessão.
// GET /api/debug/grade?listTurma=1&weekDay=5&time=09:30&secret=...
//   -> lista TODAS as alunas cuja grade LOCAL casa com aquele dia/horário.
export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const weekDayParam = sp.get("weekDay");
    const timeMask = sp.get("time"); // "09:30"
    const dateParam = sp.get("date"); // "2026-07-31"
    const weekDay = weekDayParam != null ? parseInt(weekDayParam, 10) : null;
    let classDay: number | null = null;
    if (dateParam) {
        const [y, mo, d] = dateParam.substring(0, 10).split("-").map(Number);
        classDay = new Date(y, mo - 1, d).getTime();
    }

    // Modo A: listar quem tem grade local casando com um dia/horário.
    if (sp.get("listTurma")) {
        if (weekDay == null || !timeMask) {
            return NextResponse.json({ error: "listTurma requer weekDay e time" }, { status: 400 });
        }
        const grades = await prisma.gradeFixaAluno.findMany({
            where: { weekDay, startTime: { startsWith: timeMask } },
        });
        const ids = Array.from(new Set(grades.map((g) => g.idAluno)));
        const alunos = await prisma.aluno.findMany({ where: { idEvo: { in: ids } }, select: { idEvo: true, nome: true } });
        const nomePorId = new Map(alunos.map((a) => [a.idEvo, a.nome]));
        return NextResponse.json({
            turma: { weekDay, dia: DIAS[weekDay], time: timeMask },
            total: grades.length,
            grades: grades.map((g) => ({
                idAluno: g.idAluno,
                nome: nomePorId.get(g.idAluno) ?? "(sem Aluno local)",
                activityName: g.activityName,
                startTime: g.startTime,
                status: g.status,
                statusTxt: g.status === 1 ? "ATIVA" : g.status === 2 ? "REMOVIDA" : `?${g.status}`,
                startDate: g.startDate.toISOString().substring(0, 10),
                endDate: g.endDate ? g.endDate.toISOString().substring(0, 10) : null,
            })),
        }, { headers: { "Cache-Control": "no-store" } });
    }

    // Modo B: por nome (tolerante a acento/maiúsculas, casa TODAS as palavras).
    const nome = sp.get("nome") ?? "";
    if (!nome) return NextResponse.json({ error: "nome ou listTurma obrigatório" }, { status: 400 });
    const tokens = norm(nome).split(/\s+/).filter(Boolean);

    const todos = await prisma.aluno.findMany({ select: { idEvo: true, nome: true } });
    const alunos = todos.filter((a) => {
        const n = norm(a.nome);
        return tokens.every((t) => n.includes(t));
    });

    const saida: unknown[] = [];
    for (const a of alunos) {
        const grades = await prisma.gradeFixaAluno.findMany({ where: { idAluno: a.idEvo } });
        const linhas = grades.map((g) => {
            const inicio = dayOnly(g.startDate);
            const fim = g.endDate ? dayOnly(g.endDate) : Infinity;
            let casaTudo: boolean | null = null;
            if (weekDay != null && timeMask != null && classDay != null) {
                casaTudo = g.weekDay === weekDay && g.startTime.startsWith(timeMask) && classDay >= inicio && classDay <= fim;
            }
            return {
                activityName: g.activityName,
                dia: DIAS[g.weekDay] ?? `?${g.weekDay}`,
                weekDay: g.weekDay,
                startTime: g.startTime,
                statusTxt: g.status === 1 ? "ATIVA" : g.status === 2 ? "REMOVIDA" : `?${g.status}`,
                startDate: g.startDate.toISOString().substring(0, 10),
                endDate: g.endDate ? g.endDate.toISOString().substring(0, 10) : null,
                casaTudo,
            };
        });
        saida.push({
            nome: a.nome,
            idEvo: a.idEvo,
            totalGrades: linhas.length,
            apareceComoMatriculada: linhas.some((l) => l.casaTudo === true),
            grades: linhas,
        });
    }

    return NextResponse.json({
        teste: weekDay != null ? { weekDay, dia: DIAS[weekDay], timeMask, date: dateParam } : null,
        totalAlunosNoBanco: todos.length,
        encontrados: saida.length,
        alunos: saida,
    }, { headers: { "Cache-Control": "no-store" } });
}

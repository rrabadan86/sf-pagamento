import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";
import { getSchedule } from "@/lib/evo/queries";
import { getTurmaEnrollments, getMemberFixedSchedules } from "@/lib/evo/enrollments";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Orquestrador de sincronização em FASES com CURSOR e ORÇAMENTO DE TEMPO.
// O cron antigo (evo-sync) fazia tudo numa execução só e estourava os 300s.
// Aqui cada execução ("tick") avança um pedaço limitado (~230s) e salva onde parou
// no CacheJSON. Rodando de 20 em 20 min de madrugada, completa todas as fases sem timeout.
//
// Fases: 0=base (alunos+checkins+grade de aulas) → 1=contratos → 2=presenças → 3=grades fixas → 4=done
//
// GET /api/cron/evo-tick?secret=...            (uso do cron)
// GET /api/cron/evo-tick?secret=...&reset=true (reinicia o ciclo manualmente)

const BUDGET_MS = 230_000; // para com folga antes dos 300s
const STATE_KEY = "evo_tick_state";

const brtToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function loadState() {
    const row = await prisma.cacheJSON.findUnique({ where: { chave: STATE_KEY } });
    if (!row) return null;
    try { return JSON.parse(row.dados); } catch { return null; }
}
async function saveState(state: any) {
    await prisma.cacheJSON.upsert({
        where: { chave: STATE_KEY },
        update: { dados: JSON.stringify(state) },
        create: { chave: STATE_KEY, dados: JSON.stringify(state) },
    });
}

// Lista de ids de sessão dos meses atual + anterior (a partir do cache de grade).
async function sessionIdsCurrPrev(mes: number, ano: number): Promise<number[]> {
    const meses = [{ mes, ano }, mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano }];
    const ids: number[] = [];
    for (const { mes: m, ano: a } of meses) {
        const row = await prisma.cacheJSON.findUnique({ where: { chave: `schedule_${m}_${a}` } });
        if (!row) continue;
        const sched = JSON.parse(row.dados) as { idAtividadeSessao: number | null }[];
        for (const s of sched) if (s.idAtividadeSessao != null) ids.push(s.idAtividadeSessao);
    }
    return ids;
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const secretParam = request.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const inicio = Date.now();
    const semTempo = () => Date.now() - inicio > BUDGET_MS;

    const hoje = brtToday();
    const mes = parseInt(hoje.split("-")[1]);
    const ano = parseInt(hoje.split("-")[0]);

    let state = await loadState();
    if (request.nextUrl.searchParams.get("reset") === "true" || !state || state.day !== hoje) {
        state = { day: hoje, phase: 0, idx: 0 };
    }

    const log: string[] = [];

    try {
        // ---- FASE 0: BASE (alunos + checkins + grade de aulas). Rápida, roda inteira. ----
        if (state.phase === 0) {
            const members = await evoFetchPaginated<any>("/api/v1/members", { status: 1 });
            for (const m of members) {
                const firstName = m.firstName || m.registerName;
                if (!m.idMember || !firstName) continue;
                let cel = null, email = null;
                if (Array.isArray(m.contacts)) {
                    cel = m.contacts.find((c: any) => c.contactType === "Celular")?.description ?? null;
                    email = m.contacts.find((c: any) => c.contactType === "Email")?.description ?? null;
                }
                const nome = (m.lastName ? `${firstName} ${m.lastName}` : firstName).trim();
                await prisma.aluno.upsert({
                    where: { idEvo: m.idMember.toString() },
                    update: { nome, email, celular: cel },
                    create: { idEvo: m.idMember.toString(), nome, email, celular: cel },
                });
            }
            log.push(`base: ${members.length} alunos`);

            // Check-ins de ontem
            const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
            const ontemStr = ontem.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
            const entradas = await evoFetchPaginated<any>("/api/v1/entries", { dtStart: ontemStr, dtEnd: ontemStr });
            for (const e of entradas) {
                if (!e.idMember || !e.date) continue;
                const existe = await prisma.aluno.findUnique({ where: { idEvo: e.idMember.toString() } });
                if (!existe) continue;
                const raw = new Date(e.date);
                const offset = e.timeZone ? -(parseInt(e.timeZone.split(":")[0]) * 60) * 60000 : 3 * 3600 * 1000;
                const data = new Date(raw.getTime() + offset);
                const id = `${e.idMember}_${data.getTime()}`;
                await prisma.checkin.upsert({
                    where: { idEvo: id },
                    update: { dataHora: data, status: e.entryType || "Presente" },
                    create: { idEvo: id, idAluno: e.idMember.toString(), dataHora: data, status: e.entryType || "Presente" },
                });
            }
            log.push(`base: ${entradas.length} checkins`);

            // Grade de aulas (schedule) dos meses atual + anterior
            const meses = [{ mes, ano }, mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano }];
            for (const { mes: m, ano: a } of meses) {
                const sched = await getSchedule(m, a);
                await prisma.cacheJSON.upsert({
                    where: { chave: `schedule_${m}_${a}` },
                    update: { dados: JSON.stringify(sched) },
                    create: { chave: `schedule_${m}_${a}`, dados: JSON.stringify(sched) },
                });
            }
            log.push("base: schedule cacheado");

            state.phase = 1; state.idx = 0;
            await saveState(state);
            return NextResponse.json({ ok: true, fase: "base concluida", proxima: "contratos", log });
        }

        // ---- FASE 1: CONTRATOS (por aluna, via v3 — única fonte que traz RECORRENTE). ----
        if (state.phase === 1) {
            const alunos = await prisma.aluno.findMany({ select: { idEvo: true }, orderBy: { idEvo: "asc" } });
            let i = state.idx;
            for (; i < alunos.length; i++) {
                if (semTempo()) break;
                const idAluno = alunos[i].idEvo;
                const idMember = parseInt(idAluno);
                if (isNaN(idMember)) continue;
                let contratos: any[] = [];
                try { contratos = await evoFetchPaginated<any>("/api/v3/membermembership", { idMember, take: 50 }); }
                catch { continue; }
                const paraInserir = contratos.filter(c => !c.cancelDate).map(c => {
                    const idC = c.idMemberMemberShip ?? c.idMemberMembership;
                    if (!idC || !c.membershipStart) return null;
                    const fim = c.membershipEnd ? new Date(c.membershipEnd) : new Date("2099-12-31T23:59:59Z");
                    return {
                        idEvo: idC.toString(), idAluno,
                        nomePlano: (c.nameMembership || "").trim() || "Sem Nome",
                        status: fim < new Date() ? "expired" : "active",
                        valor: c.saleValue ?? 0,
                        dataInicio: new Date(c.membershipStart), dataFim: fim,
                    };
                }).filter((x): x is NonNullable<typeof x> => x !== null);
                if (paraInserir.length === 0) continue;
                await prisma.contrato.deleteMany({ where: { idAluno } });
                for (const data of paraInserir) await prisma.contrato.create({ data });
            }
            if (i >= alunos.length) { state.phase = 2; state.idx = 0; log.push("contratos: concluido"); }
            else { state.idx = i; log.push(`contratos: parou em ${i}/${alunos.length}`); }
            await saveState(state);
            return NextResponse.json({ ok: true, fase: "contratos", idx: state.idx, log });
        }

        // ---- FASE 2: PRESENÇAS (por sessão, meses atual + anterior). ----
        if (state.phase === 2) {
            const sessoes = await sessionIdsCurrPrev(mes, ano);
            let i = state.idx;
            for (; i < sessoes.length; i++) {
                if (semTempo()) break;
                const sessId = sessoes[i];
                try {
                    const enrolls = await getTurmaEnrollments(sessId);
                    for (const e of enrolls) {
                        if (!e.idMember) continue;
                        await prisma.enrollmentSessao.upsert({
                            where: { idAtividadeSessao_idMember: { idAtividadeSessao: sessId, idMember: e.idMember } },
                            update: { nome: e.name || "", replacement: e.replacement ?? false, status: e.status ?? 0 },
                            create: { idAtividadeSessao: sessId, idMember: e.idMember, nome: e.name || "", replacement: e.replacement ?? false, status: e.status ?? 0 },
                        });
                    }
                } catch { continue; }
            }
            if (i >= sessoes.length) { state.phase = 3; state.idx = 0; log.push("presencas: concluido"); }
            else { state.idx = i; log.push(`presencas: parou em ${i}/${sessoes.length}`); }
            await saveState(state);
            return NextResponse.json({ ok: true, fase: "presencas", idx: state.idx, log });
        }

        // ---- FASE 3: GRADES FIXAS (por aluna). ----
        if (state.phase === 3) {
            const alunos = await prisma.aluno.findMany({ select: { idEvo: true }, orderBy: { idEvo: "asc" } });
            let i = state.idx;
            for (; i < alunos.length; i++) {
                if (semTempo()) break;
                const idMember = parseInt(alunos[i].idEvo);
                if (isNaN(idMember)) continue;
                try {
                    const grades = await getMemberFixedSchedules(idMember);
                    const sorted = [...grades].sort((a, b) => {
                        const sd = (b.status ?? 1) - (a.status ?? 1);
                        if (sd !== 0) return sd;
                        const ae = a.endDate ? new Date(a.endDate).getTime() : Infinity;
                        const be = b.endDate ? new Date(b.endDate).getTime() : Infinity;
                        return ae - be;
                    });
                    for (const g of sorted) {
                        if (!g.idActivity || g.weekDay == null || !g.startTime || !g.startDate) continue;
                        await prisma.gradeFixaAluno.upsert({
                            where: { idAluno_idActivity_weekDay_startTime: { idAluno: idMember.toString(), idActivity: g.idActivity, weekDay: g.weekDay, startTime: g.startTime } },
                            update: { activityName: g.activityName || "", status: g.status ?? 1, startDate: new Date(g.startDate), endDate: g.endDate ? new Date(g.endDate) : null },
                            create: { idAluno: idMember.toString(), idActivity: g.idActivity, activityName: g.activityName || "", weekDay: g.weekDay, startTime: g.startTime, status: g.status ?? 1, startDate: new Date(g.startDate), endDate: g.endDate ? new Date(g.endDate) : null },
                        });
                    }
                } catch { continue; }
            }
            if (i >= alunos.length) { state.phase = 4; state.idx = 0; log.push("grades: concluido"); }
            else { state.idx = i; log.push(`grades: parou em ${i}/${alunos.length}`); }
            await saveState(state);
            return NextResponse.json({ ok: true, fase: "grades", idx: state.idx, log });
        }

        // ---- FASE 4: TUDO SINCRONIZADO ----
        return NextResponse.json({ ok: true, fase: "done", mensagem: "Ciclo do dia concluido." });
    } catch (err: any) {
        console.error("[evo-tick] Erro:", err);
        return NextResponse.json({ error: err.message, faseAtual: state?.phase }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";
import { getMemberFixedSchedules } from "@/lib/evo/enrollments";
import { getSchedule } from "@/lib/evo/queries";

// Vercel Cron Limits: Até 10s no Hobby, até 60s no Pro/Premium. Pro maxDuration: 300
export const maxDuration = 300; 
export const dynamic = 'force-dynamic'; // Evita cache agressivo do Next.js na rota de CRON

export async function GET(request: NextRequest) {
    // 1. Validar a Secret do CRON para evitar execuções maliciosas públicas
    const authHeader = request.headers.get("authorization");
    const secretParam = request.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Se estiver rodando manualmente via navegador (para debug), podemos permitir se não houver secret configurada, 
    // mas em produção, a Secret é mandatória pela Vercel.

    try {
        const t0 = Date.now();
        console.log("=== INICIANDO CRON DE SINCRONIZAÇÃO EVO (DIA ANTERIOR) ===");

        // Data de Ontem (O ideal é rodar de madrugada, puxando do início ao fim de ontem)
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        
        // Cuidado com Timezone (EVO usa BRT, Vercel roda em UTC).
        // Formatamos de forma segura para string ISO e extraimos o 'YYYY-MM-DD'
        // Como o JS Date sem hora vira Midnight UTC, ajustamos para pegar o dia correto no Brasil:
        const ontemStr = ontem.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // en-CA garante formato YYYY-MM-DD
        
        console.log(`Buscando dados referentes a: ${ontemStr}`);

        // --- 1. SINCRONIZAR ALUNOS ATIVOS E CONTRATOS (MEMBERSHIPS) ---
        // Puxamos "todas as movimentações" que aconteceram ou os que estão ativos.
        // A EVO não tem endpoint "membros alterados ontem", então puxamos os ativos (são em torno de 100, é rápido).
        const members = await evoFetchPaginated<any>("/api/v1/members", { status: 1 });
        let countAlunos = 0;
        let countContratos = 0;

        // Coletar upserts e gravar em LOTES por transação — antes cada aluno/contrato
        // era um round-trip separado ao banco remoto (Turso), o que sozinho já
        // consumia boa parte dos 300s. O aluno precisa existir ANTES do contrato
        // (FK), então gravamos todos os alunos primeiro, depois todos os contratos.
        const alunoOps: Parameters<typeof prisma.aluno.upsert>[0][] = [];
        const contratoOps: Parameters<typeof prisma.contrato.upsert>[0][] = [];
        for (const m of members) {
            const firstName = m.firstName || m.registerName;
            if (!m.idMember || !firstName) continue;

            let cellphone = null;
            let email = null;
            if (m.contacts && Array.isArray(m.contacts)) {
                const cellContact = m.contacts.find((c: any) => c.contactType === 'Celular');
                if (cellContact) cellphone = cellContact.description;

                const emailContact = m.contacts.find((c: any) => c.contactType === 'Email');
                if (emailContact) email = emailContact.description;
            }

            const nomeCompleto = m.lastName ? `${firstName} ${m.lastName}` : firstName;
            alunoOps.push({
                where: { idEvo: m.idMember.toString() },
                update: { nome: nomeCompleto.trim(), email: email, celular: cellphone },
                create: { idEvo: m.idMember.toString(), nome: nomeCompleto.trim(), email: email, celular: cellphone },
            });
            countAlunos++;

            if (m.memberships && Array.isArray(m.memberships)) {
                for (const mb of m.memberships) {
                    if (!mb.idMembership || !mb.name || !mb.startDate) continue;
                    const dados = {
                        nomePlano: mb.name,
                        status: mb.membershipStatus || 'active',
                        dataInicio: new Date(mb.startDate),
                        dataFim: mb.endDate ? new Date(mb.endDate) : new Date("2099-12-31T23:59:59Z"),
                    };
                    contratoOps.push({
                        where: { idEvo: mb.idMembership.toString() },
                        update: dados,
                        create: { idEvo: mb.idMembership.toString(), idAluno: m.idMember.toString(), ...dados },
                    });
                    countContratos++;
                }
            }
        }

        const flushEmLotes = async <T,>(ops: T[], run: (op: T) => any, tamanho = 50) => {
            for (let i = 0; i < ops.length; i += tamanho) {
                await prisma.$transaction(ops.slice(i, i + tamanho).map(run));
            }
        };
        await flushEmLotes(alunoOps, (op) => prisma.aluno.upsert(op));
        await flushEmLotes(contratoOps, (op) => prisma.contrato.upsert(op));

        // --- 2. SINCRONIZAR CHECK-INS DE ONTEM ---
        const checkinsEvo = await evoFetchPaginated<any>("/api/v1/entries", { 
            dtStart: ontemStr,
            dtEnd: ontemStr
        });
        
        // Pré-carregar os IDs de alunos em UMA query (antes era um findUnique por
        // check-in — dobrava os round-trips ao banco). O check-in só é gravado se
        // a aluna existe (restrição de FK).
        const alunosExistentes = new Set(
            (await prisma.aluno.findMany({ select: { idEvo: true } })).map(a => a.idEvo)
        );
        let countCheckins = 0;
        const checkinOps: Parameters<typeof prisma.checkin.upsert>[0][] = [];
        for (const entry of checkinsEvo) {
            if (!entry.idMember || !entry.date) continue;
            if (!alunosExistentes.has(entry.idMember.toString())) continue;

            // A EVO retorna datas como "2026-03-10T10:00:00" (BRT, sem sufixo Z)
            // O JS interpreta como UTC → salva 3h antes. Corrigir com offset do timeZone.
            const dataCheckinRaw = new Date(entry.date);
            const offsetMs = entry.timeZone
                ? -(parseInt(entry.timeZone.split(':')[0]) * 60) * 60000
                : 3 * 60 * 60 * 1000; // fallback BRT = UTC-3
            const dataCheckin = new Date(dataCheckinRaw.getTime() + offsetMs);
            const idRecordCalc = `${entry.idMember}_${dataCheckin.getTime()}`;

            checkinOps.push({
                where: { idEvo: idRecordCalc },
                update: { dataHora: dataCheckin, status: entry.entryType || 'Presente' },
                create: {
                    idEvo: idRecordCalc,
                    idAluno: entry.idMember.toString(),
                    dataHora: dataCheckin,
                    status: entry.entryType || 'Presente',
                },
            });
            countCheckins++;
        }
        await flushEmLotes(checkinOps, (op) => prisma.checkin.upsert(op));


        // --- 3. SINCRONIZAR GRADES FIXAS DOS ALUNOS (apenas dias 1 e 25) ---
        // A grade fixa muda raramente. Sincronizar 2x/mês (fechamento no dia 25 e
        // virada no dia 1) mantém o total de requisições dentro do plano EVO Black.
        const DIAS_COM_GRADE = [1, 25];
        const diaDoMes = parseInt(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-')[2]);
const forceGrade = request.nextUrl.searchParams.get("forceGrade") === "true";
const deveRodarGrade = forceGrade || DIAS_COM_GRADE.includes(diaDoMes);

        let countGrades = 0;
        let gradeParcial = false;
        if (deveRodarGrade) {
            console.log(`[CRON] Dia ${diaDoMes} — sincronizando grades fixas...`);
            const alunosSalvos = await prisma.aluno.findMany({ select: { idEvo: true } });
            const idsParaGrade = alunosSalvos.map(a => parseInt(a.idEvo)).filter(id => !isNaN(id));

            // Trava de tempo: usa quase todo o orçamento de 300s (a fase 4 seguinte é
            // só cache de grade, redundante com o cron refresh-schedule, e é pulada se o
            // tempo acabar). O EVO limita a ~4 req/s, então ~84 alunas levam ~240s: por
            // isso a trava fica em 285s, deixando as grades caberem inteiras sem 504.
            const GRADE_DEADLINE_MS = 285_000;

            // 3a. Buscar grades de TODAS as alunas em paralelo (lotes), sem tocar no banco.
            const EVO_CONCURRENCY = 12;
            type UpsertArg = Parameters<typeof prisma.gradeFixaAluno.upsert>[0];
            const opsPorAluno: UpsertArg[] = [];
            for (let i = 0; i < idsParaGrade.length; i += EVO_CONCURRENCY) {
                if (Date.now() - t0 > GRADE_DEADLINE_MS) { gradeParcial = true; break; }
                const lote = idsParaGrade.slice(i, i + EVO_CONCURRENCY);
                const resultados = await Promise.all(lote.map(async (idMember) => {
                    try {
                        return { idMember, grades: await getMemberFixedSchedules(idMember) };
                    } catch (err) {
                        console.warn(`[CRON] Erro ao buscar grade fixa do aluno ${idMember}:`, err);
                        return { idMember, grades: [] };
                    }
                }));
                for (const { idMember, grades } of resultados) {
                    // Ordenar para que registros ativos (status=1) sejam gravados POR ÚLTIMO,
                    // garantindo que sobrescrevam os removidos (status=2) quando compartilham
                    // a mesma chave (idAluno, idActivity, weekDay, startTime).
                    const gradesSorted = [...grades].sort((a, b) => {
                        const statusDiff = (b.status ?? 1) - (a.status ?? 1);
                        if (statusDiff !== 0) return statusDiff;
                        const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
                        const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
                        return aEnd - bEnd;
                    });
                    for (const g of gradesSorted) {
                        if (!g.idActivity || g.weekDay == null || !g.startTime || !g.startDate) continue;
                        opsPorAluno.push({
                            where: {
                                idAluno_idActivity_weekDay_startTime: {
                                    idAluno: idMember.toString(),
                                    idActivity: g.idActivity,
                                    weekDay: g.weekDay,
                                    startTime: g.startTime,
                                }
                            },
                            update: {
                                activityName: g.activityName || "",
                                status: g.status ?? 1,
                                startDate: new Date(g.startDate),
                                endDate: g.endDate ? new Date(g.endDate) : null,
                            },
                            create: {
                                idAluno: idMember.toString(),
                                idActivity: g.idActivity,
                                activityName: g.activityName || "",
                                weekDay: g.weekDay,
                                startTime: g.startTime,
                                status: g.status ?? 1,
                                startDate: new Date(g.startDate),
                                endDate: g.endDate ? new Date(g.endDate) : null,
                            }
                        });
                    }
                }
            }

            // 3b. Gravar em LOTES por transação — reduz drasticamente as idas ao banco
            // (antes: 1 round-trip por registro; agora: 1 por lote). A ordem dos upserts
            // é preservada, então registros ativos ainda vencem os removidos.
            const WRITE_BATCH = 50;
            for (let i = 0; i < opsPorAluno.length; i += WRITE_BATCH) {
                if (Date.now() - t0 > GRADE_DEADLINE_MS) { gradeParcial = true; break; }
                const batch = opsPorAluno.slice(i, i + WRITE_BATCH);
                await prisma.$transaction(batch.map(arg => prisma.gradeFixaAluno.upsert(arg)));
                countGrades += batch.length;
            }
            if (gradeParcial) {
                console.warn(`[CRON] Grade fixa PARCIAL (${countGrades} registros) — deadline atingido. Próxima execução (dia 1/25) completa.`);
            }
        } else {
            console.log(`[CRON] Dia ${diaDoMes} — grade fixa não agendada para hoje (próxima: dias 1 e 25).`);
        }

        // --- 4. SINCRONIZAR ENROLLMENTS DAS SESSÕES (mês atual + mês anterior) ---
        // Busca a grade de aulas (sessões) e para cada sessão, busca os enrollments da EVO API.
        // Isso elimina a necessidade de ~100 chamadas à EVO durante o cálculo de remuneração,
        // que é o principal causador do timeout 504.
        const agora = new Date();
        const mesAtualBRT = parseInt(agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-')[1]);
        const anoAtualBRT = parseInt(agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-')[0]);

        // Meses para sincronizar: atual e anterior (para recálculos do mês passado)
        const mesesParaSync: { mes: number; ano: number }[] = [
            { mes: mesAtualBRT, ano: anoAtualBRT },
        ];
        // Mês anterior
        if (mesAtualBRT === 1) {
            mesesParaSync.push({ mes: 12, ano: anoAtualBRT - 1 });
        } else {
            mesesParaSync.push({ mes: mesAtualBRT - 1, ano: anoAtualBRT });
        }

        // Guarda de tempo: se a fase de grades consumiu quase todo o orçamento, pula o
        // cache aqui — ele é redundante com o cron refresh-schedule (roda diariamente).
        const SYNC_DEADLINE_MS = 290_000;
        for (const { mes: mesSync, ano: anoSync } of mesesParaSync) {
            if (Date.now() - t0 > SYNC_DEADLINE_MS) {
                console.warn(`[CRON] Cache de grade pulado (deadline) — coberto pelo cron refresh-schedule.`);
                break;
            }
            console.log(`[CRON] Cacheando grade de ${mesSync}/${anoSync}...`);
            try {
                const schedule = await getSchedule(mesSync, anoSync);
                
                // Cachear a grade completa como JSON para que o /api/calculo não precise chamar a EVO
                const cacheKey = `schedule_${mesSync}_${anoSync}`;
                await prisma.cacheJSON.upsert({
                    where: { chave: cacheKey },
                    update: { dados: JSON.stringify(schedule) },
                    create: { chave: cacheKey, dados: JSON.stringify(schedule) },
                });
                console.log(`[CRON] Grade de ${mesSync}/${anoSync} cacheada (${schedule.length} sessões)`);
                // Os enrollments por sessão (parte mais pesada) NÃO são mais feitos aqui —
                // ficam no cron dedicado /api/cron/refresh-enrollments, que tem seu próprio
                // orçamento de 300s. Isso evita o timeout 504 do evo-sync.
            } catch (err) {
                console.warn(`[CRON] Erro ao cachear grade de ${mesSync}/${anoSync}:`, err);
            }
        }

        console.log("=== CRON DE SINCRONIZAÇÃO CONCLUÍDO ===");

        return NextResponse.json({ 
            success: true, 
            message: `Sincronização do dia ${ontemStr} concluída.`,
            stats: {
                alunosVerificados: countAlunos,
                contratosAtualizados: countContratos,
                checkinsDeOntemSalvos: countCheckins,
                gradesFixasSalvas: countGrades,
                gradesFixasParcial: gradeParcial,
                enrollmentsSalvos: "delegado ao cron refresh-enrollments"
            }
        });

    } catch (error: any) {
        console.error("Erro critico no CRON Sync:", error);
        return NextResponse.json({ error: "Failed to sync EVO data", details: error.message }, { status: 500 });
    }
}




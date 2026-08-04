import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";
import { getMemberFixedSchedules, getTurmaEnrollments } from "@/lib/evo/enrollments";
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

            // Aluno
            const nomeCompleto = m.lastName ? `${firstName} ${m.lastName}` : firstName;
            await prisma.aluno.upsert({
                where: { idEvo: m.idMember.toString() },
                update: {
                    nome: nomeCompleto.trim(),
                    email: email,
                    celular: cellphone
                },
                create: {
                    idEvo: m.idMember.toString(),
                    nome: nomeCompleto.trim(),
                    email: email,
                    celular: cellphone
                }
            });
            countAlunos++;

            // Contratos do Aluno
            if (m.memberships && Array.isArray(m.memberships)) {
                for (const mb of m.memberships) {
                    if (!mb.idMembership || !mb.name || !mb.startDate) continue;
                    
                    await prisma.contrato.upsert({
                        where: { idEvo: mb.idMembership.toString() },
                        update: {
                            nomePlano: mb.name,
                            status: mb.membershipStatus || 'active',
                            dataInicio: new Date(mb.startDate),
                            dataFim: mb.endDate ? new Date(mb.endDate) : new Date("2099-12-31T23:59:59Z")
                        },
                        create: {
                            idEvo: mb.idMembership.toString(),
                            idAluno: m.idMember.toString(),
                            nomePlano: mb.name,
                            status: mb.membershipStatus || 'active',
                            dataInicio: new Date(mb.startDate),
                            dataFim: mb.endDate ? new Date(mb.endDate) : new Date("2099-12-31T23:59:59Z")
                        }
                    });
                    countContratos++;
                }
            }
        }

        // --- 2. SINCRONIZAR CHECK-INS DE ONTEM ---
        const checkinsEvo = await evoFetchPaginated<any>("/api/v1/entries", { 
            dtStart: ontemStr,
            dtEnd: ontemStr
        });
        
        let countCheckins = 0;
        for (const entry of checkinsEvo) {
            if (!entry.idMember || !entry.date) continue;

            const alunoExiste = await prisma.aluno.findUnique({ where: { idEvo: entry.idMember.toString() }});
            
            if (alunoExiste) {
                // A EVO retorna datas como "2026-03-10T10:00:00" (BRT, sem sufixo Z)
                // O JS interpreta como UTC → salva 3h antes. Corrigir com offset do timeZone.
                const dataCheckinRaw = new Date(entry.date);
                const offsetMs = entry.timeZone
                    ? -(parseInt(entry.timeZone.split(':')[0]) * 60) * 60000
                    : 3 * 60 * 60 * 1000; // fallback BRT = UTC-3
                const dataCheckin = new Date(dataCheckinRaw.getTime() + offsetMs);
                const idRecordCalc = `${entry.idMember}_${dataCheckin.getTime()}`;

                await prisma.checkin.upsert({
                    where: { idEvo: idRecordCalc },
                    update: {
                        dataHora: dataCheckin,
                        status: entry.entryType || 'Presente'
                    },
                    create: {
                        idEvo: idRecordCalc,
                        idAluno: entry.idMember.toString(),
                        dataHora: dataCheckin,
                        status: entry.entryType || 'Presente'
                    }
                });
                countCheckins++;
            }
        }


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

            // Trava de tempo: reserva ~40s para a fase 4 (enrollments) e nunca deixa
            // a função estourar os 300s do plano (evita o 504). Se não terminar, marca
            // como parcial — a próxima execução agendada (dia 1 ou 25) completa.
            const GRADE_DEADLINE_MS = 240_000;

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
        let countEnrollments = 0;
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

        for (const { mes: mesSync, ano: anoSync } of mesesParaSync) {
            console.log(`[CRON] Sincronizando enrollments de ${mesSync}/${anoSync}...`);
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
                
                const sessionIds = schedule
                    .map(a => a.idAtividadeSessao)
                    .filter((id): id is number => id != null);

                console.log(`[CRON] ${sessionIds.length} sessões encontradas em ${mesSync}/${anoSync}`);

                // Buscar enrollments em batches de 3 (respeitando rate limit da EVO)
                const chunkArray = <T>(arr: T[], size: number) =>
                    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

                const sessionChunks = chunkArray(sessionIds, 3);
                for (const chunk of sessionChunks) {
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
                        } catch (err) {
                            console.warn(`[CRON] Erro ao buscar enrollments da sessão ${sessId}:`, err);
                        }
                    }));
                }
            } catch (err) {
                console.warn(`[CRON] Erro ao sincronizar enrollments de ${mesSync}/${anoSync}:`, err);
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
                enrollmentsSalvos: countEnrollments
            }
        });

    } catch (error: any) {
        console.error("Erro critico no CRON Sync:", error);
        return NextResponse.json({ error: "Failed to sync EVO data", details: error.message }, { status: 500 });
    }
}




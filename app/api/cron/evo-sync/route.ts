import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";
import { getMemberFixedSchedules } from "@/lib/evo/enrollments";

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


        // --- 3. SINCRONIZAR GRADES FIXAS DOS ALUNOS (apenas dias 1,5,10,15,20,25) ---
        // A grade fixa muda raramente. Sincronizar 6x/mês economiza ~480 requisições,
        // mantendo o total dentro das 1.000/mês do plano EVO Black.
        const DIAS_COM_GRADE = [1, 5, 10, 15, 20, 25];
        const diaDoMes = parseInt(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-')[2]);
        const deveRodarGrade = DIAS_COM_GRADE.includes(diaDoMes);

        let countGrades = 0;
        if (deveRodarGrade) {
            console.log(`[CRON] Dia ${diaDoMes} — sincronizando grades fixas...`);
            const alunosSalvos = await prisma.aluno.findMany({ select: { idEvo: true } });
            const idsParaGrade = alunosSalvos.map(a => parseInt(a.idEvo)).filter(id => !isNaN(id));

            const chunkSize = 10;
            const chunks: number[][] = [];
            for (let i = 0; i < idsParaGrade.length; i += chunkSize) {
                chunks.push(idsParaGrade.slice(i, i + chunkSize));
            }

            for (const chunk of chunks) {
                await Promise.all(chunk.map(async (idMember) => {
                    try {
                        const grades = await getMemberFixedSchedules(idMember);
                        // Ordenar para que registros ativos (status=1) sejam processados POR ÚLTIMO,
                        // garantindo que sobrescrevam os removidos (status=2) no upsert
                        // quando compartilham a mesma chave (idAluno, idActivity, weekDay, startTime)
                        const gradesSorted = [...grades].sort((a, b) => {
                            // status=2 primeiro, status=1 por último (vence no upsert)
                            return (b.status ?? 1) - (a.status ?? 1);
                        });
                        for (const g of gradesSorted) {
                            if (!g.idActivity || g.weekDay == null || !g.startTime || !g.startDate) continue;
                            await prisma.gradeFixaAluno.upsert({
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
                            countGrades++;
                        }
                    } catch (err) {
                        console.warn(`[CRON] Erro ao buscar grade fixa do aluno ${idMember}:`, err);
                    }
                }));
            }
        } else {
            console.log(`[CRON] Dia ${diaDoMes} — grade fixa não agendada para hoje (próxima: dias 1,5,10,15,20,25).`);
        }

        console.log("=== CRON DE SINCRONIZAÇÃO CONCLUÍDO ===");

        return NextResponse.json({ 
            success: true, 
            message: `Sincronização do dia ${ontemStr} concluída.`,
            stats: {
                alunosVerificados: countAlunos,
                contratosAtualizados: countContratos,
                checkinsDeOntemSalvos: countCheckins,
                gradesFixasSalvas: countGrades
            }
        });

    } catch (error: any) {
        console.error("Erro critico no CRON Sync:", error);
        return NextResponse.json({ error: "Failed to sync EVO data", details: error.message }, { status: 500 });
    }
}

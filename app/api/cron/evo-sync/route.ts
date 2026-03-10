import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evoFetchPaginated } from "@/lib/evo/client";

// Vercel Cron Limits: Até 10s no Hobby, até 60s no Pro/Premium. Pro maxDuration: 300
export const maxDuration = 300; 
export const dynamic = 'force-dynamic'; // Evita cache agressivo do Next.js na rota de CRON

export async function GET(request: NextRequest) {
    // 1. Validar a Secret do CRON para evitar execuções maliciosas públicas
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
                            dataFim: mb.endDate ? new Date(mb.endDate) : new Date(mb.startDate)
                        },
                        create: {
                            idEvo: mb.idMembership.toString(),
                            idAluno: m.idMember.toString(),
                            nomePlano: mb.name,
                            status: mb.membershipStatus || 'active',
                            dataInicio: new Date(mb.startDate),
                            dataFim: mb.endDate ? new Date(mb.endDate) : new Date(mb.startDate)
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
                const dataCheckin = new Date(entry.date);
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

        console.log("=== CRON DE SINCRONIZAÇÃO CONCLUÍDO ===");
        return NextResponse.json({ 
            success: true, 
            message: `Sincronização do dia ${ontemStr} concluída.`,
            stats: {
                alunosVerificados: countAlunos,
                contratosAtualizados: countContratos,
                checkinsDeOntemSalvos: countCheckins
            }
        });

    } catch (error: any) {
        console.error("Erro critico no CRON Sync:", error);
        return NextResponse.json({ error: "Failed to sync EVO data", details: error.message }, { status: 500 });
    }
}

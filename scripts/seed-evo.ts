import { config } from 'dotenv';
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { evoFetchPaginated } from '../lib/evo/client';

const prisma = new PrismaClient();

async function runSeed() {
    console.log("Iniciando Carga Inicial (Seed) - EVO -> Prisma");
    
    // 1. Puxar todos os Alunos Ativos e seus Contratos
    // Na EVO, o endpoint /members traz as memberships (contratos) aninhadas, mas
    // são incompletas (só mostram o plano atual e muitas vezes comutam recorrentes antigos). 
    // Por isso vamos trazer os alunos do /members e DEPOIS todos os contratos de /membermembership
    console.log("--- Sincronizando Alunos (Members) ---");
    try {
        const members = await evoFetchPaginated<any>("/api/v1/members", { status: 1 });
        console.log(`Total de Alunos ativos retornados: ${members.length}`);

        let countAlunos = 0;

        for (const m of members) {
            const firstName = m.firstName || m.registerName;
            
            if (!m.idMember || !firstName) {
                continue;
            }
            
            let cellphone = null;
            let email = null;
            if (m.contacts && Array.isArray(m.contacts)) {
                const cellContact = m.contacts.find((c: any) => c.contactType === 'Celular');
                if (cellContact) cellphone = cellContact.description;

                const emailContact = m.contacts.find((c: any) => c.contactType === 'Email');
                if (emailContact) email = emailContact.description;
            }

            try {
                // 1.A. Salvar o Aluno
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

            } catch (err: any) {
                console.error(`Falha ao salvar aluno ${m.idMember}:`, err.message);
            }
        }
        console.log(`✅ ${countAlunos} Alunos salvos no banco local.`);
    } catch (error) {
        console.error("Erro ao buscar Alunos:", error);
    }

    // 1.B Salvar Contratos usando a API real de Memberships direta com node-fetch
    console.log("--- Sincronizando TODOS os Contratos (MemberMemberships) ---");
    try {
        let todasMemberships: any[] = [];
        let rSkip = 0;
        const rTake = 25;
        
        const credentials = Buffer.from(`${process.env.EVO_DNS}:${process.env.EVO_TOKEN}`).toString("base64");
        const headers = { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" };
        
        console.log("Baixando contratos ativos...");
        while (true) {
            const res = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=1&take=${rTake}&skip=${rSkip}`, { headers });
            const batchAtivos = await res.json();
            
            if (!Array.isArray(batchAtivos) || batchAtivos.length === 0) break;
            todasMemberships.push(...batchAtivos);
            if (batchAtivos.length < rTake) break;
            rSkip += rTake;
        }
        
        console.log("Baixando contratos inativos (todos, para capturar os de 2024-2025 ativos em 2026)...");
        rSkip = 0;
        while (true) {
            const res = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=2&take=${rTake}&skip=${rSkip}`, { headers });
            const batchInativos = await res.json();
            
            if (!Array.isArray(batchInativos) || batchInativos.length === 0) break;
            // Filtro client-side: ignorar contratos muito antigos (expirados antes de 2024)
            const filtrados = batchInativos.filter((mb: any) => {
                if (!mb.membershipEnd) return true; // Sem data de fim = vigente
                return new Date(mb.membershipEnd) >= new Date('2024-01-01');
            });
            todasMemberships.push(...filtrados);
            if (batchInativos.length < rTake) break;
            rSkip += rTake;
        }

        console.log(`Total de Contratos retornados (Ativos + Expirados 2026): ${todasMemberships.length}`);

        let countContratos = 0;

        for (const mb of todasMemberships) {
            // Em v3 o nome dos campos muda: nameMembership, membershipStart, membershipEnd
            // IMPORTANTE: idMembership = ID do PLANO (compartilhado por várias alunas! ex: SLIMFIT 2X CC)
            //             idMemberMembership = ID ÚNICO desta matrícula específica desta aluna!
            const idUnico = (mb.idMemberMembership || mb.idMemberMemberShip || mb.idMembership)?.toString();
            if (!idUnico || !mb.nameMembership || !mb.membershipStart) continue;
            
            try {
                // Precisa garantir que a aluna dona do contrato já existe no banco. Se ela for ex-aluna (inativa), o endpoint de /members lá de cima não a trouxe.
                // Criar um stub de aluna pra ela se não existir
                const alunoExiste = await prisma.aluno.findUnique({ where: { idEvo: mb.idMember.toString() }});
                if (!alunoExiste) {
                     await prisma.aluno.create({
                         data: {
                             idEvo: mb.idMember.toString(),
                             nome: mb.name || `(Ex-Aluna) ID ${mb.idMember}` // nome stub
                         }
                     });
                }
                
                await prisma.contrato.upsert({
                    where: { idEvo: idUnico },
                    update: {
                        nomePlano: mb.nameMembership,
                        status: mb.statusMemberMembership === 1 ? 'active' : 'canceled',
                        valor: mb.saleValue || 0,
                        dataInicio: new Date(mb.membershipStart),
                        dataFim: mb.membershipEnd ? new Date(mb.membershipEnd) : new Date("2099-12-31T23:59:59Z")
                    },
                    create: {
                        idEvo: idUnico,
                        idAluno: mb.idMember.toString(),
                        nomePlano: mb.nameMembership,
                        status: mb.statusMemberMembership === 1 ? 'active' : 'canceled',
                        valor: mb.saleValue || 0,
                        dataInicio: new Date(mb.membershipStart),
                        dataFim: mb.membershipEnd ? new Date(mb.membershipEnd) : new Date("2099-12-31T23:59:59Z")
                    }
                });
                countContratos++;
            } catch (err: unknown) {
                // Ignorar erros em massa
            }
        }
        
        console.log(`✅ ${countContratos} Contratos (Memberships Ativas) salvos no banco local.`);

    } catch (error) {
        console.error("Erro ao buscar Contratos:", error);
    }

    // 2. Puxar os Check-ins (Entries) de 01/01/2026 até hoje
    console.log("--- Sincronizando Check-ins (Entries) de 01/01/2026 em diante ---");
    try {
        // A API de entries da EVO requer 'dtStart' e 'dtEnd'
        const today = new Date();
        const sales = await evoFetchPaginated<any>("/api/v1/entries", { 
            dtStart: '2026-01-01',
            dtEnd: today.toISOString().split('T')[0]
        });
        
        console.log(`Total de Check-ins (Entries) retornados: ${sales.length}`);
        let countCheckins = 0;

        if (sales.length > 0) {
            console.log("FORMATO ENTRY NA API:", Object.keys(sales[0]));
            console.log("DADOS DA ENTRY:", JSON.stringify(sales[0], null, 2));
        }

        for (const entry of sales) {
            if (!entry.idMember || !entry.date) continue;

            try {
                const alunoExiste = await prisma.aluno.findUnique({ where: { idEvo: entry.idMember.toString() }});
                
                if (alunoExiste) {
                    // A EVO retorna datas como "2026-03-10T10:00:00" (BRT, sem sufixo Z/timezone)
                    // O JS interpreta como UTC → salva 3h antes do real (07:00 UTC em vez de 10:00 BRT)
                    // Ajuste: se o timeZone veio como "-03:00:00", adicionar 3h ao timestamp
                    const dataCheckinRaw = new Date(entry.date);
                    const offsetMs = entry.timeZone
                        ? -(parseInt(entry.timeZone.split(':')[0]) * 60) * 60000 // ex: -03 → +3h = 10800000ms
                        : 3 * 60 * 60 * 1000; // fallback: assume BRT = UTC-3 → adiciona 3h
                    const dataCheckin = new Date(dataCheckinRaw.getTime() + offsetMs);
                    
                    // Como a API de Entry não envia um id único, criamos um ID artificial (MemberID_Timestamp)
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
            } catch (err: any) {
                console.error(`Falha ao salvar checkin do aluno ${entry.idMember}:`, err.message);
            }
        }

        console.log(`✅ ${countCheckins} Check-ins salvos no banco local.`);

    } catch (error) {
        console.error("Erro ao buscar Check-ins:", error);
    }


    console.log("Seed concluído!");
}

runSeed()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

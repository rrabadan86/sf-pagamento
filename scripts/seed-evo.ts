import { config } from 'dotenv';
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { evoFetchPaginated } from '../lib/evo/client';

const prisma = new PrismaClient();

async function runSeed() {
    console.log("Iniciando Carga Inicial (Seed) - EVO -> Prisma");
    
    // 1. Puxar todos os Alunos Ativos e seus Contratos
    // Na EVO, o endpoint /members traz as memberships (contratos) aninhadas no aluno!
    console.log("--- Sincronizando Alunos (Members) e Contratos Ativos ---");
    try {
        const members = await evoFetchPaginated<any>("/api/v1/members", { status: 1 });
        console.log(`Total de Alunos ativos retornados: ${members.length}`);

        let countAlunos = 0;
        let countContratos = 0;

        if (members.length > 0) {
            console.log("FORMATO DO MEMBRO NA API:", Object.keys(members[0]));
            console.log("DADOS DO MEMBRO:", members[0].idMember, members[0].name, members[0].firstName);
        }

        for (const m of members) {
            const firstName = m.firstName || m.registerName;
            
            if (!m.idMember || !firstName) {
                console.log(`Skipping member ${m.idMember} - without name`);
                continue;
            }
            
            // O celular as vezes vem numa array de contacts
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

                // 1.B. Salvar os Contratos (Memberships) que vieram aninhados no próprio aluno
                if (m.memberships && Array.isArray(m.memberships)) {
                    for (const mb of m.memberships) {
                        if (!mb.idMembership || !mb.name || !mb.startDate) {
                           continue;
                        }
                        
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
            } catch (err: any) {
                console.error(`Falha ao salvar aluno ${m.idMember}:`, err.message);
            }
        }
        console.log(`✅ ${countAlunos} Alunos salvos no banco local.`);
        console.log(`✅ ${countContratos} Contratos (Memberships Ativas) salvos no banco local.`);

    } catch (error) {
        console.error("Erro ao buscar Alunos/Contratos:", error);
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
                    const dataCheckin = new Date(entry.date);
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

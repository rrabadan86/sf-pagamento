import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function run() {
    // Who are the March 2026 check-ins?
    const checkins = await prisma.checkin.findMany({
        where: {
            dataHora: { gte: new Date(2026, 2, 1), lte: new Date(2026, 2, 31, 23, 59, 59) }
        },
        include: { aluno: true },
        orderBy: { dataHora: 'asc' }
    });
    
    console.log(`Check-ins Mar/2026: ${checkins.length}`);
    checkins.forEach((c: any) => {
        console.log(`  ${c.dataHora.toISOString().substring(0,16)} - ${c.aluno.nome} (idAluno: ${c.idAluno})`);
    });
    
    // Check if FREE/VIP students have ANY check-ins
    const freeStudents = ['juliana', 'sintia', 'duanny', 'bruna'];
    console.log('\n--- FREE/VIP Students Check-ins ---');
    for (const name of freeStudents) {
        const found = checkins.filter((c: any) => c.aluno.nome.toLowerCase().includes(name));
        console.log(`${name}: ${found.length} check-ins`);
    }
    
    // Check if FREE students are in Aluno table
    console.log('\n--- FREE/VIP Students in Aluno table ---');
    const alunas = await prisma.aluno.findMany({ orderBy: { nome: 'asc' } });
    const freeAlunas = alunas.filter((a: any) => 
        ['juliana', 'sintia', 'síntia', 'duanny', 'bruna'].some(n => a.nome.toLowerCase().includes(n))
    );
    freeAlunas.forEach((a: any) => console.log(`  ${a.nome} (idEvo: ${a.idEvo})`));
    
    // Check their contracts
    console.log('\n--- FREE/VIP Contracts in Mar/2026 ---');
    const freeContracts = await prisma.contrato.findMany({
        where: {
            dataInicio: { lte: new Date(2026, 2, 31) },
            dataFim: { gte: new Date(2026, 2, 1) },
            nomePlano: { contains: 'FREE' }
        },
        include: { aluno: true }
    });
    const vipContracts = await prisma.contrato.findMany({
        where: {
            dataInicio: { lte: new Date(2026, 2, 31) },
            dataFim: { gte: new Date(2026, 2, 1) },
            nomePlano: { contains: 'VIP' }
        },
        include: { aluno: true }
    });
    
    [...freeContracts, ...vipContracts].forEach((c: any) => {
        console.log(`  ${c.aluno.nome} - ${c.nomePlano} (idAluno: ${c.idAluno})`);
    });
}

run().catch(console.error);

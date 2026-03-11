import { config } from 'dotenv';
config({ path: '.env' });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const mes = 2;
    const ano = 2026;
    const dataInicioBusca = new Date(ano, mes - 1, 1);
    const dataFimBusca = new Date(ano, mes, 0, 23, 59, 59);

    const contratos = await (prisma as any).contrato.findMany({
        where: {
            OR: [
                {
                    dataInicio: { lte: dataFimBusca },
                    dataFim: { gte: dataInicioBusca }
                }
            ]
        },
        include: { aluno: true }
    });

    console.log('Total contratos para Fev/2026:', contratos.length);
    const unique = new Set(contratos.map((c: any) => c.idAluno));
    console.log('Alunas unicas com contratos em Fev/2026:', unique.size);

    // Show sample
    contratos.slice(0, 10).forEach((c: any) => {
        console.log(
            c.aluno.nome.padEnd(40),
            c.nomePlano.substring(0, 35).padEnd(35),
            c.dataInicio.toISOString().substring(0, 10),
            '->',
            c.dataFim.toISOString().substring(0, 10),
            'R$', c.valor
        );
    });
}

run();

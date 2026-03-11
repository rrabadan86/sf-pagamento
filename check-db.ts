import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const allC = await prisma.contrato.findMany({ include: {aluno:true}});
    console.log('Total no Bd:', allC.length);
    
    const canceladosAnteriores = allC.filter(c => c.dataFim.getTime() < new Date(2026, 1, 1).getTime());
    console.log('Cancelados/Expirados ANTES de Fev 2026:', canceladosAnteriores.length);
    
    const vigentesEmFev = allC.filter(c => 
        c.dataInicio.getTime() <= new Date(2026, 2, 0, 23, 59, 59).getTime() && 
        c.dataFim.getTime() >= new Date(2026, 1, 1).getTime()
    );
    console.log('Vigentes em Fev 2026:', vigentesEmFev.length);
}

run();

import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient() as any;

async function run() {
    const profs = await prisma.professorPercentual.findMany({ orderBy: { nomeProfessor: 'asc' } });
    console.log('Percentuais por professor:');
    profs.forEach((p: any) => {
        console.log(`  ${p.nomeProfessor}: percentual=${p.percentual} piso=${p.piso} teto=${p.teto} (dataInicio: ${p.dataInicio?.toISOString().substring(0,10)})`);
    });
}
run().catch(console.error);

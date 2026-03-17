import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
    
    // ============================================================
    // ISSUE 1: Elizabeth Ferreira Guimarães Zenha
    // ============================================================
    console.log('=== ELIZABETH ZENHA ===');
    const elizabeth = await prisma.aluno.findMany({
        where: { nome: { contains: 'Elizabeth', mode: 'insensitive' } },
        include: { contratos: true, gradesFixas: true }
    });
    for (const a of elizabeth) {
        console.log(`ID: ${a.idEvo}, Nome: ${a.nome}`);
        for (const c of a.contratos) {
            console.log(`  Contrato: [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
            
            // Simulate the value calculation
            const nameLower = c.nomePlano.toLowerCase();
            let explicitMonths = 0;
            if (nameLower.includes("anual")) explicitMonths = 12;
            else if (nameLower.includes("semestral")) explicitMonths = 6;
            else if (nameLower.includes("trimestral")) explicitMonths = 3;
            else if (nameLower.includes("bimestral")) explicitMonths = 2;
            else if (nameLower.includes("mensal")) explicitMonths = 1;
            
            let valorMes = c.valor;
            if (explicitMonths > 0) {
                valorMes = c.valor / explicitMonths;
            } else {
                // Check date-based
                const start = new Date(c.dataInicio);
                const end = new Date(c.dataFim);
                let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                if (months <= 0) months = 1;
                console.log(`    -> Date-based months: ${months}`);
                if (months > 1 && months <= 24) valorMes = c.valor / months;
            }
            
            console.log(`    -> explicitMonths: ${explicitMonths}`);
            console.log(`    -> valorMes (antes 97%): R$${valorMes.toFixed(2)}`);
            valorMes = Math.round(valorMes * 0.97 * 100) / 100;
            console.log(`    -> valorMes (após 97%): R$${valorMes.toFixed(2)}`);
            
            // Frequency parsing
            const nameStr = c.nomePlano.toUpperCase();
            let freq = 0;
            const matchAulaPre = nameStr.match(/(\d+)\s*X\s*(?:SLIM|CIRC|AULA)/);
            const matchAulaPos = nameStr.match(/(?:SLIM|CIRC|AULA)\s*(\d+)\s*X/);
            if (matchAulaPre) {
                freq = parseInt(matchAulaPre[1]);
                console.log(`    -> matchAulaPre: "${matchAulaPre[0]}" → freq=${freq}`);
            } else if (matchAulaPos) {
                freq = parseInt(matchAulaPos[1]);
                console.log(`    -> matchAulaPos: "${matchAulaPos[0]}" → freq=${freq}`);
            } else {
                const stringXMatches = nameStr.match(/(\d+)\s*X/g);
                if (stringXMatches && stringXMatches.length > 0) {
                    for (const x of stringXMatches) freq += parseInt(x.replace(/\D/g, ""));
                    console.log(`    -> fallback X matches: ${JSON.stringify(stringXMatches)} → freq=${freq}`);
                }
            }
            
            const diasNoMes = 31; // March 2026
            let diasDeTreinoNoMes = freq > 0 ? Math.round(freq * (diasNoMes / 7)) : 0;
            console.log(`    -> diasDeTreinoNoMes: ${diasDeTreinoNoMes}`);
            
            if (diasDeTreinoNoMes > 0) {
                const contrib = (valorMes * (20 / 100)) / diasDeTreinoNoMes;
                console.log(`    -> contrib/aula (20%): R$${contrib.toFixed(2)}`);
            }
        }
        console.log(`  Grades Fixas:`);
        for (const g of a.gradesFixas) {
            console.log(`    - ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
        }
    }

    // ============================================================
    // ISSUE 2: Síntia M Ribeiro Felipe (VIP)
    // ============================================================
    console.log('\n=== SÍNTIA ===');
    const sintia = await prisma.aluno.findMany({
        where: { nome: { contains: 'Sintia', mode: 'insensitive' } },
        include: { contratos: true, gradesFixas: true }
    });
    if (sintia.length === 0) {
        // Try Síntia
        const sintia2 = await prisma.aluno.findMany({
            where: { nome: { contains: 'ntia', mode: 'insensitive' } },
            include: { contratos: true, gradesFixas: true }
        });
        for (const a of sintia2) {
            console.log(`ID: ${a.idEvo}, Nome: ${a.nome}`);
            for (const c of a.contratos) {
                console.log(`  Contrato: [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
                // tipoDePlano check
                const lower = c.nomePlano.toLowerCase();
                const isFree = lower.includes("free") || lower.includes("vip");
                const isFixa = lower.includes("fixa") || lower.includes("recorrente");
                console.log(`    -> free=${isFree}, fixa=${isFixa}, tipoDePlano=${isFree ? 'free' : isFixa ? 'fixo' : 'fixo'}`);
            }
        }
    } else {
        for (const a of sintia) {
            console.log(`ID: ${a.idEvo}, Nome: ${a.nome}`);
            for (const c of a.contratos) {
                console.log(`  Contrato: [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
                const lower = c.nomePlano.toLowerCase();
                const isFree = lower.includes("free") || lower.includes("vip");
                const isFixa = lower.includes("fixa") || lower.includes("recorrente");
                console.log(`    -> free=${isFree}, fixa=${isFixa}`);
            }
        }
    }

    // ============================================================
    // ISSUE 3: Fernanda Siqueira (5310)
    // ============================================================
    console.log('\n=== FERNANDA SIQUEIRA (5310) ===');
    const fernanda = await prisma.aluno.findUnique({
        where: { idEvo: '5310' },
        include: { contratos: true, gradesFixas: true }
    });
    if (fernanda) {
        console.log(`ID: ${fernanda.idEvo}, Nome: ${fernanda.nome}`);
        for (const c of fernanda.contratos) {
            console.log(`  Contrato: [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
        }
        console.log(`  Grades Fixas:`);
        for (const g of fernanda.gradesFixas) {
            console.log(`    - ${g.activityName} | ${dias[g.weekDay]} ${g.startTime} | status=${g.status} | ${g.startDate.toISOString().substring(0,10)} até ${g.endDate ? g.endDate.toISOString().substring(0,10) : 'NULL'}`);
        }
        
        // Check if she has active grades for Mon/Wed/Fri 08:15
        const activeGrades = fernanda.gradesFixas.filter(g => g.status === 1);
        console.log(`\n  Grades ativas (status=1): ${activeGrades.length}`);
        for (const g of activeGrades) {
            console.log(`    - ${g.activityName} | ${dias[g.weekDay]} ${g.startTime}`);
        }
        
        // Check if she'd be found in March 2026 contract query
        const dataInicioBusca = new Date(2026, 2, 1);
        const dataFimBusca = new Date(2026, 3, 0, 23, 59, 59);
        const contratos = await prisma.contrato.findMany({
            where: {
                idAluno: '5310',
                dataInicio: { lte: dataFimBusca },
                dataFim: { gte: dataInicioBusca }
            }
        });
        console.log(`\n  Contratos válidos para Março/2026: ${contratos.length}`);
        for (const c of contratos) {
            console.log(`    [${c.status}] ${c.nomePlano} | R$${c.valor} | ${c.dataInicio.toISOString().substring(0,10)} até ${c.dataFim.toISOString().substring(0,10)}`);
        }
    } else {
        console.log('  NÃO ENCONTRADA!');
    }

    await prisma.$disconnect();
}

main().catch(console.error);

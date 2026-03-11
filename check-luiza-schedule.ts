import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });

const BASE = process.env.EVO_BASE_URL!;
const DNS = process.env.EVO_DNS!;
const TOKEN = process.env.EVO_TOKEN!;
const creds = Buffer.from(`${DNS}:${TOKEN}`).toString('base64');
const headers = { Authorization: `Basic ${creds}` };

async function fetchWeek(date: string) {
    const url = `${BASE}/api/v1/activities/schedule?date=${date}&showFullWeek=true&take=50&skip=0`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
        console.error(`Error ${res.status} for ${date}`);
        return [];
    }
    return await res.json() as any[];
}

async function run() {
    const mes = 2;
    const ano = 2026;
    const mesStr = String(mes).padStart(2, '0');
    const dates = [1, 8, 15, 22, 28].map(d => `${ano}-${mesStr}-${String(d).padStart(2, '0')}`);
    
    const allAulas: any[] = [];
    const seen = new Set<string>();
    
    for (const date of dates) {
        const week = await fetchWeek(date);
        for (const a of week) {
            const d = new Date(a.activityDate);
            if (d.getMonth() + 1 !== mes || d.getFullYear() !== ano) continue;
            const key = `${a.idActivity}_${a.activityDate}_${a.startTime}`;
            if (!seen.has(key)) {
                seen.add(key);
                allAulas.push(a);
            }
        }
    }
    
    console.log(`Total aulas Fev/2026: ${allAulas.length}`);
    
    // Luiza at 10:45 Wednesdays
    const luizaQ1045 = allAulas.filter(a => {
        const d = new Date(a.activityDate);
        return (a.instructor||'').toLowerCase().includes('luiza') 
            && d.getDay() === 3 
            && a.startTime.startsWith('10:');
    });
    
    console.log(`\nLuiza Quarta ~10h45: ${luizaQ1045.length} aulas`);
    luizaQ1045.forEach((a: any) => {
        const d = new Date(a.activityDate);
        console.log(`  ${d.toLocaleDateString('pt-BR', { weekday: 'long', day:'2-digit', month:'2-digit' })} ${a.startTime} -> ${a.name}`);
    });
    
    // All Luiza classes grouped by turma
    const luizaTodas = allAulas.filter(a => (a.instructor||'').toLowerCase().includes('luiza'));
    console.log(`\nTodas as turmas da Luiza:`);
    const byTurma: Record<string, any[]> = {};
    for (const a of luizaTodas) {
        const k = `${a.name} - ${a.startTime}`;
        if (!byTurma[k]) byTurma[k] = [];
        byTurma[k].push(a);
    }
    Object.entries(byTurma).sort().forEach(([k, aulas]) => {
        const dates = aulas.map((a: any) => new Date(a.activityDate).getDate()).join(', ');
        console.log(`  [${aulas.length}x] ${k.padEnd(60)} dias: ${dates}`);
    });
}

run().catch(console.error);

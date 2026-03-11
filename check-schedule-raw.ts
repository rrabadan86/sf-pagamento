import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });

const BASE = process.env.EVO_BASE_URL!;
const DNS = process.env.EVO_DNS!;
const TOKEN = process.env.EVO_TOKEN!;
const creds = Buffer.from(`${DNS}:${TOKEN}`).toString('base64');
const headers = { Authorization: `Basic ${creds}` };

async function fetchWeek(date: string) {
    const res = await fetch(`${BASE}/api/v1/activities/schedule?date=${date}&showFullWeek=true&take=50&skip=0`, { headers });
    return await res.json() as any[];
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

async function run() {
    const mes = 2; const ano = 2026; const mesStr = '02';
    const dates = [1, 8, 15, 22, 28].map(d => `${ano}-${mesStr}-${String(d).padStart(2, '0')}`);
    
    const allAulas: any[] = [];
    const seen = new Set<string>();
    
    for (const date of dates) {
        const week = await fetchWeek(date);
        for (const a of week) {
            const d = new Date(a.activityDate);
            if (d.getMonth() + 1 !== mes || d.getFullYear() !== ano) continue;
            const key = `${a.idActivity}_${a.activityDate}_${a.startTime}`;
            if (!seen.has(key)) { seen.add(key); allAulas.push(a); }
        }
    }
    
    // Find SLIMFIT B at 10:45 for Luiza
    const target = allAulas.filter((a: any) => 
        (a.instructor||'').toLowerCase().includes('luiza') && a.startTime.startsWith('10:4')
    );
    
    console.log(`Sessões SLIMFIT B 10:45 Luiza: ${target.length}`);
    target.sort((a: any, b: any) => new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime());
    target.forEach((a: any) => {
        const d = new Date(a.activityDate);
        console.log(`  [${DAYS[d.getDay()]}] activityDate: "${a.activityDate}" | getDay()=${d.getDay()} | instructor="${a.instructor}" | idActivity=${a.idActivity} | idAtividadeSessao=${a.idAtividadeSessao}`);
    });
}

run().catch(console.error);

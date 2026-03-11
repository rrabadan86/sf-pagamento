import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });

const BASE = process.env.EVO_BASE_URL!;
const DNS = process.env.EVO_DNS!;
const TOKEN = process.env.EVO_TOKEN!;
const creds = Buffer.from(`${DNS}:${TOKEN}`).toString('base64');
const headers = { Authorization: `Basic ${creds}` };

async function run() {
    // Check entries for February 2026
    const r = await fetch(`${BASE}/api/v1/entries?dtStart=2026-02-01&dtEnd=2026-02-28&take=50&skip=0`, { headers });
    const entries = await r.json() as any[];
    console.log(`Check-ins EVO Fev/2026 (take=50): ${entries.length}`);
    
    // Entries at 10:45 range Wednesday
    const q1045 = entries.filter((e: any) => {
        const d = new Date(e.date);
        return d.getDay() === 3 && d.getHours() >= 10 && d.getHours() <= 11;
    });
    console.log(`Check-ins Quarta 10-11h Fev/2026: ${q1045.length}`);
    q1045.forEach((e: any) => {
        console.log(`  ${e.date} - ${e.nameMember}`);
    });
}

run().catch(console.error);

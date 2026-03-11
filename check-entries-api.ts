import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });

const BASE = process.env.EVO_BASE_URL!;
const DNS = process.env.EVO_DNS!;
const TOKEN = process.env.EVO_TOKEN!;
const creds = Buffer.from(`${DNS}:${TOKEN}`).toString('base64');
const headers = { Authorization: `Basic ${creds}` };

async function run() {
    // Get today's full schedule  
    const schedR = await fetch(`${BASE}/api/v1/activities/schedule?date=2026-03-10&showFullWeek=false&take=50`, { headers });
    const sched = await schedR.json() as any[];
    console.log(`Sessions on 2026-03-10: ${sched.length}`);
    sched.forEach((s: any) => console.log(`  ${s.idAtividadeSessao} | ${s.startTime} | ${s.name} | ${s.instructor} | bookings: ${s.totalBookings}`));
    
    // Try attendance for all sessions
    for (const s of sched) {
        // Try getTurmaEnrollments equivalent — using the enrollment endpoint
        const url1 = `${BASE}/api/v1/activities/session/${s.idAtividadeSessao}?take=50`;
        const r1 = await fetch(url1, { headers });
        const t1 = await r1.text();
        
        // Try the checkins endpoint per session
        const url2 = `${BASE}/api/v1/activities/schedule/${s.idAtividadeSessao}/checkins?take=50`;
        const r2 = await fetch(url2, { headers });
        const t2 = await r2.text();
        
        if (t1.length > 5 || t2.length > 5) {
            console.log(`\nSession ${s.idAtividadeSessao} (${s.name} ${s.startTime}):`);
            if (t1.length > 5) console.log('  session endpoint:', t1.substring(0, 300));
            if (t2.length > 5) console.log('  checkins endpoint:', t2.substring(0, 300));
        }
    }
    
    // Also look for the booking/enrollment per session endpoint
    if (sched.length > 0) {
        const s = sched[0];
        const urls = [
            `/api/v1/activities/session/${s.idAtividadeSessao}/enrollments`,
            `/api/v1/activities/${s.idActivity}/session/${s.idAtividadeSessao}`,
            `/api/v1/activities/schedule/${s.idAtividadeSessao}`,
        ];
        for (const path of urls) {
            const r = await fetch(`${BASE}${path}?take=50`, { headers });
            const t = await r.text();
            console.log(`${path}: status ${r.status}, len ${t.length}, preview: ${t.substring(0, 200)}`);
        }
    }
}

run().catch(console.error);

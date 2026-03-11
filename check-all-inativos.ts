import { config } from 'dotenv';
config({ path: '.env' });

async function run() {
    const credentials = Buffer.from(`${process.env.EVO_DNS}:${process.env.EVO_TOKEN}`).toString('base64');
    const headers = { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' };

    let total = 0;
    let page = 0;
    const take = 25;

    while (true) {
        const skip = page * take;
        const res = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=2&take=${take}&skip=${skip}`, { headers });
        const batch = await res.json() as any[];
        
        if (!Array.isArray(batch) || batch.length === 0) break;
        total += batch.length;
        console.log(`Página ${page}: ${batch.length} contratos (total acum: ${total})`);
        batch.forEach((c: any) => {
            const start = c.membershipStart?.substring(0, 10) || '?';
            const end = c.membershipEnd?.substring(0, 10) || '?';
            console.log(`  ${String(c.idMember).padStart(6)} ${c.nameMembership?.substring(0,40).padEnd(40)} ${start} -> ${end}`);
        });
        
        if (batch.length < take) break;
        page++;
    }
    
    console.log(`\nTOTAL contratos inativos: ${total}`);
}

run();

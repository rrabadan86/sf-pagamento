import { config } from 'dotenv';
config({ path: '.env' });

async function run() {
    const credentials = Buffer.from(`${process.env.EVO_DNS}:${process.env.EVO_TOKEN}`).toString('base64');
    const headers = { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' };

    // Test 1: ativos (status=1)
    const r1 = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=1&take=5&skip=0`, { headers });
    const j1 = await r1.json() as any[];
    console.log('Contratos ativos (status=1), count:', j1.length);
    if (j1[0]) console.log('Sample ativo:', j1[0].idMember, j1[0].nameMembership, j1[0].membershipStart, '->', j1[0].membershipEnd);

    // Test 2: inativos (status=2) sem filtro
    const r2 = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=2&take=5&skip=0`, { headers });
    const j2 = await r2.json() as any[];
    console.log('\nContratos inativos (status=2) sem filtro, count:', j2.length);
    if (j2[0]) console.log('Sample inativo s/filtro:', j2[0].idMember, j2[0].nameMembership, j2[0].membershipStart, '->', j2[0].membershipEnd, 'cancelDate:', j2[0].cancelDate);

    // Test 3: inativos com memberStartDate=2024-01-01
    const r3 = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=2&memberStartDate=2024-01-01&take=5&skip=0`, { headers });
    const j3 = await r3.json() as any[];
    console.log('\nContratos inativos com memberStartDate=2024-01-01, count:', j3.length);
    if (j3[0]) console.log('Sample:', j3[0].idMember, j3[0].nameMembership, j3[0].membershipStart, '->', j3[0].membershipEnd);

    // Test 4: inativos com membershipStartDate=2024-01-01 (variação do nome)
    const r4 = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=2&membershipStartDate=2024-01-01&take=5&skip=0`, { headers });
    const j4 = await r4.json() as any[];
    console.log('\nContratos inativos com membershipStartDate=2024-01-01, count:', j4.length);
    
    // Test 5: inativos com startDateMembership=2024-01-01 (outra variação)
    const r5 = await fetch(`${process.env.EVO_BASE_URL}/api/v3/membermembership?statusMemberMembership=2&startDateMembership=2024-01-01&take=5&skip=0`, { headers });
    const j5 = await r5.json() as any[];
    console.log('\nContratos inativos com startDateMembership=2024-01-01, count:', j5.length);
    if (j5[0]) console.log('Sample:', j5[0].idMember, j5[0].nameMembership, j5[0].membershipStart);
}

run();

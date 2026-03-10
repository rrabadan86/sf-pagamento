import { config } from 'dotenv';
config({ path: '.env' });

async function run() {
    const { NextRequest } = await import('next/server');
    const { GET } = await import('./app/api/calculo/route');
    const req = new NextRequest('http://localhost:3000/api/calculo?mes=2&ano=2026');
    const res = await GET(req);
    const json = await res.json();

    // Find Luiza
    const luizaData = json.professores?.find((p: any) => p.nomeProfessor.toLowerCase().includes('luiza'));
    if (!luizaData) {
        console.log("Luiza not found in Feb 2026 calculations.");
        return;
    }

    // Find Wednesday 10:45 class
    const t = luizaData.turmas.find((x: any) => x.diasDaSemana.includes("Quarta-feira"));
    if (t) {
        const dia11 = t.dias.find((d: any) => d.totalAulasNoMes === 1); // 11/02 is likely isolated as 1 class day if others are different
        console.log(JSON.stringify(t, null, 2));
    } else {
        console.log("Quarta class not found", JSON.stringify(luizaData.turmas.map((x: any) => x.diasDaSemana), null, 2));
    }
}
run();

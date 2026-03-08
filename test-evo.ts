import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const { evoFetchPaginated } = await import('./lib/evo/client');
    try {
        // Buscar matriculas ativas E canceladas para ver ambas
        const ativas = await evoFetchPaginated<any>('/api/v3/membermembership', {
            statusMemberMembership: 1,
            take: 25,
        });
        const canceladas = await evoFetchPaginated<any>('/api/v3/membermembership', {
            statusMemberMembership: 2,
            cancelDateStart: "2025-01-01",
            take: 25,
        });
        const memberships = [...ativas, ...canceladas];

        // Filtrar pela Rachel de Oliveira Motta
        const rachel = memberships.filter((m: any) => m.name && m.name.toLowerCase().includes('rachel de oliveira'));

        if (rachel.length === 0) {
            console.log('Rachel não encontrada');
            return;
        }

        rachel.forEach((m: any) => {
            const start = m.membershipStart ? new Date(m.membershipStart) : null;
            const end = m.membershipEnd ? new Date(m.membershipEnd) : null;
            let months = 0;
            if (start && end) {
                months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            }
            const valorMes = months > 1 && months <= 24 ? m.saleValue / months : m.saleValue;
            const valorMes97 = Math.round(valorMes * 0.97 * 100) / 100;
            console.log('============================');
            console.log(`Nome: ${m.name}`);
            console.log(`idMemberMembership: ${m.idMemberMemberShip}`);
            console.log(`nameMembership: ${m.nameMembership}`);
            console.log(`saleValue: ${m.saleValue}  start:${m.membershipStart}  end:${m.membershipEnd}  months:${months}`);
            console.log(`  -> valorMes=${valorMes}  97%=${valorMes97}`);
            console.log(`cancelDate: ${m.cancelDate}  registerCancelDate: ${m.registerCancelDate}`);
            console.log('Receivables não cancelados:');
            (m.receivables || []).filter((r: any) => !r.canceled).forEach((r: any) => {
                console.log(`  id:${r.idReceivable} amount:${r.ammount} totalInstall:${r.totalInstallments} current:${r.currentInstallment}`);
            });
        });

    } catch (e) {
        console.error(e);
    }
}

run();

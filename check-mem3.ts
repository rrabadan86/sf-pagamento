import { config } from 'dotenv';
config({ path: '.env' });
import { evoFetchPaginated } from './lib/evo/client';

async function run() {
    try {
        console.log("Iniciando requisição...");
        const res = await evoFetchPaginated('/api/v3/membermembership', { statusMemberMembership: 1, take: 5 });
        console.log('Total recebido:', res.length);
        if (res.length > 0) {
            console.log('Primeiro item:', Object.keys(res[0]));
        } else {
             console.log("Veio vazio =(");
        }
    } catch(e: any) {
        console.error(e.message);
    }
}
run();

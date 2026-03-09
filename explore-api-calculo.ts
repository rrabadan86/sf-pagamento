import { config } from 'dotenv';
config({ path: '.env.local' });
import { GET } from './app/api/calculo/route';

async function run() {
    console.time("calculo-api");
    const req = new Request("http://localhost/api/calculo?mes=3&ano=2026", {
        headers: { "Authorization": "dev-override" }
    });

    // override getServerSession logic
    // we must patch getServerSession in next-auth maybe? Since it's server-side it might fail if we don't mock it.
}
run();

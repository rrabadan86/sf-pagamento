import { config } from "dotenv";
config({ path: ".env.local" });

async function run() {
    const headers = {
        "Authorization": "Basic c2xpbWZpdDpEQzY4ODZFNC1GRTdELTRCQTktOUE5OS01RjdDNDk5OTQyNTE="
    };

    try {
        console.log(`\nTESTANDO member-enrollment para aluna 6469`);
        const r = await fetch(`https://evo-integracao.w12app.com.br/api/v1/activities/enrollment/member-enrollment?idMember=6469`, { headers });
        console.log(`STATUS: ${r.status}`);
        if (r.ok) {
            const json = await r.json();
            console.log(JSON.stringify(json, null, 2).slice(0, 1000));
        } else {
            console.log(await r.text());
        }
    } catch (e) { console.error(e) }
}
run();

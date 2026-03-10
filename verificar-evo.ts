import { config } from "dotenv";
config({ path: ".env.local" });
import { getSchedule } from "./lib/evo/queries";
import { getTurmaEnrollments } from "./lib/evo/enrollments";

async function run() {
    const s = await getSchedule(2, 2026);
    if (s.length > 0) {
        console.log("Schedule 0:", s[0]);
        console.log("Getting enrolls...");
        try {
            const res = await fetch(`https://evo-integracao.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession=${s[0].idAtividadeSessao}`, {
                headers: {
                    "Authorization": "Basic c2xpbWZpdDpEQzY4ODZFNC1GRTdELTRCQTktOUE5OS01RjdDNDk5OTQyNTE="
                }
            }).then(r => r.json());
            console.log(JSON.stringify(res, null, 2));
        } catch (e) { console.error(e) }
    }
}
run();

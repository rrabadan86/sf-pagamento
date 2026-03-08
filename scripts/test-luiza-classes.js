require("dotenv").config({ path: ".env.local" });
const { getSchedule } = require("../lib/evo/queries");

async function test() {
    const mes = 2, ano = 2026;
    const schedule = await getSchedule(mes, ano);

    const luizaClasses = schedule.filter(a => a.instructor === "Luiza Peixoto");

    // Group by idActivity
    const byId = {};
    for (const c of luizaClasses) {
        const key = `${c.name} - ${c.startTime} (idActivity: ${c.idActivity})`;
        if (!byId[key]) byId[key] = { days: new Set(), sampleSession: c.idAtividadeSessao, total: 0 };
        const date = new Date(c.activityDate);
        byId[key].days.add(date.getDay());
        byId[key].total++;
    }

    for (const [key, val] of Object.entries(byId)) {
        console.log(`${key}: ${val.total} aulas. Dias da semana:`, Array.from(val.days));
        console.log(`Sample idAtividadeSessao: ${val.sampleSession}`);
    }
}

test().catch(console.error);

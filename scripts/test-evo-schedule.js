require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;
const EVO_DNS = process.env.EVO_DNS;
const EVO_TOKEN = process.env.EVO_TOKEN;

function getAuthHeader() {
    const credentials = Buffer.from(`${EVO_DNS}:${EVO_TOKEN}`).toString("base64");
    return `Basic ${credentials}`;
}

async function testApi() {
    const headers = { Authorization: getAuthHeader(), "Content-Type": "application/json" };
    const res = await fetch(`${EVO_BASE_URL}/api/v1/activities/schedule?date=2026-02-01&showFullWeek=true&take=1`, { headers });
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items;
    if (items && items.length > 0) {
        console.log("EvoSchedule raw response:", JSON.stringify(items[0], null, 2));
    }
}

testApi();

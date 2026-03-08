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
    const res = await fetch(`${EVO_BASE_URL}/api/v1/activities/schedule/detail?idActivitySession=126725`, { headers });

    if (!res.ok) {
        console.error("Detail Error:", res.status, await res.text());
    } else {
        const data = await res.json();
        console.log("Detail response enrollments count:", data.enrollments?.length);
        if (data.enrollments && data.enrollments.length > 0) {
            console.log("Sample participant:", JSON.stringify(data.enrollments[0], null, 2));
            console.log("All participant names:", data.enrollments.map(e => e.name));
        }
    }
}

testApi();

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

    // Test with 'date' and 'showFullWeek'
    const urlParams = new URLSearchParams({
        date: "2026-02-01",
        showFullWeek: "true",
        take: "50",
        skip: "0"
    });

    console.log("Fetching Schedule with showFullWeek=true (around Feb 1 2026)...");
    const res = await fetch(`${EVO_BASE_URL}/api/v1/activities/schedule?${urlParams.toString()}`, { headers });

    if (!res.ok) {
        console.error("Schedule Error:", res.status, await res.text());
    } else {
        const data = await res.json();
        console.log("Schedule Items Count:", Array.isArray(data) ? data.length : (data.items?.length || 0));
        const items = Array.isArray(data) ? data : data.items;
        if (items && items.length > 0) {
            console.log("Sample activities dates:", items.slice(0, 3).map(i => i.activityDate));
            console.log("Instructors found:", [...new Set(items.map(i => i.instructor))]);
        }
    }
}

testApi();

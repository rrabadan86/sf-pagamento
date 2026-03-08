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
    const res = await fetch(`${EVO_BASE_URL}/api/v1/activities/enrollment?date=2026-02-02`, { headers });
    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items;
    if (items && items.length > 0) {
        console.log("enrollment items count:", items.length);
        console.log("first item:", JSON.stringify(items[0], null, 2));
    } else {
        console.log("no items found or error:", data);
    }
}

testApi();

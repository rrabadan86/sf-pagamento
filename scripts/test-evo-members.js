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

    // Test MemberMembership Active (statusMemberMembership=1)
    const urlParams = new URLSearchParams({
        statusMemberMembership: "1",
        take: "50",
        skip: "0"
    });

    console.log("Fetching Active Memberships...");
    const res = await fetch(`${EVO_BASE_URL}/api/v3/membermembership?${urlParams.toString()}`, { headers });

    if (!res.ok) {
        console.error("Membership Error:", res.status, await res.text());
    } else {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.items;
        console.log("Returned items in first page:", items?.length);
        if (items && items.length > 0) {
            console.log("Sample membership:", JSON.stringify(items[0], null, 2));
        }
    }
}

testApi();

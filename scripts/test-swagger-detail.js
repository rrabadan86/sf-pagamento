require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;

async function testSwagger() {
    const res = await fetch(`${EVO_BASE_URL}/swagger/v1/swagger.json`);
    const swagger = await res.json();
    const detailPath = swagger.paths["/api/v1/activities/schedule/detail"];
    console.log("schedule/detail GET parameters:", JSON.stringify(detailPath?.get?.parameters, null, 2));
}

testSwagger();

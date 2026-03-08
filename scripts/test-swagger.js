require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;

async function testSwagger() {
    const res = await fetch(`${EVO_BASE_URL}/swagger/v1/swagger.json`);
    if (!res.ok) {
        console.error("Swagger Error:", res.status);
        return;
    }
    const swagger = await res.json();
    const schedulePath = swagger.paths["/api/v1/activities/schedule"];
    console.log("Schedule GET parameters:", JSON.stringify(schedulePath?.get?.parameters, null, 2));
}

testSwagger();

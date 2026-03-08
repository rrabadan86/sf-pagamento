require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;

async function testSwagger() {
    const res = await fetch(`${EVO_BASE_URL}/swagger/v1/swagger.json`);
    const swagger = await res.json();
    const enrollPath = swagger.paths["/api/v1/activities/enrollment"];
    console.log("activities/enrollment GET parameters:", JSON.stringify(enrollPath?.get?.parameters, null, 2));
}

testSwagger();

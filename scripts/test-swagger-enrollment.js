require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;

async function testSwagger() {
    const res = await fetch(`${EVO_BASE_URL}/swagger/v1/swagger.json`);
    const swagger = await res.json();
    const enrollmentPath = swagger.paths["/api/v1/activities/enrollment/member-enrollment"];
    console.log("member-enrollment GET parameters:", JSON.stringify(enrollmentPath?.get?.parameters, null, 2));
}

testSwagger();

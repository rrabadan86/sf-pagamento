require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;

async function testSwagger() {
    const res = await fetch(`${EVO_BASE_URL}/swagger/v1/swagger.json`);
    const swagger = await res.json();
    const pathDetail = swagger.paths["/api/v3/membermembership"];
    console.log("MemberMembership GET parameters:", JSON.stringify(pathDetail?.get?.parameters, null, 2));
}

testSwagger();

require("dotenv").config({ path: ".env.local" });

const EVO_BASE_URL = process.env.EVO_BASE_URL;

async function testSwagger() {
    const res = await fetch(`${EVO_BASE_URL}/swagger/v1/swagger.json`);
    const swagger = await res.json();
    const paths = Object.keys(swagger.paths).filter(p => p.includes("activities"));
    console.log("Activities paths:", paths);
}

testSwagger();

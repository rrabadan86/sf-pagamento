import { writeFileSync } from "fs";

async function run() {
    try {
        const r = await fetch("https://evo-integracao.w12app.com.br/swagger/v1/swagger.json");
        const json = await r.json();

        const paths = Object.keys(json.paths);
        const memberPaths = paths.filter(p => p.toLowerCase().includes("member") || p.toLowerCase().includes("groupactiv"));

        console.log("Found " + memberPaths.length + " potential paths");
        writeFileSync("swagger_paths.txt", memberPaths.join("\n"));

    } catch (e) { console.error(e) }
}
run();

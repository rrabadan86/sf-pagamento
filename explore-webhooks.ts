import { config } from 'dotenv';
config({ path: '.env' });

async function checkApiDocs() {
    const url = "https://evo-integracao.w12app.com.br/api/v1/webhooks";
    const authHeaders = {
        "Authorization": `Basic ${process.env.EVO_TOKEN}`
    };

    try {
        // Let's see what happens if we try to create an invalid webhook to see the error describing what's expected
        const response = await fetch(url + "?test=true", {
            method: "POST",
            headers: {
                ...authHeaders,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                url: "https://sf-pagamento.vercel.app/api/webhooks/evo",
                event: "test" // we hope it tells us the valid options
            })
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(text);

    } catch (error) {
        console.error("Erro ao conectar:", error);
    }
}

checkApiDocs();

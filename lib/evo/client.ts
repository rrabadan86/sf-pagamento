/**
 * Cliente de integração com a API EVO (W12)
 * Autenticação Basic Auth: Base64(DNS:TOKEN)
 */

const EVO_BASE_URL = process.env.EVO_BASE_URL!;
const EVO_DNS = process.env.EVO_DNS!;
const EVO_TOKEN = process.env.EVO_TOKEN!;

function getAuthHeader(): string {
    const credentials = Buffer.from(`${EVO_DNS}:${EVO_TOKEN}`).toString(
        "base64"
    );
    return `Basic ${credentials}`;
}

// Fila assíncrona segura para evitar concorrência no Promise.all
// Limite da EVO: 4 requisições por segundo. (~250ms por req). Usamos 180ms de margem.
let nextAvailableTime = Date.now();
const MIN_INTERVAL_MS = 180;

async function rateLimitedFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const now = Date.now();
    let delay = 0;

    if (now < nextAvailableTime) {
        delay = nextAvailableTime - now;
        nextAvailableTime += MIN_INTERVAL_MS;
    } else {
        nextAvailableTime = now + MIN_INTERVAL_MS;
    }

    if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    let lastError: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    Authorization: getAuthHeader(),
                    "Content-Type": "application/json",
                    "Connection": "close", // Previne o reuso de sockets que a EVO API derruba
                    ...(options.headers as Record<string, string>),
                },
            });

            if (response.status === 429 || response.status >= 500) {
                const text = await response.text().catch(() => "");
                console.warn(`[EVO API] Status ${response.status} on attempt ${attempt}/3 (${url}). Retrying...`);
                if (attempt < 3) {
                    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
                throw new Error(`EVO API erro ${response.status} permanente após 3 tentativas: ${text}`);
            }

            return response;
        } catch (error: any) {
            lastError = error;
            // O erro 'terminated' ou 'UND_ERR_SOCKET' ocorre quando o load balancer da EVO
            // fecha abruptamente a conexão TCP antes da resposta HTTP no nível Node.js
            if (error.message?.includes('terminated') || error.code === 'UND_ERR_SOCKET') {
                console.warn(`[EVO API] Socket terminated on attempt ${attempt}/3. Retrying...`);
                if (attempt < 3) {
                    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
                    continue;
                }
            }
            throw error; // Lança imediatamente se for outro tipo de erro de rede
        }
    }
    throw lastError;
}

export async function evoFetchPaginated<T>(
    endpoint: string,
    params: Record<string, string | number> = {}
): Promise<T[]> {
    const results: T[] = [];
    let skip = 0;
    const take = Number(params.take || 50);

    while (true) {
        const queryParams = {
            ...Object.fromEntries(
                Object.entries(params).map(([k, v]) => [k, String(v)])
            ),
            take: String(take),
            skip: String(skip),
        };
        const query = new URLSearchParams(queryParams).toString();

        const url = `${EVO_BASE_URL}${endpoint}?${query}`;
        const res = await rateLimitedFetch(url);

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`EVO API erro ${res.status} em ${endpoint}: ${text}`);
        }

        const textResponse = await res.text();
        const data = textResponse ? JSON.parse(textResponse) : {};

        // A API EVO retorna array diretamente ou dentro de um campo
        const page: T[] = Array.isArray(data) ? data : data.items ?? data.data ?? [];

        results.push(...page);

        if (page.length < take) break;
        skip += take;
    }

    return results;
}

export async function evoFetch<T>(
    endpoint: string,
    params: Record<string, string | number> = {}
): Promise<T> {
    const query = new URLSearchParams(
        Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        )
    ).toString();

    const url = `${EVO_BASE_URL}${endpoint}${query ? `?${query}` : ""}`;
    const res = await rateLimitedFetch(url);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`EVO API erro ${res.status} em ${endpoint}: ${text}`);
    }

    const textResponse = await res.text();
    return textResponse ? JSON.parse(textResponse) : ({} as T);
}

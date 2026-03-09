/**
 * Cliente de integração com a API EVO (W12)
 * Autenticação Basic Auth: Base64(DNS:TOKEN)
 *
 * OTIMIZADO: Rate limiter com semáforo de concorrência (max 3 simultâneas)
 * em vez de fila sequencial com 300ms de delay fixo.
 * Isso permite múltiplas requisições voarem em paralelo respeitando o limite da EVO.
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

// ─── Semáforo de concorrência ─────────────────────────────────────────────────
// A EVO permite ~4 req/s. Usamos max 3 simultâneas + 100ms de gap mínimo entre disparos.
// Isso é MUITO mais rápido que o modelo antigo de fila serial com 300ms entre cada uma.

const MAX_CONCURRENT = 3;
const MIN_GAP_MS = 100; // gap mínimo entre disparos consecutivos

let activeFetches = 0;
let lastDispatchTime = 0;
const waitQueue: (() => void)[] = [];

function releaseSlot() {
    activeFetches--;
    if (waitQueue.length > 0) {
        const next = waitQueue.shift()!;
        next();
    }
}

async function acquireSlot(): Promise<void> {
    if (activeFetches < MAX_CONCURRENT) {
        activeFetches++;
        // Respeitar gap mínimo entre disparos
        const now = Date.now();
        const elapsed = now - lastDispatchTime;
        if (elapsed < MIN_GAP_MS) {
            await new Promise((r) => setTimeout(r, MIN_GAP_MS - elapsed));
        }
        lastDispatchTime = Date.now();
        return;
    }
    // Esperar até que um slot libere
    return new Promise<void>((resolve) => {
        waitQueue.push(() => {
            activeFetches++;
            lastDispatchTime = Date.now();
            resolve();
        });
    });
}

async function rateLimitedFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    await acquireSlot();
    try {
        return await fetch(url, {
            ...options,
            headers: {
                Authorization: getAuthHeader(),
                "Content-Type": "application/json",
                ...(options.headers as Record<string, string>),
            },
        });
    } finally {
        // Liberar o slot após um pequeno delay para não estourar o rate limit
        setTimeout(() => releaseSlot(), MIN_GAP_MS);
    }
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

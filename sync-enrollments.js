// Script temporário para popular cache de schedule + enrollments
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    const EVO_BASE_URL = process.env.EVO_BASE_URL;
    const EVO_DNS = process.env.EVO_DNS;
    const EVO_TOKEN = process.env.EVO_TOKEN;
    
    const credentials = Buffer.from(`${EVO_DNS}:${EVO_TOKEN}`).toString('base64');
    const authHeader = `Basic ${credentials}`;
    
    let nextAvailableTime = Date.now();
    const MIN_INTERVAL_MS = 300;
    
    async function rateLimitedFetch(url) {
        const now = Date.now();
        let delay = 0;
        if (now < nextAvailableTime) {
            delay = nextAvailableTime - now;
            nextAvailableTime += MIN_INTERVAL_MS;
        } else {
            nextAvailableTime = now + MIN_INTERVAL_MS;
        }
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: { Authorization: authHeader, 'Content-Type': 'application/json', 'Connection': 'close' },
                });
                if (response.status === 429 || response.status >= 500) {
                    if (attempt < 3) { await new Promise(r => setTimeout(r, 1000 * attempt)); continue; }
                }
                return response;
            } catch (error) {
                if (attempt < 3) { await new Promise(r => setTimeout(r, 500 * attempt)); continue; }
                throw error;
            }
        }
    }
    
    async function fetchPaginated(endpoint, params = {}) {
        const results = [];
        let skip = 0;
        const take = 50;
        while (true) {
            const query = new URLSearchParams({ ...params, take: String(take), skip: String(skip) }).toString();
            const res = await rateLimitedFetch(`${EVO_BASE_URL}${endpoint}?${query}`);
            if (!res.ok) throw new Error(`EVO ${res.status}: ${await res.text()}`);
            const text = await res.text();
            const data = text ? JSON.parse(text) : {};
            const page = Array.isArray(data) ? data : data.items ?? data.data ?? [];
            results.push(...page);
            if (page.length < take) break;
            skip += take;
        }
        return results;
    }
    
    async function getSchedule(mes, ano) {
        const mesStr = String(mes).padStart(2, '0');
        const diasNoMes = new Date(ano, mes, 0).getDate();
        const datesToFetch = [];
        for (let day = 1; day <= diasNoMes; day += 7) {
            datesToFetch.push(`${ano}-${mesStr}-${String(day).padStart(2, '0')}`);
        }
        const lastFetchedDay = parseInt(datesToFetch[datesToFetch.length - 1].split('-')[2]);
        if (lastFetchedDay + 6 < diasNoMes) {
            datesToFetch.push(`${ano}-${mesStr}-${String(diasNoMes).padStart(2, '0')}`);
        }
        const allActivities = [];
        const seenIds = new Set();
        for (const date of datesToFetch) {
            const weekActivities = await fetchPaginated('/api/v1/activities/schedule', { date, showFullWeek: 'true' });
            for (const act of weekActivities) {
                const actDate = new Date(act.activityDate);
                const compositeKey = `${act.idActivity}_${act.activityDate}_${act.startTime}`;
                if (actDate.getMonth() + 1 === mes && actDate.getFullYear() === ano && !seenIds.has(compositeKey)) {
                    seenIds.add(compositeKey);
                    allActivities.push(act);
                }
            }
        }
        return allActivities;
    }
    
    async function getTurmaEnrollments(idActivitySession) {
        try {
            const query = new URLSearchParams({ idActivitySession: String(idActivitySession) }).toString();
            const res = await rateLimitedFetch(`${EVO_BASE_URL}/api/v1/activities/schedule/detail?${query}`);
            if (!res.ok) return [];
            const text = await res.text();
            const data = text ? JSON.parse(text) : {};
            return data.enrollments || [];
        } catch (err) {
            console.error(`Erro enrollments sessão ${idActivitySession}:`, err.message);
            return [];
        }
    }
    
    const chunkArray = (arr, size) =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
    
    const meses = [
        { mes: 4, ano: 2026 },
        { mes: 5, ano: 2026 },
    ];
    
    let totalEnrollments = 0;
    
    for (const { mes, ano } of meses) {
        console.log(`\n=== Sincronizando ${mes}/${ano} ===`);
        const schedule = await getSchedule(mes, ano);
        
        // Cachear grade como JSON
        const cacheKey = `schedule_${mes}_${ano}`;
        await prisma.cacheJSON.upsert({
            where: { chave: cacheKey },
            update: { dados: JSON.stringify(schedule) },
            create: { chave: cacheKey, dados: JSON.stringify(schedule) },
        });
        console.log(`✓ Grade cacheada (${schedule.length} sessões)`);
        
        const sessionIds = schedule.map(a => a.idAtividadeSessao).filter(id => id != null);
        console.log(`Processando ${sessionIds.length} sessões para enrollments...`);
        
        // Verificar quais sessões já estão no banco
        const existentes = await prisma.enrollmentSessao.groupBy({
            by: ['idAtividadeSessao'],
            where: { idAtividadeSessao: { in: sessionIds } },
        });
        const sessoesExistentes = new Set(existentes.map(e => e.idAtividadeSessao));
        const sessoesFaltando = sessionIds.filter(id => !sessoesExistentes.has(id));
        
        console.log(`${sessoesExistentes.size} sessões já no banco, ${sessoesFaltando.length} faltando`);
        
        let count = 0;
        const chunks = chunkArray(sessoesFaltando, 3);
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (sessId) => {
                try {
                    const enrollments = await getTurmaEnrollments(sessId);
                    for (const e of enrollments) {
                        if (!e.idMember) continue;
                        await prisma.enrollmentSessao.upsert({
                            where: {
                                idAtividadeSessao_idMember: {
                                    idAtividadeSessao: sessId,
                                    idMember: e.idMember,
                                }
                            },
                            update: {
                                nome: e.name || '',
                                replacement: e.replacement ?? false,
                                status: e.status ?? 0,
                            },
                            create: {
                                idAtividadeSessao: sessId,
                                idMember: e.idMember,
                                nome: e.name || '',
                                replacement: e.replacement ?? false,
                                status: e.status ?? 0,
                            }
                        });
                        count++;
                    }
                } catch (err) {
                    console.error(`Erro sessão ${sessId}:`, err.message);
                }
            }));
        }
        
        console.log(`✓ ${count} novos enrollments salvos para ${mes}/${ano}`);
        totalEnrollments += count;
    }
    
    console.log(`\n=== TOTAL: ${totalEnrollments} novos enrollments sincronizados ===`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

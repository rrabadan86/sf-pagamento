/**
 * Queries da API EVO — funções encapsuladas por entidade
 */

import { evoFetchPaginated } from "./client";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EvoSchedule {
    idActivity: number;
    idAtividadeSessao: number;
    name: string;
    instructor: string;
    instructorId: number;
    activityDate: string; // ISO date
    startTime: string;
    endTime: string;
    maxCapacity: number;
    totalBookings: number;
}

export interface EvoMemberMembership {
    idMember: number;
    name: string;
    idMembership: number;
    idMemberMembership: number;
    idBranch: number;
    numMembers: number;
    idSale: number;
    saleValue: number;
    nameMembership: string;
    membershipStart: string;
    membershipEnd: string;
    registerCancelDate: string | null;
    cancelDate: string | null;
    reasonCancellation: string | null;
    saleDate: string;
    cancellationFine: number;
    remainingValue: number;
    receivables: EvoReceivable[];
}

export interface EvoReceivable {
    idReceivable: number;
    description: string;
    ammount: number;
    ammountPaid: number;
    currentInstallment: number;
    totalInstallments: number;
    tid: string;
    dueDate: string;
    receivingDate: string | null;
    paymentType: { name: string } | null;
    canceled: boolean;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSchedule(
    mes: number,
    ano: number
): Promise<EvoSchedule[]> {
    const mesStr = String(mes).padStart(2, "0");
    // Calcular as semanas a buscar, garantindo cobertura de todas as semanas do mês.
    // Antes era [1, 8, 15, 22, 28] fixo, mas isso perdia dias 29-31 quando caíam
    // em semana diferente do dia 28 (ex: Março 2026, dia 28=Sáb → 29-31 na semana seguinte).
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const datesToFetch: string[] = [];
    for (let day = 1; day <= diasNoMes; day += 7) {
        datesToFetch.push(`${ano}-${mesStr}-${String(day).padStart(2, "0")}`);
    }
    // Garantir que o último dia do mês seja coberto
    const lastFetchedDay = parseInt(datesToFetch[datesToFetch.length - 1].split("-")[2]);
    if (lastFetchedDay + 6 < diasNoMes) {
        datesToFetch.push(`${ano}-${mesStr}-${String(diasNoMes).padStart(2, "0")}`);
    }

    const allActivities: EvoSchedule[] = [];
    const seenIds = new Set<string>();

    for (const date of datesToFetch) {
        const weekActivities = await evoFetchPaginated<EvoSchedule>(
            "/api/v1/activities/schedule",
            {
                date,
                showFullWeek: "true",
            }
        );

        for (const act of weekActivities) {
            // A API EVO retorna horários formatados como "YYYY-MM-DDTHH:MM:SS"
            // Filter only activities strictly matching the requested month and year
            const actDate = new Date(act.activityDate);
            const compositeKey = `${act.idActivity}_${act.activityDate}_${act.startTime}`;

            if (
                actDate.getMonth() + 1 === mes &&
                actDate.getFullYear() === ano &&
                !seenIds.has(compositeKey)
            ) {
                seenIds.add(compositeKey);
                allActivities.push(act);
            }
        }
    }

    return allActivities;
}

import { prisma } from "../prisma";

/**
 * Busca matrículas de alunas — com contratos, plano, mensalidade do Banco Local.
 * Filtra pelo período de referência.
 */
export async function getMemberMemberships(
    mes: number,
    ano: number
): Promise<EvoMemberMembership[]> {
    const mesStr = String(mes).padStart(2, "0");
    const dataInicio = `${ano}-${mesStr}-01`;

    // Busca contratos ativos (status=1) + cancelados no mês (status=2)
    // em paralelo para reduzir latência.
    const [ativas, canceladas] = await Promise.all([
        evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
            statusMemberMembership: 1,
            take: 50,
        }),
        evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
            statusMemberMembership: 2,
            cancelDateStart: dataInicio,
            take: 50,
        }),
    ]);

    // Deduplicar por ID do contrato — campo real da EVO é "idMemberMemberShip" (S maiúsculo)
    const seenKeys = new Set<string>();
    const result: EvoMemberMembership[] = [];
    for (const m of [...ativas, ...canceladas]) {
        const contractId = (m as any).idMemberMemberShip ?? m.idMemberMembership;
        const key = contractId != null ? String(contractId) : `${m.idMember}_${m.membershipStart}`;
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            result.push(m);
        }
    }

    console.log(`[getMemberMemberships] EVO bulk: ${ativas.length} status=1 + ${canceladas.length} canceladas = ${result.length} contratos`);
    return result;
}

/**
 * Busca todos os contratos de uma aluna INDIVIDUALMENTE no BD.
 */
export async function getMemberMembershipsById(idMember: number): Promise<EvoMemberMembership[]> {
    if (!idMember) return [];
     const contratos = await prisma.contrato.findMany({
        where: {
            idAluno: idMember.toString()
        },
        include: {
            aluno: true
        }
    });

    return contratos.map((c: any) => mapPrismaToEvoMembership(c));
}

/**
 * Busca contratos de uma lista de membros.
 * 1ª tentativa: banco local (rápido, sem EVO API).
 * 2ª tentativa: EVO API individual por idMember para os que não estão no banco.
 * Isso cobre planos RECORRENTE e outros que não são retornados pela query bulk status=1.
 */
export async function getMemberMembershipsForIds(
    memberIds: number[]
): Promise<Map<number, EvoMemberMembership[]>> {
    if (memberIds.length === 0) return new Map();

    // 1. Banco local
    const contratos = await prisma.contrato.findMany({
        where: { idAluno: { in: memberIds.map(String) } },
        include: { aluno: true }
    });

    const result = new Map<number, EvoMemberMembership[]>();
    const foundInDb = new Set<number>();
    for (const c of contratos as any[]) {
        const id = parseInt(c.idAluno);
        if (!result.has(id)) result.set(id, []);
        result.get(id)!.push(mapPrismaToEvoMembership(c));
    }
    // Marcar como "encontrado" SOMENTE se tiver pelo menos um contrato vigente (não expirado).
    // Contratos expirados no banco não bloqueiam a busca na EVO API — o banco pode estar desatualizado.
    const agora = new Date();
    for (const [id, contracts] of result.entries()) {
        const temVigente = contracts.some(c => {
            const fim = c.membershipEnd ? new Date(c.membershipEnd) : null;
            return !fim || fim >= agora;
        });
        if (temVigente) foundInDb.add(id);
    }

    // 2. EVO API individual para membros sem contrato vigente no banco
    // Sem filtro statusMemberMembership → inclui contratos RECORRENTE (status diferente de 1 na EVO)
    const notInDb = memberIds.filter(id => !foundInDb.has(id));
    if (notInDb.length > 0) {
        console.log(`[getMemberMembershipsForIds] ${notInDb.length} membros sem contrato vigente no banco → buscando na EVO API individualmente`);
        for (const idMember of notInDb) {
            try {
                const contracts = await evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
                    idMember,
                    take: 50,
                    // Sem statusMemberMembership — captura contratos RECORRENTE e todos os tipos ativos
                });
                const ativos = contracts.filter(c => !c.cancelDate);
                if (ativos.length > 0) {
                    result.set(idMember, ativos);
                    console.log(`[getMemberMembershipsForIds] idMember=${idMember} → ${ativos[0].nameMembership}`);
                }
            } catch (err) {
                console.warn(`[getMemberMembershipsForIds] Erro ao buscar membro ${idMember}:`, err);
            }
        }
    }


    return result;
}

/**
 * Helper de Conversão: Transforma os dados do Prisma numa estrutura igual à EvoMemberMembership
 * para não quebrar a tipagem do restante do código atual.
 */
function mapPrismaToEvoMembership(contrato: any): EvoMemberMembership {
    return {
        idMember: parseInt(contrato.idAluno),
        name: contrato.aluno.nome,
        idMembership: parseInt(contrato.idEvo) || 0,
        idMemberMembership: parseInt(contrato.idEvo) || 0,
        idBranch: 15, // Padrão
        numMembers: 1,
        idSale: parseInt(contrato.idEvo) || 0,
        saleValue: contrato.valor || 0, // Puxa do Banco Local preenchido pela Seed V3
        nameMembership: contrato.nomePlano,
        membershipStart: contrato.dataInicio ? contrato.dataInicio.toISOString() : "2000-01-01T00:00:00Z",
        membershipEnd: contrato.dataFim ? contrato.dataFim.toISOString() : "2099-01-01T00:00:00Z",
        registerCancelDate: contrato.status === "Suspenso" ? new Date().toISOString() : null,
        cancelDate: contrato.status === "Cancelado" ? new Date().toISOString() : null,
        reasonCancellation: null,
        saleDate: contrato.dataInicio ? contrato.dataInicio.toISOString() : new Date().toISOString(),
        cancellationFine: 0,
        remainingValue: 0,
        receivables: [] // Não armazenamos pagáveis no banco de forma granular no momento
    };
}

/**
 * Determina tipo de plano da aluna a partir do nameMembership.
 * "Avulsa", "Free", "Pacote" → free; qualquer outro → fixo (mensalista)
 */
export function tipoDePlano(nameMembership: string): "fixo" | "free" {
    const lower = nameMembership.toLowerCase();

    // Palavras que indicam isenção/combo gratuito batem qualquer outra regra (Ex: Bruna - FREE ... RECORRENTE)
    if (lower.includes("free") || lower.includes("vip")) {
        return "free";
    }

    // Se o plano tiver 'fixa' ou 'recorrente' explícito, é sempre fixo
    if (lower.includes("fixa") || lower.includes("recorrente")) {
        return "fixo";
    }

    if (
        lower.includes("avulsa") ||
        lower.includes("pacote") ||
        lower.includes("aulas")
    ) {
        return "free";
    }
    return "fixo";
}

/**
 * Determina status do contrato a partir dos campos mapeados.
 */
export function statusContrato(
    m: EvoMemberMembership
): "Ativo" | "Suspenso" | "Cancelado" {
    if (m.cancelDate) return "Cancelado";
    if (m.registerCancelDate) return "Suspenso";
    return "Ativo";
}

/**
 * Verifica se aluna teve pagamento realizado no mês de referência.
 * Como o webhook/cron não armazena installments granulares (vários delays/limites da EVO),
 * passaremos a considerar true por padrão, focando apenas no cálculo do professor.
 */
export function temPagamentoNoMes(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    m: EvoMemberMembership,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mes: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ano: number
): boolean {
    return true; 
}

/**
 * Queries da API EVO — funções encapsuladas por entidade
 *
 * OTIMIZADO: getSchedule agora busca as 5 semanas em PARALELO (Promise.all)
 * em vez de sequencialmente. Isso reduz ~5x o tempo dessa etapa.
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
    idMemberMemberShip: number;
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
    const datesToFetch = [1, 8, 15, 22, 28].map(
        (day) => `${ano}-${mesStr}-${String(day).padStart(2, "0")}`
    );

    // OTIMIZAÇÃO: buscar todas as semanas em PARALELO
    const allWeekResults = await Promise.all(
        datesToFetch.map((date) =>
            evoFetchPaginated<EvoSchedule>(
                "/api/v1/activities/schedule",
                {
                    date,
                    showFullWeek: "true",
                }
            )
        )
    );

    const allActivities: EvoSchedule[] = [];
    const seenIds = new Set<string>();

    for (const weekActivities of allWeekResults) {
        for (const act of weekActivities) {
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

/**
 * Busca matrículas de alunas — com contratos, plano, mensalidade e pagamentos.
 * Filtra pelo período de referência.
 *
 * OTIMIZADO: busca ativas e canceladas em PARALELO.
 */
export async function getMemberMemberships(
    mes: number,
    ano: number
): Promise<EvoMemberMembership[]> {
    const mesStr = String(mes).padStart(2, "0");
    const dataInicio = `${ano}-${mesStr}-01`;

    // OTIMIZAÇÃO: buscar ativas e canceladas em PARALELO
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

    // Unir e remover possíveis duplicidades
    const todasMatriculas = new Map<number, EvoMemberMembership>();
    for (const m of [...ativas, ...canceladas]) {
        todasMatriculas.set(m.idMemberMemberShip, m);
    }

    return Array.from(todasMatriculas.values());
}

/**
 * Busca todos os contratos de uma aluna INDIVIDUALMENTE.
 */
export async function getMemberMembershipsById(idMember: number): Promise<EvoMemberMembership[]> {
    return await evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
        idMember,
        statusMemberMembership: 1,
        take: 50,
    });
}

/**
 * Determina tipo de plano da aluna a partir do nameMembership.
 */
export function tipoDePlano(nameMembership: string): "fixo" | "free" {
    const lower = nameMembership.toLowerCase();

    if (lower.includes("free") || lower.includes("vip")) {
        return "free";
    }

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
 * Determina status do contrato a partir dos campos da API.
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
 */
export function temPagamentoNoMes(
    m: EvoMemberMembership,
    mes: number,
    ano: number
): boolean {
    return m.receivables.some((r) => {
        if (!r.receivingDate || r.canceled) return false;
        const d = new Date(r.receivingDate);
        return d.getMonth() + 1 === mes && d.getFullYear() === ano;
    });
}

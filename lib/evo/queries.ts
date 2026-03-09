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

/**
 * Busca matrículas de alunas — com contratos, plano, mensalidade e pagamentos.
 * Filtra pelo período de referência.
 */
export async function getMemberMemberships(
    mes: number,
    ano: number
): Promise<EvoMemberMembership[]> {
    const mesStr = String(mes).padStart(2, "0");
    const dataInicio = `${ano}-${mesStr}-01`;

    // 1. Buscar todas as matrículas ativas (status 1)
    const ativas = await evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
        statusMemberMembership: 1,
        take: 50,
    });

    // 2. Buscar matrículas canceladas cujo cancelamento ocorreu durante ou após o mês de cálculo
    const canceladas = await evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
        statusMemberMembership: 2,
        cancelDateStart: dataInicio,
        take: 50,
    });

    // 3. Unir e remover possíveis duplicidades
    const todasMatriculas = new Map<number, EvoMemberMembership>();
    for (const m of [...ativas, ...canceladas]) {
        todasMatriculas.set(m.idMemberMemberShip, m);
    }

    return Array.from(todasMatriculas.values());
}

/**
 * Busca todos os contratos de uma aluna INDIVIDUALMENTE. Útil para 
 * resgatar contratos VIP/Free que não retornam na listagem de status 1 ou 2 globais.
 */
export async function getMemberMembershipsById(idMember: number): Promise<EvoMemberMembership[]> {
    return await evoFetchPaginated<EvoMemberMembership>("/api/v3/membermembership", {
        idMember,
        statusMemberMembership: 1, // Vamos forçar ativo para ver se a EVO traz o VIP
        take: 50,
    });
}

/**
 * Determina tipo de plano da aluna a partir do nameMembership.
 * "Avulsa", "Free", "Pacote" → free; qualquer outro → fixo (mensalista)
 */
export function tipoDePlano(nameMembership: string): "fixo" | "free" {
    const lower = nameMembership.toLowerCase();
    if (
        lower.includes("avulsa") ||
        lower.includes("free") ||
        lower.includes("pacote") ||
        lower.includes("vip") ||
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

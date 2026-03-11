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

import { prisma } from "../prisma";

/**
 * Busca matrículas de alunas — com contratos, plano, mensalidade do Banco Local.
 * Filtra pelo período de referência.
 */
export async function getMemberMemberships(
    mes: number,
    ano: number
): Promise<EvoMemberMembership[]> {
    const dataInicioBusca = new Date(ano, mes - 1, 1);
    const dataFimBusca = new Date(ano, mes, 0, 23, 59, 59); // último dia do mês

    // Busca todos os contratos no BD que tenham sobreposição com o mês
    // ou que não tenham data de fim definida (vitalicios/recorrentes)
    // O Prisma espera que a data seja string baseada no model (DateTime não nulo) 
    // ou usamos a comparação de datas adequadamente.
    const contratos = await prisma.contrato.findMany({
        where: {
            OR: [
                {
                    dataInicio: { lte: dataFimBusca },
                    dataFim: { gte: dataInicioBusca }
                }
            ]
        },
        include: {
            aluno: true
        }
    });

    return contratos.map((c: any) => mapPrismaToEvoMembership(c));
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

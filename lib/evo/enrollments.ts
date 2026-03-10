import { EvoMemberMembership } from "./queries";
import { evoFetch } from "./client";

export interface EvoEnrollment {
    idMember: number;
    name: string;
    replacement: boolean;
    status: number; // 0 = Present, 1 = Absent, 2 = Excused Absence
}

export async function getTurmaEnrollments(idActivitySession: number): Promise<EvoEnrollment[]> {
    try {
        const detail = await evoFetch<any>("/api/v1/activities/schedule/detail", {
            idActivitySession
        });
        return detail.enrollments || [];
    } catch (err) {
        console.error("Erro ao buscar enrollments da sessão", idActivitySession, err);
        return [];
    }
}

export interface EvoFixedSchedule {
    idActivity: number;
    activityName: string;
    weekDay: number;       // 0 = Domingo, 1 = Segunda, 2 = Terça...
    startTime: string;     // Ex: "14:00:00"
    status: number;        // 1 = Ativo, 2 = Removido
    startDate: string;     // Ex: "2026-01-18T00:00:00" — data em que a matrícula começou
    endDate: string | null; // null se ainda ativa; preenchida quando removida
}

export async function getMemberFixedSchedules(idMember: number): Promise<EvoFixedSchedule[]> {
    try {
        // Busca TODAS as matrículas (ativas e removidas) para verificação histórica por data
        const res = await evoFetch<any>("/api/v1/activities/enrollment/member-enrollment", {
            idMember
            // Sem filtro de status: retorna status 1 (ativo) e 2 (removido)
        });
        if (Array.isArray(res)) return res as EvoFixedSchedule[];
        return [];
    } catch (err) {
        console.error(`Erro ao buscar schedule fixo (member-enrollment) idMember=${idMember}`, err);
        return [];
    }
}

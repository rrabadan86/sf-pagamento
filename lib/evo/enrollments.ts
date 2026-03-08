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
    weekDay: number;      // 0 = Domingo, 1 = Segunda, 2 = Terça...
    startTime: string;    // Ex: "14:00:00"
    status: number;       // 1 = Ativo
}

export async function getMemberFixedSchedules(idMember: number): Promise<EvoFixedSchedule[]> {
    try {
        // As turmas que um aluno se vinculou recorrentemente (Fixas)
        const res = await evoFetch<any>("/api/v1/activities/enrollment/member-enrollment", {
            idMember,
            status: 1
        });
        if (Array.isArray(res)) return res as EvoFixedSchedule[];
        return [];
    } catch (err) {
        return [];
    }
}

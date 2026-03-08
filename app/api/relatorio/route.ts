import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

// GET /api/relatorio?mes=3&ano=2026&professorId=...
export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mes = parseInt(searchParams.get("mes") ?? "0");
    const ano = parseInt(searchParams.get("ano") ?? "0");
    const professorId = searchParams.get("professorId");

    if (!mes || !ano) {
        return NextResponse.json({ error: "mes e ano obrigatórios" }, { status: 400 });
    }

    const where: Record<string, unknown> = { mes, ano };
    if (professorId) where.idProfessorEvo = professorId;

    const relatorios = await prisma.relatorioStatus.findMany({ where });
    return NextResponse.json({ relatorios });
}

// POST /api/relatorio — cria ou atualiza status
export async function POST(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json();
    const { idProfessorEvo, nomeProfessor, mes, ano, status, observacao } = body;

    const validos = ["Gerado", "Contestado", "Revisado", "Aprovado"];
    if (!validos.includes(status)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const existing = await prisma.relatorioStatus.findUnique({
        where: { idProfessorEvo_mes_ano: { idProfessorEvo, mes, ano } },
    });

    const relatorio = await prisma.relatorioStatus.upsert({
        where: { idProfessorEvo_mes_ano: { idProfessorEvo, mes, ano } },
        update: {
            status,
            observacao,
            versao: status === "Gerado" && existing ? (existing.versao + 1) : (existing?.versao ?? 1),
            geradoEm: status === "Gerado" ? new Date() : undefined,
        },
        create: {
            idProfessorEvo,
            nomeProfessor,
            mes,
            ano,
            status,
            observacao,
            versao: 1,
        },
    });

    return NextResponse.json({ success: true, relatorio });
}

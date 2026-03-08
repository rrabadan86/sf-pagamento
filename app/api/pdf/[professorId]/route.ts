import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToStream } from "@react-pdf/renderer";
import { createElement } from "react";
import { prisma } from "@/lib/prisma";
import { RelatorioPDF } from "@/lib/pdf/RelatorioPDF";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ professorId: string }> }
) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { professorId } = await params;
    const body = await req.json();
    const { mes, ano, dadosCalculo } = body;

    if (!dadosCalculo || !mes || !ano) {
        return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const prof = dadosCalculo;

    // Buscar status do relatório
    const relatorio = await prisma.relatorioStatus.findUnique({
        where: {
            idProfessorEvo_mes_ano: {
                idProfessorEvo: professorId,
                mes,
                ano,
            },
        },
    });

    // Buscar config da academia
    let config = await prisma.academiaConfig.findFirst();
    if (!config) {
        config = await prisma.academiaConfig.create({ data: { nomeAcademia: "Academia" } });
    }

    try {
        const pdfStream = await renderToStream(
            createElement(RelatorioPDF, {
                professor: prof,
                mes,
                ano,
                nomeAcademia: config.nomeAcademia,
                logoBase64: config.logoBase64,
                status: relatorio?.status ?? "Gerado",
                versao: relatorio?.versao ?? 1,
                geradoEm: relatorio?.geradoEm ?? new Date(),
            }) as any
        );

        const mesStr = String(mes).padStart(2, "0");
        const filename = `pagamento_${prof.nomeProfessor.replace(/\s+/g, "_")}_${ano}_${mesStr}.pdf`;

        return new Response(pdfStream as any, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (e: any) {
        console.error("Erro na geracao do PDF:", e);
        return NextResponse.json({ error: e?.message || "Erro desconhecido", stack: e?.stack }, { status: 500 });
    }
}

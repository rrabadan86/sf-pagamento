import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

// GET /api/config
export async function GET() {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    let config = await prisma.academiaConfig.findFirst();
    if (!config) {
        config = await prisma.academiaConfig.create({
            data: { nomeAcademia: "Academia" },
        });
    }
    return NextResponse.json({ config });
}

// PUT /api/config
export async function PUT(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json();
    const { nomeAcademia, logoBase64 } = body;

    let config = await prisma.academiaConfig.findFirst();
    if (!config) {
        config = await prisma.academiaConfig.create({
            data: { nomeAcademia: nomeAcademia ?? "Academia", logoBase64 },
        });
    } else {
        config = await prisma.academiaConfig.update({
            where: { id: config.id },
            data: {
                ...(nomeAcademia !== undefined && { nomeAcademia }),
                ...(logoBase64 !== undefined && { logoBase64 }),
            },
        });
    }
    return NextResponse.json({ success: true, config });
}

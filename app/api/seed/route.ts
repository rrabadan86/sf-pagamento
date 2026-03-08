import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/seed — cria o gestor padrão se não existir.
 * Chamar apenas uma vez no setup.
 */
export async function POST() {
    const existing = await prisma.gestorUser.findFirst();
    if (existing) {
        return NextResponse.json({ message: "Gestor já existe." }, { status: 200 });
    }

    const senhaHash = await bcrypt.hash("admin123", 10);
    await prisma.gestorUser.create({
        data: { email: "gestor@academia.com", senha: senhaHash, nome: "Gestor" },
    });

    // Configuração inicial da academia
    await prisma.academiaConfig.create({
        data: { nomeAcademia: "Slim Fit Academia" },
    });

    return NextResponse.json({ message: "Gestor criado com sucesso." });
}

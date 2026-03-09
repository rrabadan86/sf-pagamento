import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const handler = NextAuth({
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "E-mail", type: "email" },
                senha: { label: "Senha", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.senha) return null;

                const gestor = await prisma.gestorUser.findUnique({
                    where: { email: credentials.email },
                });

                if (!gestor) return null;

                const senhaOk = await bcrypt.compare(credentials.senha, gestor.senha);
                if (!senhaOk) return null;

                return { id: String(gestor.id), name: gestor.nome, email: gestor.email };
            },
        }),
    ],
    session: { strategy: "jwt" },
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) token.id = user.id;
            return token;
        },
        async session({ session, token }) {
            // @ts-ignore
            if (token && session.user) session.user.id = token.id as string;
            return session;
        },
    },
});

export { handler as GET, handler as POST };

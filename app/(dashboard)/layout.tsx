"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/app/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === "unauthenticated") router.replace("/login");
    }, [status, router]);

    if (status === "loading") {
        return (
            <div className="loading-overlay">
                <div className="spinner" />
                <span>Carregando...</span>
            </div>
        );
    }

    if (status === "unauthenticated") return null;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">{children}</main>
        </div>
    );
}

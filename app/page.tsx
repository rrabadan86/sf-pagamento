"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/calculo");
    else if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  return (
    <div className="loading-overlay">
      <div className="spinner" />
      <span>Carregando...</span>
    </div>
  );
}

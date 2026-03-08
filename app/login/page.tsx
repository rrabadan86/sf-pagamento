"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("gestor@academia.com");
    const [senha, setSenha] = useState("");
    const [erro, setErro] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setErro("");
        const res = await signIn("credentials", {
            email,
            senha,
            redirect: false,
        });
        if (res?.ok) {
            router.push("/calculo");
        } else {
            setErro("E-mail ou senha incorretos.");
            setLoading(false);
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: "var(--accent)", display: "flex",
                        alignItems: "center", justifyContent: "center"
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <div>
                        <h1>SF Pagamento</h1>
                        <p style={{ marginBottom: 0 }}>Área do Gestor</p>
                    </div>
                </div>

                {erro && <div className="error-msg">{erro}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="form-group">
                        <label>E-mail</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="gestor@academia.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Senha</label>
                        <input
                            type="password"
                            value={senha}
                            onChange={e => setSenha(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                        style={{ justifyContent: "center", marginTop: 4 }}
                        disabled={loading}
                    >
                        {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Entrando...</> : "Entrar"}
                    </button>
                </form>

                <p style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>
                    Acesso exclusivo para gestores. Professores recebem o PDF por e-mail.
                </p>
            </div>
        </div>
    );
}

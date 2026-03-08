"use client";
import { useEffect, useState, useRef } from "react";

interface Config {
    id: number;
    nomeAcademia: string;
    logoBase64?: string;
}

export default function ConfiguracoesPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [nome, setNome] = useState("");
    const [logo, setLogo] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [toast, setToast] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    };

    const load = async () => {
        const res = await fetch("/api/config");
        const data = await res.json();
        setConfig(data.config);
        setNome(data.config.nomeAcademia);
        setLogo(data.config.logoBase64 ?? null);
    };

    useEffect(() => { load(); }, []);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setLogo(ev.target?.result as string);
        reader.readAsDataURL(file);
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            const res = await fetch("/api/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nomeAcademia: nome, logoBase64: logo }),
            });
            if (!res.ok) throw new Error("Erro ao salvar");
            showToast("✓ Configurações salvas com sucesso");
            load();
        } catch {
            showToast("Erro ao salvar configurações");
        } finally {
            setSalvando(false);
        }
    };

    if (!config) {
        return <div className="loading-overlay"><div className="spinner" /></div>;
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h2 className="page-title">Configurações</h2>
                    <p className="page-subtitle">Identidade visual da academia para os relatórios PDF</p>
                </div>
            </div>

            <div className="card" style={{ maxWidth: 560 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Identidade Visual</h3>

                <div className="form-group" style={{ marginBottom: 20 }}>
                    <label>Nome da Academia</label>
                    <input
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                        placeholder="Ex: Slim Fit Academia"
                    />
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                        Aparece no cabeçalho de todos os relatórios PDF.
                    </span>
                </div>

                <div className="form-group" style={{ marginBottom: 24 }}>
                    <label>Logotipo</label>
                    <div style={{
                        border: "1px dashed var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: 24,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12
                    }}>
                        {logo ? (
                            <>
                                <img
                                    src={logo}
                                    alt="Logo"
                                    style={{ maxHeight: 80, maxWidth: 200, objectFit: "contain", borderRadius: 6 }}
                                />
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setLogo(null)}
                                    style={{ color: "var(--red)" }}
                                >
                                    Remover logo
                                </button>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: 56, height: 56, borderRadius: 12,
                                    background: "var(--bg-base)", display: "flex",
                                    alignItems: "center", justifyContent: "center"
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
                                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                </div>
                                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                                    PNG, JPG ou SVG · máx. 2MB
                                </p>
                                <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
                                    Selecionar arquivo
                                </button>
                            </>
                        )}
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleFile}
                        />
                        {logo && (
                            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                                Trocar logo
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                    <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                        {salvando ? "Salvando..." : "Salvar Configurações"}
                    </button>
                </div>
            </div>

            {/* Seção de credenciais (informativa) */}
            <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>API EVO — Integração</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--text-muted)" }}>DNS</span>
                        <span className="font-mono" style={{ color: "var(--green)" }}>
                            {process.env.NEXT_PUBLIC_EVO_DNS ?? "slimfit"}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--text-muted)" }}>Token</span>
                        <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                            ●●●●●●●●●●●●●●●●●●●●
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--text-muted)" }}>Status</span>
                        <span className="badge badge-green">Configurado</span>
                    </div>
                </div>
                <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-faint)" }}>
                    As credenciais são configuradas via variáveis de ambiente no servidor e não ficam expostas ao cliente.
                </p>
            </div>

            {toast && <div className="toast toast-success">{toast}</div>}
        </div>
    );
}

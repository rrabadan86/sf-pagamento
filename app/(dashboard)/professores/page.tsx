"use client";
import { useEffect, useState } from "react";

interface Historico {
    id: number;
    percentual: number;
    piso: number;
    teto: number;
    dataInicio: string;
}

interface Professor {
    idProfessorEvo: string;
    nomeProfessor: string;
    percentualAtual: number;
    pisoAtual: number;
    tetoAtual: number;
    historico: Historico[];
}

export default function ProfessoresPage() {
    const [professores, setProfessores] = useState<Professor[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<Professor | null>(null);
    const [novoPerc, setNovoPerc] = useState("");
    const [novoPiso, setNovoPiso] = useState("");
    const [novoTeto, setNovoTeto] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [toast, setToast] = useState("");
    const [histModal, setHistModal] = useState<Professor | null>(null);

    const load = async () => {
        const res = await fetch("/api/professores");
        const data = await res.json();
        setProfessores(data.professores ?? []);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    };

    const salvar = async () => {
        if (!modal) return;
        const p = parseFloat(novoPerc.replace(",", "."));
        const pPiso = parseFloat(novoPiso.replace(",", "."));
        const pTeto = parseFloat(novoTeto.replace(",", "."));
        if (isNaN(p) || p < 0 || p > 100) {
            showToast("Percentual inválido (0–100)");
            return;
        }
        if (isNaN(pPiso) || pPiso < 0 || isNaN(pTeto) || pTeto < 0) {
            showToast("Valores de Piso ou Teto inválidos.");
            return;
        }

        setSalvando(true);
        try {
            const res = await fetch("/api/professores", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idProfessorEvo: modal.idProfessorEvo,
                    nomeProfessor: modal.nomeProfessor,
                    percentual: p,
                    piso: pPiso,
                    teto: pTeto,
                }),
            });
            if (!res.ok) throw new Error("Erro ao salvar");
            showToast(`✓ Regras de ${modal.nomeProfessor} atualizadas`);
            setModal(null);
            load();
        } catch {
            showToast("Erro ao salvar percentual");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div>
            <div className="page-header flex items-center justify-between">
                <div>
                    <h2 className="page-title">Professores</h2>
                    <p className="page-subtitle">Gerencie o percentual de remuneração individual</p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => { setLoading(true); load(); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4" />
                    </svg>
                    Sincronizar
                </button>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading-overlay"><div className="spinner" /><span>Carregando...</span></div>
                ) : professores.length === 0 ? (
                    <div className="empty-state">
                        <h3>Nenhum professor cadastrado</h3>
                        <p>Execute um cálculo primeiro para registrar os professores.</p>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Professor</th>
                                    <th>Custo / Aula %</th>
                                    <th>Piso</th>
                                    <th>Teto</th>
                                    <th>Vigência</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {professores.map((prof) => {
                                    const vig = prof.historico[0]?.dataInicio
                                        ? new Date(prof.historico[0].dataInicio).toLocaleDateString("pt-BR")
                                        : "—";
                                    return (
                                        <tr key={prof.idProfessorEvo}>
                                            <td>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: "50%",
                                                        background: "var(--accent-light)", display: "flex",
                                                        alignItems: "center", justifyContent: "center",
                                                        fontSize: 12, fontWeight: 700, color: "var(--accent-hover)", flexShrink: 0
                                                    }}>
                                                        {prof.nomeProfessor[0]}
                                                    </div>
                                                    <span style={{ fontWeight: 500 }}>{prof.nomeProfessor}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontWeight: 700, fontSize: 16, color: "var(--accent-hover)"
                                                }}>
                                                    {prof.percentualAtual}%
                                                </span>
                                            </td>
                                            <td><span style={{ fontWeight: 500 }}>{prof.pisoAtual ? `R$ ${prof.pisoAtual.toFixed(2)}` : 'R$ 55,00'}</span></td>
                                            <td><span style={{ fontWeight: 500 }}>{prof.tetoAtual ? `R$ ${prof.tetoAtual.toFixed(2)}` : 'R$ 90,00'}</span></td>
                                            <td style={{ color: "var(--text-muted)", fontSize: 12 }}>desde {vig}</td>
                                            <td style={{ textAlign: "right" }}>
                                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setHistModal(prof)}
                                                    >
                                                        Histórico
                                                    </button>
                                                    <button
                                                        className="btn btn-outline btn-sm"
                                                        onClick={() => {
                                                            setModal(prof);
                                                            setNovoPerc(String(prof.percentualAtual));
                                                            setNovoPiso(prof.pisoAtual ? String(prof.pisoAtual) : "55");
                                                            setNovoTeto(prof.tetoAtual ? String(prof.tetoAtual) : "90");
                                                        }}
                                                    >
                                                        Editar Regras
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal editar % */}
            {modal && (
                <div className="modal-overlay" onClick={() => setModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Editar Regras</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                            Professor: <strong style={{ color: "var(--text)" }}>{modal.nomeProfessor}</strong><br />
                            Atual: <strong style={{ color: "var(--accent-hover)" }}>{modal.percentualAtual}% | Piso R$ {modal.pisoAtual || 55} | Teto R$ {modal.tetoAtual || 90}</strong>
                        </p>
                        <div className="form-group" style={{ marginBottom: 15 }}>
                            <label>Novo Percentual (%)</label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={novoPerc}
                                onChange={e => setNovoPerc(e.target.value)}
                                placeholder="Ex: 25"
                                autoFocus
                            />
                        </div>
                        <div style={{ display: "flex", gap: 15, marginBottom: 20 }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Piso (R$)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={novoPiso}
                                    onChange={e => setNovoPiso(e.target.value)}
                                    placeholder="Ex: 55"
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Teto (R$)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={novoTeto}
                                    onChange={e => setNovoTeto(e.target.value)}
                                    placeholder="Ex: 90"
                                />
                            </div>
                        </div>
                        <span style={{ display: 'block', fontSize: 11, color: "var(--text-faint)", marginBottom: 20 }}>
                            Valores monetários. Vigência do conjunto a partir de hoje.
                        </span>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                                {salvando ? "Salvando..." : "Salvar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal histórico */}
            {histModal && (
                <div className="modal-overlay" onClick={() => setHistModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Histórico — {histModal.nomeProfessor}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setHistModal(null)}>✕</button>
                        </div>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '10px' }}>#</th>
                                        <th style={{ padding: '10px' }}>Regras</th>
                                        <th style={{ padding: '10px' }}>Vigência a partir de</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {histModal.historico.map((h, i) => (
                                        <tr key={h.id}>
                                            <td style={{ padding: '10px', color: "var(--text-faint)" }}>{i + 1}</td>
                                            <td style={{ padding: '10px', fontWeight: 700, color: "var(--accent-hover)" }}>{h.percentual}% | R$ {h.piso ?? 55} | R$ {h.teto ?? 90}</td>
                                            <td style={{ padding: '10px', color: "var(--text-muted)" }}>
                                                {new Date(h.dataInicio).toLocaleDateString("pt-BR")}
                                                {i === 0 && <span className="badge badge-green" style={{ marginLeft: 8 }}>Atual</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className="toast toast-success">{toast}</div>}
        </div>
    );
}

"use client";
import { useEffect, useState } from "react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const STATUS_OPTIONS = ["Contestado", "Revisado", "Aprovado"];
const STATUS_COLORS: Record<string, string> = {
    Gerado: "badge-blue",
    Contestado: "badge-yellow",
    Revisado: "badge-gray",
    Aprovado: "badge-green",
};

interface Relatorio {
    id: number;
    idProfessorEvo: string;
    nomeProfessor: string;
    mes: number;
    ano: number;
    status: string;
    versao: number;
    geradoEm: string;
    observacao?: string;
}

export default function RelatoriosPage() {
    const now = new Date();
    const [mes, setMes] = useState(now.getMonth() + 1);
    const [ano, setAno] = useState(now.getFullYear());
    const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusModal, setStatusModal] = useState<Relatorio | null>(null);
    const [novoStatus, setNovoStatus] = useState("");
    const [observacao, setObservacao] = useState("");
    const [toast, setToast] = useState("");

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    };

    const load = async () => {
        setLoading(true);
        const res = await fetch(`/api/relatorio?mes=${mes}&ano=${ano}`);
        const data = await res.json();
        setRelatorios(data.relatorios ?? []);
        setLoading(false);
    };

    useEffect(() => { load(); }, [mes, ano]);

    const atualizarStatus = async () => {
        if (!statusModal || !novoStatus) return;
        const res = await fetch("/api/relatorio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                idProfessorEvo: statusModal.idProfessorEvo,
                nomeProfessor: statusModal.nomeProfessor,
                mes: statusModal.mes,
                ano: statusModal.ano,
                status: novoStatus,
                observacao,
            }),
        });
        if (res.ok) {
            showToast(`✓ Status atualizado para ${novoStatus}`);
            setStatusModal(null);
            load();
        }
    };

    const anos = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

    return (
        <div>
            <div className="page-header flex items-center justify-between">
                <div>
                    <h2 className="page-title">Relatórios</h2>
                    <p className="page-subtitle">Acompanhe o status dos relatórios e gerencie contestações</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div className="form-group">
                        <label>Mês</label>
                        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ width: 140 }}>
                            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Ano</label>
                        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ width: 100 }}>
                            {anos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <button className="btn btn-outline btn-sm" style={{ marginBottom: 2 }} onClick={load}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4" />
                        </svg>
                        Atualizar
                    </button>
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading-overlay"><div className="spinner" /><span>Carregando...</span></div>
                ) : relatorios.length === 0 ? (
                    <div className="empty-state">
                        <h3>Nenhum relatório gerado</h3>
                        <p>Gere um PDF na tela de Cálculo para um professor aparecer aqui.</p>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Professor</th>
                                    <th>Período</th>
                                    <th>Status</th>
                                    <th>Versão</th>
                                    <th>Gerado em</th>
                                    <th>Observação</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {relatorios.map((r) => (
                                    <tr key={r.id}>
                                        <td style={{ fontWeight: 500 }}>{r.nomeProfessor}</td>
                                        <td style={{ color: "var(--text-muted)" }}>{MESES[r.mes - 1]} {r.ano}</td>
                                        <td><span className={`badge ${STATUS_COLORS[r.status] ?? "badge-gray"}`}>{r.status}</span></td>
                                        <td style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>v{r.versao}</td>
                                        <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                            {new Date(r.geradoEm).toLocaleDateString("pt-BR")}
                                        </td>
                                        <td style={{ color: "var(--text-muted)", fontSize: 12, maxWidth: 200 }}>
                                            {r.observacao ?? "—"}
                                        </td>
                                        <td>
                                            {r.status !== "Aprovado" && (
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => { setStatusModal(r); setNovoStatus(""); setObservacao(""); }}
                                                >
                                                    Atualizar Status
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Legenda de status */}
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(STATUS_COLORS).map(([s, cls]) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                        <span className={`badge ${cls}`}>{s}</span>
                        <span>
                            {s === "Gerado" && "PDF gerado, aguardando análise"}
                            {s === "Contestado" && "Professor enviou contestação"}
                            {s === "Revisado" && "Gestor analisou a contestação"}
                            {s === "Aprovado" && "Aprovado pelo professor"}
                        </span>
                    </div>
                ))}
            </div>

            {/* Modal atualizar status */}
            {statusModal && (
                <div className="modal-overlay" onClick={() => setStatusModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Atualizar Status</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setStatusModal(null)}>✕</button>
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                            <strong style={{ color: "var(--text)" }}>{statusModal.nomeProfessor}</strong> —{" "}
                            {MESES[statusModal.mes - 1]} {statusModal.ano}
                            <br />
                            Status atual: <span className={`badge ${STATUS_COLORS[statusModal.status]}`}>{statusModal.status}</span>
                        </p>
                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label>Novo Status</label>
                            <select value={novoStatus} onChange={e => setNovoStatus(e.target.value)}>
                                <option value="">— Selecione —</option>
                                {STATUS_OPTIONS.filter(s => s !== statusModal.status).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label>Observação (opcional)</label>
                            <textarea
                                rows={3}
                                value={observacao}
                                onChange={e => setObservacao(e.target.value)}
                                placeholder="Ex: Professor contestou valor da Turma B..."
                                style={{ resize: "vertical" }}
                            />
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" onClick={() => setStatusModal(null)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={atualizarStatus} disabled={!novoStatus}>
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className="toast toast-success">{toast}</div>}
        </div>
    );
}

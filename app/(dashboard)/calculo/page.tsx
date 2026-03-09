"use client";
import { useState, useCallback } from "react";

interface AlunaCalculo {
    idMember: number;
    nome: string;
    tipo: "fixo" | "free";
    statusContrato: "Ativo" | "Suspenso" | "Cancelado";
    nomeContrato: string;
    mensalidade: number;
    pagouNoMes: boolean;
    contribuicaoPorAula: number;
}

interface ResultadoDiaDaSemana {
    diaDaSemana: string;
    totalAulasNoMes: number;
    alunas: AlunaCalculo[];
    totalBrutoPorAula: number;
    valorFinalPorAula: number;
    totalDiaNoMes: number;
    pisoAplicado: boolean;
    tetoAplicado: boolean;
    pisoBase: number;
    tetoBase: number;
}

interface ResultadoTurma {
    nomeAtividade: string;
    diasDaSemana: string[];
    totalAulas: number;
    dias: ResultadoDiaDaSemana[];
    totalTurmaNoMes: number;
}

interface ResultadoProfessor {
    idProfessorEvo: string;
    nomeProfessor: string;
    percentual: number;
    turmas: ResultadoTurma[];
    totalGeralNoMes: number;
    exclusoes?: { aluna: string; motivo: string }[];
}

const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function fmt(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function BadgeStatus({ status }: { status: "Ativo" | "Suspenso" | "Cancelado" }) {
    const cls = status === "Ativo" ? "badge-green" : status === "Suspenso" ? "badge-yellow" : "badge-red";
    return <span className={`badge ${cls}`}>{status}</span>;
}

function BadgeTipo({ tipo }: { tipo: "fixo" | "free" }) {
    return <span className={`badge ${tipo === "fixo" ? "badge-blue" : "badge-purple"}`}>{tipo === "fixo" ? "Fixo" : "Free"}</span>;
}

function TurmaBlock({ turma, profId, onExcluirAluna }: { turma: ResultadoTurma, profId: string, onExcluirAluna: (profId: string, nomeTurma: string, dia: string, idMember: number, nomeAluna: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="turma-block">
            <div className="turma-header" onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{turma.nomeAtividade}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {turma.diasDaSemana.join(", ")} · {turma.totalAulas} aulas no mês
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: "var(--accent-hover)" }}>{fmt(turma.totalTurmaNoMes)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total no mês consolidado</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: "var(--text-faint)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </div>

            {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px" }}>
                    {turma.dias.map((dia, idx) => (
                        <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                            <div style={{ backgroundColor: "var(--bg-secondary)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{dia.diaDaSemana}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                        {dia.totalAulasNoMes} aulas · {dia.alunas.length} alunas
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {dia.pisoAplicado && <span className="badge badge-yellow">Piso R$55</span>}
                                    {dia.tetoAplicado && <span className="badge badge-red">Teto R$90</span>}
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontWeight: 700, color: "var(--accent-hover)" }}>{fmt(dia.totalDiaNoMes)}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmt(dia.valorFinalPorAula)}/aula</div>
                                    </div>
                                </div>
                            </div>

                            {dia.diaDaSemana.includes("Sábado") ? (
                                <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                                    Listagem de alunas oculta aos sábados (Diária Fixa).
                                </div>
                            ) : (
                                <div className="table-wrap" style={{ margin: 0 }}>
                                    <table style={{ width: "100%" }}>
                                        <thead>
                                            <tr>
                                                <th>Aluna</th>
                                                <th>Tipo</th>
                                                <th>Contrato</th>
                                                <th>Nome do Plano</th>
                                                <th>Mês de Refer.</th>
                                                <th>Pagou?</th>
                                                <th style={{ textAlign: "right" }}>R$/Aula</th>
                                                <th style={{ width: 40 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dia.alunas.map((a, i) => (
                                                <tr key={`${a.idMember}-${i}`}>
                                                    <td style={{ fontWeight: 500 }}>{a.nome}</td>
                                                    <td><BadgeTipo tipo={a.tipo} /></td>
                                                    <td><BadgeStatus status={a.statusContrato} /></td>
                                                    <td style={{ color: "var(--text-muted)", fontSize: 13 }}>{a.nomeContrato}</td>
                                                    <td style={{ color: "var(--text-muted)" }}>{a.tipo === "fixo" ? fmt(a.mensalidade) : "—"}</td>
                                                    <td>
                                                        {a.tipo === "fixo"
                                                            ? <span className={a.pagouNoMes ? "badge badge-green" : "badge badge-gray"}>
                                                                {a.pagouNoMes ? "Sim" : "Não"}
                                                            </span>
                                                            : <span style={{ color: "var(--text-faint)" }}>—</span>
                                                        }
                                                    </td>
                                                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(a.contribuicaoPorAula)}</td>
                                                    <td style={{ textAlign: "center", width: 40 }}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onExcluirAluna(profId, turma.nomeAtividade, dia.diaDaSemana, a.idMember, a.nome); }}
                                                            title="Excluir aluna do cálculo desta sessão"
                                                            style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: 4 }}
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div style={{ padding: "10px 14px", backgroundColor: "var(--bg-secondary)", borderTop: dia.diaDaSemana.includes("Sábado") ? "none" : "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>
                                Bruto s/ trava: <strong style={{ color: "var(--text)" }}>{fmt(dia.totalBrutoPorAula)}</strong>
                                {dia.pisoAplicado && <span style={{ marginLeft: 8, color: "var(--yellow)" }}>→ Ajustado (Piso R$55)</span>}
                                {dia.tetoAplicado && <span style={{ marginLeft: 8, color: "var(--red)" }}>→ Ajustado (Teto R$90)</span>}
                            </div>
                        </div>
                    ))}

                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>Somatório da Turma</div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--accent-hover)" }}>{fmt(turma.totalTurmaNoMes)}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MatrizProfessor({ prof }: { prof: ResultadoProfessor }) {
    const cols = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

    // Monta: horario → dia → { valorAula, totalMes, qtd }
    type Cell = { totalMes: number; totalSomaAula: number; qtdAulas: number };
    const matriz = new Map<string, Map<string, Cell>>();

    prof.turmas.forEach(t => {
        const time = extrairHorario(t.nomeAtividade);
        if (!matriz.has(time)) matriz.set(time, new Map());

        t.dias.forEach(d => {
            const dayMatch = d.diaDaSemana.match(/^(Segunda|Terça|Quarta|Quinta|Sexta)/);
            if (!dayMatch) return;
            const baseDay = dayMatch[1];
            const row = matriz.get(time)!;
            if (!row.has(baseDay)) row.set(baseDay, { totalMes: 0, totalSomaAula: 0, qtdAulas: 0 });
            const cell = row.get(baseDay)!;
            cell.totalMes += d.totalDiaNoMes;
            cell.totalSomaAula += d.valorFinalPorAula;
            cell.qtdAulas += 1;
        });
    });

    const rows = Array.from(matriz.keys()).sort();

    return (
        <div style={{ marginBottom: 20, overflowX: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Matriz de Horários — {prof.nomeProfessor.split(" ")[0]}
            </div>
            <table className="table" style={{ fontSize: 12, width: "100%" }}>
                <thead>
                    <tr>
                        <th style={{ width: 80 }}>Horário</th>
                        {cols.map(c => <th key={c} style={{ textAlign: "center" }}>{c}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(time => (
                        <tr key={time}>
                            <td style={{ fontWeight: 600 }}>{time}</td>
                            {cols.map(col => {
                                const cell = matriz.get(time)?.get(col);
                                if (!cell) return <td key={col} style={{ textAlign: "center", color: "var(--text-faint)" }}>—</td>;
                                const media = cell.qtdAulas > 0 ? cell.totalSomaAula / cell.qtdAulas : 0;
                                return (
                                    <td key={col} style={{ textAlign: "center", padding: "6px 4px" }}>
                                        <div style={{ backgroundColor: "var(--accent-light)", borderRadius: 4, padding: "5px 8px", color: "var(--accent-hover)" }}>
                                            <div style={{ fontWeight: 700, fontSize: 12 }}>{fmt(media)}/aula</div>
                                            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 2, color: "var(--text-muted)" }}>{fmt(cell.totalMes)}</div>
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ProfessorCard({
    prof,
    mes,
    ano,
    onGerarPDF,
    onExcluirAluna,
}: {
    prof: ResultadoProfessor;
    mes: number;
    ano: number;
    onGerarPDF: (prof: ResultadoProfessor) => Promise<void>;
    onExcluirAluna: (profId: string, nomeTurma: string, dia: string, idMember: number, nomeAluna: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [gerando, setGerando] = useState(false);

    return (
        <div className="professor-card">
            <div className="professor-card-header" onClick={() => setOpen(!open)}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: "var(--accent-light)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700, color: "var(--accent-hover)", flexShrink: 0
                    }}>
                        {prof.nomeProfessor[0]}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{prof.nomeProfessor}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {prof.percentual}% · {prof.turmas.length} turma(s)
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-hover)" }}>
                            {fmt(prof.totalGeralNoMes)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>total no mês</div>
                    </div>
                    <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setGerando(true);
                            onGerarPDF(prof).finally(() => setGerando(false));
                        }}
                        disabled={gerando}
                    >
                        {gerando ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                        )}
                        PDF
                    </button>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ color: "var(--text-faint)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </div>

            {open && (
                <div className="professor-card-body">
                    {/* Mini Matriz de Horários filtrada para este professor */}
                    <MatrizProfessor prof={prof} />

                    {prof.turmas.map((turma, i) => (
                        <TurmaBlock key={i} turma={turma} profId={prof.idProfessorEvo} onExcluirAluna={onExcluirAluna} />
                    ))}
                    <div style={{
                        display: "flex", justifyContent: "flex-end", padding: "12px 0 0",
                        borderTop: "1px solid var(--border)", marginTop: 8
                    }}>
                        <div style={{ width: "100%", paddingRight: 16 }}>
                            {prof.exclusoes && prof.exclusoes.length > 0 && (
                                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4, padding: "8px", background: "var(--bg-secondary)", borderRadius: 6, border: "1px solid var(--border)" }}>
                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Alunas Removidas Manualmente do Mês:</div>
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {prof.exclusoes.map((exc, ie) => (
                                            <li key={ie}><strong>{exc.aluna}</strong>: {exc.motivo}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>Total geral do mês</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent-hover)" }}>{fmt(prof.totalGeralNoMes)}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const PROFS_COLORS = ["#dbeafe", "#fef08a", "#fce7f3", "#dcfce7", "#f3e8ff", "#ffedd5"];

function extrairHorario(nome: string) {
    let match = nome.match(/\d{2}h\d{2}|\d{2}:\d{2}|\d{2}h/);
    if (!match) return nome.split(' - ')[1] || nome;

    let time = match[0];
    if (time.length === 3) time = time.replace('h', ':00');
    else time = time.replace('h', ':');
    return time;
}

function TabelaResumoGrade({ professores, professoresFiltrados, horariosOcultos, onOcultarHorario }: { professores: ResultadoProfessor[], professoresFiltrados: ResultadoProfessor[], horariosOcultos: Set<string>, onOcultarHorario: (h: string) => void }) {

    type CellData = { prof: string, color: string, totalMes: number, totalSomaAula: number, qtdAulas: number };
    const matriz = new Map<string, Map<string, Map<string, CellData>>>();

    professores.forEach((p, idx) => {
        const pColor = PROFS_COLORS[idx % PROFS_COLORS.length];
        const pName = p.nomeProfessor.split(' ')[0];

        p.turmas.forEach(t => {
            const time = extrairHorario(t.nomeAtividade);
            if (!matriz.has(time)) matriz.set(time, new Map());

            t.dias.forEach(d => {
                const dayMatch = d.diaDaSemana.match(/^(Segunda|Terça|Quarta|Quinta|Sexta)/);
                if (dayMatch) {
                    const baseDay = dayMatch[1];
                    if (!matriz.get(time)!.has(baseDay)) matriz.get(time)!.set(baseDay, new Map());

                    const cellMap = matriz.get(time)!.get(baseDay)!;
                    if (!cellMap.has(pName)) {
                        cellMap.set(pName, { prof: pName, color: pColor, totalMes: 0, totalSomaAula: 0, qtdAulas: 0 });
                    }

                    const cell = cellMap.get(pName)!;
                    cell.totalMes += d.totalDiaNoMes;
                    cell.totalSomaAula += d.valorFinalPorAula;
                    cell.qtdAulas += 1;
                }
            });
        });
    });

    const allRows = Array.from(matriz.keys()).sort();
    const rows = allRows.filter(r => !horariosOcultos.has(r));
    const cols = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

    const profsSummary = professoresFiltrados.map((p, idx) => {
        const pColor = PROFS_COLORS[idx % PROFS_COLORS.length];
        const pName = p.nomeProfessor.split(' ')[0];
        const totalAulas = p.turmas.reduce((sum, t) => sum + t.dias.reduce((s, d) => s + d.totalAulasNoMes, 0), 0);
        const valorMedio = totalAulas > 0 ? p.totalGeralNoMes / totalAulas : 0;
        return { name: pName, color: pColor, valorMedio, totalGeral: p.totalGeralNoMes };
    });

    return (
        <div style={{ display: "flex", gap: 20, marginBottom: 24, overflowX: "auto", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="card" style={{ flex: 1, minWidth: 600, padding: 20 }}>
                <h3 style={{ marginBottom: 16 }}>Matriz de Remuneração por Grade Horária</h3>
                <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                        <tr>
                            <th style={{ width: 90 }}>Horário</th>
                            {cols.map(c => <th key={c} style={{ textAlign: "center" }}>{c}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(time => (
                            <tr key={time}>
                                <td style={{ fontWeight: 600 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span>{time}</span>
                                        <button
                                            onClick={() => onOcultarHorario(time)}
                                            title="Remover este horário da matriz"
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center", opacity: 0.7 }}
                                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </td>
                                {cols.map(col => {
                                    const cellMap = matriz.get(time)?.get(col);
                                    const cells = cellMap ? Array.from(cellMap.values()) : [];
                                    return (
                                        <td key={col} style={{ textAlign: "center", padding: "8px 4px", verticalAlign: "top" }}>
                                            {cells.map((c, i) => (
                                                <div key={i} style={{ backgroundColor: c.color, padding: "6px 8px", borderRadius: 4, marginBottom: i < cells.length - 1 ? 4 : 0, color: "#1e293b" }}>
                                                    <div style={{ fontWeight: 700, fontSize: 12 }}>{fmt(c.totalSomaAula / c.qtdAulas)}/aula</div>
                                                    <div style={{ fontWeight: 700, fontSize: 12, marginTop: 2 }}>{fmt(c.totalMes)}</div>
                                                    <div style={{ fontSize: 9, opacity: 0.8, marginTop: 4, textTransform: "uppercase" }}>{c.prof}</div>
                                                </div>
                                            ))}
                                            {cells.length === 0 && <span style={{ color: "var(--text-faint)" }}>-</span>}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                        {horariosOcultos.size > 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: "center", padding: "8px" }}>
                                    <button
                                        onClick={() => onOcultarHorario("__RESTORE_ALL__")}
                                        style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", padding: "4px 10px" }}
                                    >
                                        Restaurar {horariosOcultos.size} horário(s) removido(s)
                                    </button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ width: 280, padding: 20 }}>
                <h3 style={{ marginBottom: 16 }}>Resumo Global (R$/H Médio)</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>TAXA MÉDIA / AULA</div>
                        {profsSummary.map(p => (
                            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", backgroundColor: p.color, borderRadius: 6, marginBottom: 6, color: "#0f172a" }}>
                                <span style={{ fontWeight: 600 }}>{p.name}</span>
                                <span style={{ fontWeight: 700 }}>{fmt(p.valorMedio)}</span>
                            </div>
                        ))}
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>FATURAMENTO TOTAL</div>
                        {profsSummary.map(p => (
                            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", backgroundColor: p.color, borderRadius: 6, marginBottom: 6, color: "#0f172a" }}>
                                <span style={{ fontWeight: 600 }}>{p.name}</span>
                                <span style={{ fontWeight: 700 }}>{fmt(p.totalGeral)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

type AlunaGlobal = { idMember: number; nome: string; contrato: string; tipo: string; diasMatriculados: Set<string>; profNames: Set<string> };

function GridGlobalAlunas({ professores, onExcluirGlobal }: { professores: ResultadoProfessor[], onExcluirGlobal: (id: number, nome: string) => void }) {
    const alunasMap = new Map<number, AlunaGlobal>();
    professores.forEach(p => {
        const pName = p.nomeProfessor.split(' ')[0];
        p.turmas.forEach(t => {
            t.dias.forEach(d => {
                d.alunas.forEach(a => {
                    if (!alunasMap.has(a.idMember)) {
                        alunasMap.set(a.idMember, { idMember: a.idMember, nome: a.nome, contrato: a.nomeContrato, tipo: a.tipo, diasMatriculados: new Set(), profNames: new Set() });
                    }
                    const obj = alunasMap.get(a.idMember)!;

                    if (a.tipo === "free") {
                        obj.diasMatriculados.add("FREE");
                    } else {
                        const dayMatch = d.diaDaSemana.match(/^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado)/);
                        const dayPrefix = dayMatch ? dayMatch[1] : "Dia";
                        const time = extrairHorario(t.nomeAtividade).replace(':', 'h');
                        obj.diasMatriculados.add(`${dayPrefix} ${time}`);
                    }
                    obj.profNames.add(pName);
                });
            });
        });
    });

    const alunasSorted = Array.from(alunasMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    return (
        <div className="card" style={{ marginTop: 24, padding: 24, paddingBottom: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Gestão Central: Alunas do Mês</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Lista contendo absolutamente todas as alunas que compuseram o cálculo unificado. A exclusão de uma aluna neste painel atua <strong style={{ color: "var(--red)" }}>globalmente</strong> cortando a matrícula de todas as professoras instantaneamente.</p>
            <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ fontSize: 13 }}>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Plano / Contrato</th>
                            <th style={{ textAlign: "center" }}>Dias Avaliados</th>
                            <th>Professoras</th>
                            <th style={{ textAlign: "center", width: 60 }}>Excluir</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alunasSorted.map(a => (
                            <tr key={a.idMember}>
                                <td style={{ fontWeight: 500 }}>{a.nome}</td>
                                <td>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <BadgeTipo tipo={a.tipo as "fixo" | "free"} />
                                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{a.contrato}</span>
                                    </div>
                                </td>
                                <td style={{ textAlign: "center", color: "var(--text-faint)" }}>{Array.from(a.diasMatriculados).join(", ")}</td>
                                <td style={{ color: "var(--text)" }}>
                                    {Array.from(a.profNames).map(pn => <span key={pn} style={{ display: "inline-block", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4, marginRight: 4, fontSize: 11, fontWeight: 500 }}>{pn}</span>)}
                                </td>
                                <td style={{ textAlign: "center" }}>
                                    <button onClick={() => onExcluirGlobal(a.idMember, a.nome)} title="Excluir de TODAS as turmas do mês" style={{ backgroundColor: "#fef2f2", color: "var(--red)", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default function CalculoPage() {
    const now = new Date();
    const [mes, setMes] = useState(now.getMonth() + 1);
    const [ano, setAno] = useState(now.getFullYear());
    const [loading, setLoading] = useState(false);
    const [resultado, setResultado] = useState<{ professores: ResultadoProfessor[] } | null>(null);
    const [erro, setErro] = useState("");
    const [toast, setToast] = useState("");
    const [horariosOcultos, setHorariosOcultos] = useState<Set<string>>(new Set());

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(""), 3000);
    };

    // Modal de Exclusão Interativa
    const [modalExclusao, setModalExclusao] = useState<{
        open: boolean;
        profId: string;
        nomeTurma: string;
        diaString: string;
        idMember: number;
        nomeAluna: string;
        motivo: string;
        escopo: "sessao" | "prof" | "global";
    }>({ open: false, profId: "", nomeTurma: "", diaString: "", idMember: 0, nomeAluna: "", motivo: "", escopo: "sessao" });

    const handleExcluirAluna = useCallback((profId: string, nomeTurma: string, diaString: string, idMember: number, nomeAluna: string) => {
        setModalExclusao({ open: true, profId, nomeTurma, diaString, idMember, nomeAluna, motivo: "", escopo: "sessao" });
    }, []);

    const handleExcluirAlunaGlobal = useCallback((idMember: number, nomeAluna: string) => {
        setModalExclusao({ open: true, profId: "", nomeTurma: "", diaString: "", idMember, nomeAluna, motivo: "", escopo: "global" });
    }, []);

    const confirmExclusao = useCallback(() => {
        if (!resultado) return;
        const { profId, nomeTurma, diaString, idMember, nomeAluna, motivo, escopo } = modalExclusao;

        if (!motivo.trim()) {
            showToast("Informe o motivo da exclusão.");
            return;
        }

        const newRes = JSON.parse(JSON.stringify(resultado)) as typeof resultado;

        const recalcularDia = (diaInfo: ResultadoDiaDaSemana) => {
            const isSabado = diaInfo.diaDaSemana.includes("Sábado");
            const totalBruto = diaInfo.alunas.reduce((sum, a) => sum + a.contribuicaoPorAula, 0);
            diaInfo.totalBrutoPorAula = Number(totalBruto.toFixed(2));

            let finalValor = totalBruto;
            diaInfo.pisoAplicado = false;
            diaInfo.tetoAplicado = false;

            if (!isSabado) {
                const piso = diaInfo.pisoBase ?? 55;
                const teto = diaInfo.tetoBase ?? 90;
                if (totalBruto > 0 && totalBruto < piso) {
                    finalValor = piso;
                    diaInfo.pisoAplicado = true;
                } else if (totalBruto > teto) {
                    finalValor = teto;
                    diaInfo.tetoAplicado = true;
                }
            } else {
                finalValor = 70.0;
            }

            diaInfo.valorFinalPorAula = Number(finalValor.toFixed(2));
            diaInfo.totalDiaNoMes = Number((finalValor * diaInfo.totalAulasNoMes).toFixed(2));
        };

        if (escopo === "global") {
            newRes.professores.forEach(p => {
                let removed = false;
                p.turmas.forEach(t => {
                    t.dias.forEach(d => {
                        const idx = d.alunas.findIndex(a => a.idMember === idMember);
                        if (idx !== -1) {
                            d.alunas.splice(idx, 1);
                            recalcularDia(d);
                            removed = true;
                        }
                    });
                    t.totalTurmaNoMes = Number(t.dias.reduce((s, d) => s + d.totalDiaNoMes, 0).toFixed(2));
                });
                p.totalGeralNoMes = Number(p.turmas.reduce((s, t) => s + t.totalTurmaNoMes, 0).toFixed(2));

                if (removed) {
                    if (!p.exclusoes) p.exclusoes = [];
                    p.exclusoes.push({ aluna: nomeAluna, motivo: motivo.trim() });
                }
            });
        } else {
            const prof = newRes.professores.find(p => p.idProfessorEvo === profId);
            if (!prof) return;

            if (!prof.exclusoes) prof.exclusoes = [];
            prof.exclusoes.push({ aluna: nomeAluna, motivo: motivo.trim() });

            if (escopo === "prof") {
                prof.turmas.forEach(t => {
                    t.dias.forEach(d => {
                        const idx = d.alunas.findIndex(a => a.idMember === idMember);
                        if (idx !== -1) {
                            d.alunas.splice(idx, 1);
                            recalcularDia(d);
                        }
                    });
                    t.totalTurmaNoMes = Number(t.dias.reduce((s, d) => s + d.totalDiaNoMes, 0).toFixed(2));
                });
            } else {
                const t = prof.turmas.find(x => x.nomeAtividade === nomeTurma);
                if (t) {
                    const d = t.dias.find(x => x.diaDaSemana === diaString);
                    if (d) {
                        const idx = d.alunas.findIndex(a => a.idMember === idMember);
                        if (idx !== -1) {
                            d.alunas.splice(idx, 1);
                            recalcularDia(d);
                        }
                    }
                    t.totalTurmaNoMes = Number(t.dias.reduce((s, day) => s + day.totalDiaNoMes, 0).toFixed(2));
                }
            }
            prof.totalGeralNoMes = Number(prof.turmas.reduce((s, t) => s + t.totalTurmaNoMes, 0).toFixed(2));
        }

        setResultado(newRes);
        setModalExclusao(prev => ({ ...prev, open: false }));
        showToast(escopo !== "sessao" ? "Aluna excluída em massa e recalculo completo ativado!" : "Aluna excluída e sessão recalculada!");
    }, [resultado, modalExclusao]);

    // Reset horários ocultos ao calcular novo mês
    const calcular = async () => {
        setLoading(true);
        setErro("");
        setResultado(null);
        setHorariosOcultos(new Set());
        try {
            const res = await fetch(`/api/calculo?mes=${mes}&ano=${ano}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Erro ao calcular");
            setResultado(data);
        } catch (e: unknown) {
            setErro((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const gerarPDF = useCallback(async (prof: ResultadoProfessor) => {
        try {
            // Registrar status Gerado
            await fetch("/api/relatorio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idProfessorEvo: prof.idProfessorEvo,
                    nomeProfessor: prof.nomeProfessor,
                    mes,
                    ano,
                    status: "Gerado",
                }),
            });

            // Gerar PDF via POST para evitar limite de URL longa
            const response = await fetch(`/api/pdf/${prof.idProfessorEvo}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mes,
                    ano,
                    dadosCalculo: prof,
                }),
            });

            if (!response.ok) throw new Error("Erro na geração do PDF");

            // Recebe blob do PDF e abre numa nova aba temporária
            const blob = await response.blob();
            const pdfUrl = URL.createObjectURL(blob);
            window.open(pdfUrl, "_blank");

            showToast(`✓ PDF gerado para ${prof.nomeProfessor}`);
        } catch {
            showToast("Erro ao gerar PDF");
        }
    }, [mes, ano]);

    const anos = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

    // Derivar resultado filtrado (exclui turmas de seg-sex cujo horário foi removido na Matriz)
    // Sábado NUNCA é filtrado pela matriz (que só exibe seg-sex), para não sumir da listagem.
    const resultadoFiltrado = resultado ? {
        professores: resultado.professores.map(p => {
            const turmasFiltradas = p.turmas.filter(t => {
                const isSabadoTurma = t.diasDaSemana.every(d => d.includes("Sábado"));
                if (isSabadoTurma) return true; // sábado nunca oculta
                return !horariosOcultos.has(extrairHorario(t.nomeAtividade));
            });
            const totalFiltrado = Number(turmasFiltradas.reduce((s, t) => s + t.totalTurmaNoMes, 0).toFixed(2));
            return { ...p, turmas: turmasFiltradas, totalGeralNoMes: totalFiltrado };
        })
    } : null;

    const ocultarHorario = useCallback((h: string) => {
        if (h === "__RESTORE_ALL__") {
            setHorariosOcultos(new Set());
        } else {
            setHorariosOcultos(prev => { const n = new Set(prev); n.add(h); return n; });
        }
    }, []);

    return (
        <div>
            <div className="page-header flex items-center justify-between">
                <div>
                    <h2 className="page-title">Cálculo de Remuneração</h2>
                    <p className="page-subtitle">Selecione o mês de referência e calcule os pagamentos</p>
                </div>
            </div>

            {/* Seletor de mês */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: "0 0 auto" }}>
                        <label>Mês</label>
                        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ width: 160 }}>
                            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ flex: "0 0 auto" }}>
                        <label>Ano</label>
                        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ width: 100 }}>
                            {anos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: "0 0 auto", marginTop: 18 }}>
                        <button className="btn btn-primary" onClick={calcular} disabled={loading}>
                            {loading ? (
                                <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Calculando...</>
                            ) : (
                                <>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                    Calcular {MESES[mes - 1]} {ano}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Erro */}
            {erro && (
                <div className="error-msg" style={{ marginBottom: 20 }}>{erro}</div>
            )}

            {/* Loading */}
            {loading && (
                <div className="loading-overlay">
                    <div className="spinner" style={{ width: 32, height: 32 }} />
                    <span>Buscando dados EVO e calculando remuneração...</span>
                </div>
            )}

            {/* Resultado */}
            {resultado && !loading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Resumo */}
                    {(() => {
                        // Alunas ativas únicas (exclui VIP = plano contendo "vip")
                        const alunaAtivaIds = new Set<number>();
                        resultado.professores.forEach(p => p.turmas.forEach(t => t.dias.forEach(d => d.alunas.forEach(a => {
                            if (!a.nomeContrato.toLowerCase().includes("vip") && a.statusContrato === "Ativo") {
                                alunaAtivaIds.add(a.idMember);
                            }
                        }))));
                        return (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 8 }}>
                                <div className="card-sm">
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Professores</div>
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{resultado.professores.length}</div>
                                </div>
                                <div className="card-sm">
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Total Turmas</div>
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{resultadoFiltrado!.professores.reduce((s, p) => s + p.turmas.length, 0)}</div>
                                </div>
                                <div className="card-sm">
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Alunas Ativas</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--yellow)" }}>{alunaAtivaIds.size}</div>
                                </div>
                                <div className="card-sm">
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Total Geral</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent-hover)" }}>
                                        {fmt(resultadoFiltrado!.professores.reduce((s, p) => s + p.totalGeralNoMes, 0))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Matriz Grade de Resumo e Average/Hour */}
                    {resultado.professores.length > 0 && (
                        <TabelaResumoGrade professores={resultado.professores} professoresFiltrados={resultadoFiltrado!.professores} horariosOcultos={horariosOcultos} onOcultarHorario={ocultarHorario} />
                    )}

                    {resultadoFiltrado!.professores.length === 0 ? (
                        <div className="empty-state">
                            <h3>Nenhum dado encontrado</h3>
                            <p>Não há aulas agendadas para {MESES[mes - 1]} {ano} na API EVO.</p>
                        </div>
                    ) : (
                        resultadoFiltrado!.professores.map((prof) => (
                            <ProfessorCard key={prof.idProfessorEvo} prof={prof} mes={mes} ano={ano} onGerarPDF={gerarPDF} onExcluirAluna={handleExcluirAluna} />
                        ))
                    )}

                    {/* Gestor Global Unificado de Alunas */}
                    {resultadoFiltrado!.professores.length > 0 && (
                        <GridGlobalAlunas professores={resultado.professores} onExcluirGlobal={handleExcluirAlunaGlobal} />
                    )}
                </div>
            )}

            {/* MODAL DE EXCLUSÃO DE ALUNA */}
            {modalExclusao.open && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(15, 23, 42, 0.75)", zIndex: 9999,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backdropFilter: "blur(4px)"
                }}>
                    <div className="card" style={{ width: 480, padding: 28, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: "1px solid var(--border)" }}>
                        <h3 style={{ marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            Confirmar Exclusão
                        </h3>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.5 }}>
                            Você está removendo a aluna <strong style={{ color: "var(--text)" }}>{modalExclusao.nomeAluna}</strong> {
                                modalExclusao.escopo === "global"
                                    ? <span style={{ color: "var(--red)", fontWeight: 600 }}>de todas as academias e professores definitivamente no mês</span>
                                    : <span>da sessão de <strong>{modalExclusao.diaString}</strong> na turma <strong>{modalExclusao.nomeTurma}</strong></span>
                            }. O recálculo ocorrerá automaticamente.
                        </p>

                        <div className="form-group">
                            <label style={{ fontWeight: 600 }}>Motivo da exclusão *</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Ex: Contrato encerrado em Dezembro"
                                value={modalExclusao.motivo}
                                onChange={e => setModalExclusao({ ...modalExclusao, motivo: e.target.value })}
                                autoFocus
                            />
                        </div>

                        {modalExclusao.escopo === "global" ? (
                            <div style={{ padding: "16px", backgroundColor: "#fef2f2", color: "var(--red)", borderRadius: 8, marginTop: 20, border: "1px dashed #fca5a5" }}>
                                <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                    Remoção Global Invocada
                                </strong>
                                <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, color: "#991b1b" }}>Ao confirmar, o sistema procurará o contrato de <strong>{modalExclusao.nomeAluna}</strong> e o dizimará de <strong>absolutamente todas as turmas de todas as professoras</strong> no processo do mês simultaneamente, regravando todos os limitadores e valores de teto da grade.</p>
                            </div>
                        ) : (
                            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 13, color: "var(--text)", padding: "16px", backgroundColor: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", marginTop: 20 }}>
                                <input
                                    type="checkbox"
                                    style={{ width: 18, height: 18, accentColor: "var(--red)", cursor: "pointer", marginTop: 2 }}
                                    checked={modalExclusao.escopo === "prof"}
                                    onChange={e => setModalExclusao({ ...modalExclusao, escopo: e.target.checked ? "prof" : "sessao" })}
                                />
                                <span style={{ lineHeight: 1.4 }}>
                                    <strong style={{ display: "block", marginBottom: 2 }}>Remoção em Massa (Professora Atual)</strong>
                                    Remover <strong>{modalExclusao.nomeAluna}</strong> de absolutamente todas as sessões apenas desta professora neste mês.
                                </span>
                            </label>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 28 }}>
                            <button className="btn" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text)" }} onClick={() => setModalExclusao({ ...modalExclusao, open: false })}>Cancelar</button>
                            <button className="btn" style={{ backgroundColor: "var(--red)", color: "white", fontWeight: 600 }} onClick={confirmExclusao}>Excluir e Recalcular</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE EXCLUSÃO DE ALUNA */}
            {modalExclusao.open && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(15, 23, 42, 0.75)", zIndex: 9999,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backdropFilter: "blur(4px)"
                }}>
                    <div className="card" style={{ width: 480, padding: 28, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: "1px solid var(--border)" }}>
                        <h3 style={{ marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            Confirmar Exclusão
                        </h3>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.5 }}>
                            Você está removendo a aluna <strong style={{ color: "var(--text)" }}>{modalExclusao.nomeAluna}</strong> {
                                modalExclusao.escopo === "global"
                                    ? <span style={{ color: "var(--red)", fontWeight: 600 }}>de todas as academias e professores definitivamente no mês</span>
                                    : <span>da sessão de <strong>{modalExclusao.diaString}</strong> na turma <strong>{modalExclusao.nomeTurma}</strong></span>
                            }. O recálculo ocorrerá automaticamente.
                        </p>

                        <div className="form-group">
                            <label style={{ fontWeight: 600 }}>Motivo da exclusão *</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Ex: Contrato encerrado em Dezembro"
                                value={modalExclusao.motivo}
                                onChange={e => setModalExclusao({ ...modalExclusao, motivo: e.target.value })}
                                autoFocus
                            />
                        </div>

                        {modalExclusao.escopo === "global" ? (
                            <div style={{ padding: "16px", backgroundColor: "#fef2f2", color: "var(--red)", borderRadius: 8, marginTop: 20, border: "1px dashed #fca5a5" }}>
                                <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                    Remoção Global Invocada
                                </strong>
                                <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, color: "#991b1b" }}>Ao confirmar, o sistema procurará o contrato de <strong>{modalExclusao.nomeAluna}</strong> e a removerá de <strong>todas as sessões independentemente de qual professora</strong>.</p>
                            </div>
                        ) : (
                            <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--text)", padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", marginTop: 20 }}>
                                <input
                                    type="checkbox"
                                    style={{ width: 18, height: 18, accentColor: "var(--red)", cursor: "pointer", marginTop: 2 }}
                                    checked={modalExclusao.escopo === "prof"}
                                    onChange={e => setModalExclusao({ ...modalExclusao, escopo: e.target.checked ? "prof" : "sessao" })}
                                />
                                <span style={{ lineHeight: 1.4 }}>
                                    <strong style={{ display: "block", marginBottom: 2 }}>Remoção em Massa (Professora Atual)</strong>
                                    Remover <strong>{modalExclusao.nomeAluna}</strong> de absolutamente todas as sessões apenas desta professora neste mês.
                                </span>
                            </label>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 28 }}>
                            <button className="btn" style={{ backgroundColor: "var(--bg)", color: "var(--text)" }} onClick={() => setModalExclusao({ ...modalExclusao, open: false })}>Cancelar</button>
                            <button className="btn" style={{ backgroundColor: "var(--red)", color: "white", fontWeight: 600 }} onClick={confirmExclusao}>Excluir e Recalcular</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className="toast toast-success">{toast}</div>}
        </div>
    );
}

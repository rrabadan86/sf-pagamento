import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
} from "@react-pdf/renderer";

const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function fmt(v: number) {
    return `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

const STATUS_COLOR: Record<string, string> = {
    Gerado: "#3b82f6",
    Contestado: "#eab308",
    Revisado: "#94a3b8",
    Aprovado: "#22c55e",
};

const s = StyleSheet.create({
    page: { padding: 40, fontFamily: "Helvetica", fontSize: 9, color: "#1e293b", backgroundColor: "#fff" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 16, borderBottom: "1 solid #e2e8f0" },
    headerLeft: { flex: 1 },
    logo: { width: 64, height: 64, objectFit: "contain" },
    academiaName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0f172a", marginBottom: 2 },
    subtitle: { fontSize: 8, color: "#64748b" },
    infoRow: { flexDirection: "row", gap: 24, marginTop: 6 },
    infoItem: { flexDirection: "column" },
    infoLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
    infoValue: { fontSize: 9, color: "#1e293b", fontFamily: "Helvetica-Bold" },
    sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e293b", marginBottom: 8, marginTop: 18 },
    turmaBlock: { marginBottom: 16, borderRadius: 4, border: "1 solid #e2e8f0", overflow: "hidden" },
    turmaHeader: { backgroundColor: "#f8fafc", padding: "8 12", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    turmaName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#0f172a" },
    turmaMeta: { fontSize: 7, color: "#64748b", marginTop: 2 },
    tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: "5 8" },
    tableRow: { flexDirection: "row", padding: "5 8", borderTop: "1 solid #f1f5f9" },
    tableRowAlt: { flexDirection: "row", padding: "5 8", backgroundColor: "#fafafa", borderTop: "1 solid #f1f5f9" },
    col1: { flex: 2.5, fontSize: 8 },
    colP: { flex: 3.5, fontSize: 8 },
    col2: { flex: 1.5, fontSize: 8, textAlign: "center" },
    col3: { flex: 1.5, fontSize: 8, textAlign: "center" },
    col4: { flex: 1.5, fontSize: 8, textAlign: "right" },
    small: { fontSize: 7, color: "#94a3b8" },
    turmaFooter: { flexDirection: "row", justifyContent: "space-between", padding: "6 12", backgroundColor: "#eff6ff", borderTop: "1 solid #dbeafe" },
    totalBlock: { marginTop: 24, padding: 16, backgroundColor: "#0f172a", borderRadius: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    totalLabel: { fontSize: 9, color: "#94a3b8" },
    totalValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#818cf8" },
    footer: { marginTop: 24, paddingTop: 12, borderTop: "1 solid #e2e8f0", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    statusBadge: { padding: "3 8", borderRadius: 4, fontSize: 8, fontFamily: "Helvetica-Bold" },
    badge: { fontSize: 7, padding: "2 5", borderRadius: 3 },
});

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

interface Props {
    professor: ResultadoProfessor;
    mes: number;
    ano: number;
    nomeAcademia: string;
    logoBase64?: string | null;
    status: string;
    versao: number;
    geradoEm: Date;
}

function StatusBadge({ status }: { status: string }) {
    const color = STATUS_COLOR[status] ?? "#94a3b8";
    return (
        <View style={[s.statusBadge, { backgroundColor: `${color}20`, color }]}>
            <Text>{status}</Text>
        </View>
    );
}

function TipoBadge({ tipo }: { tipo: "fixo" | "free" }) {
    return (
        <View style={[s.badge, { backgroundColor: tipo === "fixo" ? "#eff6ff" : "#f5f3ff", color: tipo === "fixo" ? "#3b82f6" : "#8b5cf6" }]}>
            <Text>{tipo === "fixo" ? "Fixo" : "Free"}</Text>
        </View>
    );
}

function ContratoBadge({ status }: { status: string }) {
    const colors: Record<string, [string, string]> = {
        Ativo: ["#f0fdf4", "#22c55e"],
        Suspenso: ["#fefce8", "#eab308"],
        Cancelado: ["#fef2f2", "#ef4444"],
    };
    const [bg, txt] = colors[status] ?? ["#f8fafc", "#94a3b8"];
    return (
        <View style={[s.badge, { backgroundColor: bg, color: txt }]}>
            <Text>{status}</Text>
        </View>
    );
}

export function RelatorioPDF({
    professor,
    mes,
    ano,
    nomeAcademia,
    logoBase64,
    status,
    versao,
    geradoEm,
}: Props) {
    const dataGeracao = new Date(geradoEm).toLocaleDateString("pt-BR");
    const mesNome = MESES[mes - 1];

    return (
        <Document author={nomeAcademia} title={`Pagamento ${professor.nomeProfessor} — ${mesNome} ${ano}`}>
            <Page size="A4" style={s.page}>
                {/* CABEÇALHO */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <Text style={s.academiaName}>{nomeAcademia}</Text>
                        <Text style={s.subtitle}>Relatório de Remuneração de Professor</Text>
                        <View style={s.infoRow}>
                            <View style={s.infoItem}>
                                <Text style={s.infoLabel}>Professor</Text>
                                <Text style={s.infoValue}>{professor.nomeProfessor}</Text>
                            </View>
                            <View style={s.infoItem}>
                                <Text style={s.infoLabel}>Período</Text>
                                <Text style={s.infoValue}>{mesNome} {ano}</Text>
                            </View>
                            <View style={s.infoItem}>
                                <Text style={s.infoLabel}>Percentual</Text>
                                <Text style={s.infoValue}>{professor.percentual}%</Text>
                            </View>
                            <View style={s.infoItem}>
                                <Text style={s.infoLabel}>Gerado em</Text>
                                <Text style={s.infoValue}>{dataGeracao}</Text>
                            </View>
                        </View>
                    </View>
                    {logoBase64 && (
                        <Image src={logoBase64} style={s.logo} />
                    )}
                </View>

                {/* TURMAS */}
                {professor.turmas.map((turma, ti) => (
                    <View key={ti} style={s.turmaBlock}>
                        <View style={s.turmaHeader}>
                            <View>
                                <Text style={s.turmaName}>{turma.nomeAtividade}</Text>
                                <Text style={s.turmaMeta}>
                                    {turma.diasDaSemana.join(", ")} · {turma.totalAulas} aulas totais
                                </Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#6366f1" }}>
                                    {fmt(turma.totalTurmaNoMes)}
                                </Text>
                                <Text style={{ fontSize: 7, color: "#94a3b8" }}>Total da Turma</Text>
                            </View>
                        </View>

                        {turma.dias.map((dia, di) => (
                            <View key={di} style={{ borderTop: "1 solid #e2e8f0" }}>
                                <View style={{ padding: "6 12", backgroundColor: "#f8fafc", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                    <View>
                                        <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1e293b" }}>{dia.diaDaSemana}</Text>
                                        <Text style={{ fontSize: 7, color: "#64748b" }}>{dia.totalAulasNoMes} aulas · {dia.alunas.length} aluna(s)</Text>
                                    </View>
                                    <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 6 }}>
                                        {dia.pisoAplicado && <Text style={{ fontSize: 7, color: "#eab308", paddingRight: 4 }}>Piso aplicado</Text>}
                                        {dia.tetoAplicado && <Text style={{ fontSize: 7, color: "#ef4444", paddingRight: 4 }}>Teto aplicado</Text>}
                                        <View style={{ alignItems: "flex-end" }}>
                                            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#334155" }}>
                                                {fmt(dia.totalDiaNoMes)}
                                            </Text>
                                            <Text style={{ fontSize: 7, color: "#94a3b8" }}>{fmt(dia.valorFinalPorAula)}/aula</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Cabeçalho tabela */}
                                <View style={s.tableHeader}>
                                    <Text style={[s.col1, { fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold" }]}>Aluna</Text>
                                    <Text style={[s.colP, { fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold" }]}>Nome do Plano</Text>
                                    <Text style={[s.col2, { fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold" }]}>Tipo</Text>
                                    <Text style={[s.col3, { fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold" }]}>Contrato</Text>
                                    <Text style={[s.col4, { fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold", textAlign: "right" }]}>R$/Aula</Text>
                                </View>

                                {dia.alunas.map((aluna, ai) => (
                                    <View key={ai} style={ai % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                                        <Text style={s.col1}>{aluna.nome}</Text>
                                        <Text style={[s.colP, { color: "#64748b" }]}>{aluna.nomeContrato}</Text>
                                        <View style={[s.col2, { alignItems: "center" }]}>
                                            <TipoBadge tipo={aluna.tipo} />
                                        </View>
                                        <View style={[s.col3, { alignItems: "center" }]}>
                                            <ContratoBadge status={aluna.statusContrato} />
                                        </View>
                                        <Text style={[s.col4, { fontFamily: "Helvetica-Bold", textAlign: "right" }]}>{fmt(aluna.contribuicaoPorAula)}</Text>
                                    </View>
                                ))}

                                <View style={s.turmaFooter}>
                                    <Text style={{ fontSize: 7, color: "#64748b" }}>
                                        Bruto s/ trava: {fmt(dia.totalBrutoPorAula)}
                                        {dia.pisoAplicado ? " → Ajustado (Piso R$55)" : dia.tetoAplicado ? " → Ajustado (Teto R$90)" : ""}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                ))}

                {/* TOTAL GERAL */}
                <View style={s.totalBlock}>
                    <View>
                        <Text style={s.totalLabel}>Total a receber no mês</Text>
                        <Text style={{ fontSize: 7, color: "#475569", marginTop: 2 }}>
                            Soma de todas as turmas — {professor.turmas.length} turma(s)
                        </Text>
                    </View>
                    <Text style={s.totalValue}>{fmt(professor.totalGeralNoMes)}</Text>
                </View>

                {/* EXCLUSÕES */}
                {professor.exclusoes && professor.exclusoes.length > 0 && (
                    <View style={{ margin: "16 16 0 16", padding: 12, border: "1 dashed #ef4444", borderRadius: 6, backgroundColor: "#fef2f2" }}>
                        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#b91c1c", marginBottom: 6 }}>
                            Alunas Removidas Manualmente do Mês (Motivos Registrados)
                        </Text>
                        {professor.exclusoes.map((exc, i) => (
                            <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
                                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#7f1d1d", width: 120 }}>{exc.aluna}</Text>
                                <Text style={{ fontSize: 8, color: "#991b1b", flex: 1 }}>Motivo: {exc.motivo}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* RODAPÉ */}
                <View style={s.footer}>
                    <View>
                        <StatusBadge status={status} />
                    </View>
                    <Text style={{ fontSize: 7, color: "#94a3b8" }}>
                        Versão {versao} · Gerado em {dataGeracao}
                    </Text>
                </View>
            </Page>
        </Document>
    );
}

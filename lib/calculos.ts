/**
 * Lógica de cálculo de remuneração de professores.
 * Funções puras — sem efeitos colaterais, fáceis de testar.
 */

export const PISO = 55;
export const TETO = 90;
export const CONTRIBUICAO_FREE = 11;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AlunaCalculo {
    idMember: number;
    nome: string;
    tipo: "fixo" | "free";
    statusContrato: "Ativo" | "Suspenso" | "Cancelado";
    nomeContrato: string;
    mensalidade: number; // 0 para free
    pagouNoMes: boolean;
    contribuicaoPorAula: number; // calculado
}

export interface ResultadoDiaDaSemana {
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

export interface ResultadoTurma {
    nomeAtividade: string;
    diasDaSemana: string[];
    totalAulas: number;
    dias: ResultadoDiaDaSemana[];
    totalTurmaNoMes: number;
}

export interface ResultadoProfessor {
    idProfessorEvo: string;
    nomeProfessor: string;
    percentual: number;
    turmas: ResultadoTurma[];
    totalGeralNoMes: number;
    exclusoes?: { aluna: string; motivo: string }[];
}

// ─── Funções de Cálculo ───────────────────────────────────────────────────────

/**
 * Conta quantas vezes cada dia da semana ocorre num mês.
 * dayOfWeek: 0=Dom, 1=Seg, ..., 6=Sáb
 */
export function contarOcorrenciasDia(
    dayOfWeek: number,
    mes: number,
    ano: number
): number {
    let count = 0;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    for (let d = 1; d <= ultimoDia; d++) {
        const date = new Date(ano, mes - 1, d);
        if (date.getDay() === dayOfWeek) count++;
    }
    return count;
}

/**
 * Conta total de aulas no mês para uma lista de dias da semana (ex: [1, 4] = seg e qui).
 */
export function contarAulasMes(
    diasDaSemana: number[],
    mes: number,
    ano: number
): number {
    return diasDaSemana.reduce(
        (sum, d) => sum + contarOcorrenciasDia(d, mes, ano),
        0
    );
}

/**
 * Calcula contribuição por aula de uma aluna de plano fixo.
 */
export function contribuicaoFixa(
    mensalidade: number,
    percentual: number,
    totalAulas: number
): number {
    if (totalAulas === 0) return 0;
    return (mensalidade * (percentual / 100)) / totalAulas;
}

/**
 * Aplica piso e teto sobre o valor bruto da turma por aula.
 */
export function aplicarPisoTeto(valorBruto: number, piso: number = PISO, teto: number = TETO): {
    valorFinal: number;
    pisoAplicado: boolean;
    tetoAplicado: boolean;
} {
    if (valorBruto < piso) {
        return { valorFinal: piso, pisoAplicado: true, tetoAplicado: false };
    }
    if (valorBruto > teto) {
        return { valorFinal: teto, pisoAplicado: false, tetoAplicado: true };
    }
    return { valorFinal: valorBruto, pisoAplicado: false, tetoAplicado: false };
}

/**
 * Calcula o resultado completo de um único dia da semana.
 * A contribuição individual da aluna já deve vir calculada pelo rateio do mês da turma toda.
 */
export function calcularDiaDaSemana(params: {
    diaDaSemana: string;
    totalAulasNoDia: number;
    alunasCalculadas: AlunaCalculo[];
    piso?: number;
    teto?: number;
}): ResultadoDiaDaSemana {
    const { diaDaSemana, totalAulasNoDia, alunasCalculadas, piso = PISO, teto = TETO } = params;

    const totalBrutoPorAula = alunasCalculadas.reduce(
        (sum, a) => sum + a.contribuicaoPorAula,
        0
    );

    const { valorFinal, pisoAplicado, tetoAplicado } =
        aplicarPisoTeto(totalBrutoPorAula, piso, teto);

    return {
        diaDaSemana,
        totalAulasNoMes: totalAulasNoDia,
        alunas: alunasCalculadas,
        totalBrutoPorAula,
        valorFinalPorAula: valorFinal,
        totalDiaNoMes: valorFinal * totalAulasNoDia,
        pisoAplicado,
        tetoAplicado,
        pisoBase: piso,
        tetoBase: teto,
    };
}

/**
 * Arredonda para 2 casas decimais.
 */
export function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Nomes dos dias da semana em português.
 */
export const DIAS_SEMANA = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
];

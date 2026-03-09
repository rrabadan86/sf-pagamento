import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getSchedule, getMemberMemberships, EvoSchedule, EvoMemberMembership, statusContrato, temPagamentoNoMes, tipoDePlano } from "@/lib/evo/queries";
import { getTurmaEnrollments, EvoEnrollment, getMemberFixedSchedules, EvoFixedSchedule } from "@/lib/evo/enrollments";
import { calcularDiaDaSemana, contribuicaoFixa, CONTRIBUICAO_FREE, round2, contarAulasMes, DIAS_SEMANA, AlunaCalculo, ResultadoProfessor, ResultadoTurma, ResultadoDiaDaSemana } from "@/lib/calculos";

export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mes = parseInt(searchParams.get("mes") ?? "0");
    const ano = parseInt(searchParams.get("ano") ?? "0");

    if (!mes || !ano) {
        return NextResponse.json({ error: "Parâmetros mes e ano são obrigatórios" }, { status: 400 });
    }

    try {
        // 1. Buscar grade de aulas do mês na API EVO
        const schedule = await getSchedule(mes, ano);

        // 2. Buscar matrículas do mês na API EVO
        const memberships = await getMemberMemberships(mes, ano);

        // 3. Buscar percentuais vigentes no 1º dia do mês
        const primeiroDia = new Date(ano, mes - 1, 1);

        // Agrupar aulas por professor e por turma (nomeAtividade)
        const porProfessor: Record<string, {
            nomeProfessor: string;
            turmas: Record<string, EvoSchedule[]>;
        }> = {};

        for (const aula of schedule) {
            // A API EVO não retorna instructorId na grade, então usamos o nome como identificador único perante a EVO
            const pid = aula.instructor || "Desconhecido";
            const turmaKey = `${aula.name} - ${aula.startTime} `;
            if (!porProfessor[pid]) {
                porProfessor[pid] = { nomeProfessor: pid, turmas: {} };
            }
            if (!porProfessor[pid].turmas[turmaKey]) {
                porProfessor[pid].turmas[turmaKey] = [];
            }
            porProfessor[pid].turmas[turmaKey].push(aula);
        }

        console.log("Professores encontrados (keys):", Object.keys(porProfessor));
        console.log("Nomes dos professores:", Object.values(porProfessor).map(p => p.nomeProfessor));

        // Calcular total global de aulas por turma (chave: nome - startTime) no mês
        // Isso resolve o bug onde professores substitutos dividiam a mensalidade por 1 em vez do total da turma no mês.
        const globalTurmaAulas = new Map<string, number>();
        for (const aula of schedule) {
            const turmaKey = `${aula.name} - ${aula.startTime} `;
            globalTurmaAulas.set(turmaKey, (globalTurmaAulas.get(turmaKey) || 0) + 1);
        }

        // Coletar todos os IDs de membros matriculados para buscar suas grades fixas
        const todosIdMatriculadas = new Set<number>();
        for (const aula of schedule) {
            const idSession = (aula as any).idAtividadeSessao;
            const enrollments = await getTurmaEnrollments(idSession);
            enrollments.forEach(e => todosIdMatriculadas.add(e.idMember));
        }

        // Mega Cache das Grades Fixas dos alunos que passaram pelo professor neste mês
        const matriculasFixasGlobal = new Map<number, EvoFixedSchedule[]>();
        await Promise.all(
            Array.from(todosIdMatriculadas).map(async (idMem) => {
                const fixedScheduleArray = await getMemberFixedSchedules(idMem);
                matriculasFixasGlobal.set(idMem, fixedScheduleArray);
            })
        );

        // 4. Sincronizar professores novos (percentual padrão 20%) + buscar percentual vigente
        const resultado: ResultadoProfessor[] = [];

        for (const [pid, prof] of Object.entries(porProfessor)) {
            // Garantir que o professor existe no BD
            const existente = await prisma.professorPercentual.findFirst({
                where: { idProfessorEvo: pid },
                orderBy: { dataInicio: "desc" },
            });
            if (!existente) {
                await prisma.professorPercentual.create({
                    data: {
                        idProfessorEvo: pid,
                        nomeProfessor: prof.nomeProfessor,
                        percentual: 20,
                        dataInicio: primeiroDia,
                    },
                });
            }

            // Pega as definições mais recentes (percentual, piso, teto) ativas para este professor
            const percRecord = await prisma.professorPercentual.findFirst({
                where: {
                    idProfessorEvo: pid,
                },
                orderBy: { dataInicio: "desc" },
            });
            const percentual = percRecord?.percentual ?? 20;

            // 5. Calcular cada turma
            const turmasCalculadas: ResultadoTurma[] = [];

            for (const [nomeTurma, aulas] of Object.entries(prof.turmas)) {
                // Derivar dias da semana únicos para o cabeçalho descritivo "Segunda, Quarta..."
                const diasSet = new Set<number>();
                for (const a of aulas) {
                    const d = new Date(a.activityDate).getDay();
                    diasSet.add(d);
                }
                const diasArray = Array.from(diasSet).sort();
                const nomesDias = diasArray.map((d) => DIAS_SEMANA[d]);
                const totalAulasGeral = aulas.length;

                const isCircuitoClass = nomeTurma.toLowerCase().includes("circuito");
                const diasCalculados: ResultadoDiaDaSemana[] = []; // Irão representar as Sessões (Aulas individuais)

                if (totalAulasGeral === 0) continue;

                // Ordenar aulas cronologicamente
                const aulasOrdenadas = [...aulas].sort(
                    (a, b) => new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime()
                );

                // Requisitar matrículas em lote para todas as sessões para performance
                const aulasComMatriculas = await Promise.all(
                    aulasOrdenadas.map(async (aula) => {
                        const idSession = (aula as any).idAtividadeSessao;
                        const enrollments = await getTurmaEnrollments(idSession);
                        return { aula, enrollments };
                    })
                );

                for (const { aula, enrollments } of aulasComMatriculas) {
                    const dataAula = new Date(aula.activityDate);
                    const nomeDiaStr = DIAS_SEMANA[dataAula.getDay()];

                    const pDia = dataAula.getDate().toString().padStart(2, "0");
                    const pMes = (dataAula.getMonth() + 1).toString().padStart(2, "0");
                    const diaDesc = `${nomeDiaStr} — ${pDia}/${pMes} às ${aula.startTime}`;

                    const statusMatriculadas = new Map<number, { replacement: boolean; status: number }>();
                    enrollments.forEach(e => statusMatriculadas.set(e.idMember, { replacement: e.replacement, status: e.status }));
                    const alunasDoMes: AlunaCalculo[] = [];
                    // Validar usando a data exata da aula em questão:
                    const calcDate = new Date(ano, mes - 1, dataAula.getDate());

                    for (const [idMember, evoData] of Array.from(statusMatriculadas.entries())) {
                        const isEvoReplacement = evoData.replacement;
                        const isPresent = evoData.status === 0;
                        let memberContracts = memberships.filter((m) => m.idMember === idMember);
                        if (memberContracts.length === 0) continue;

                        // Remover contratos "Circuito Slim" se a turma NÃO for Circuito
                        if (!isCircuitoClass) {
                            const semCircuito = memberContracts.filter(
                                (m) => !(m.nameMembership || "").toLowerCase().includes("circuito slim")
                            );
                            if (semCircuito.length > 0) memberContracts = semCircuito;
                        }

                        // Ordenar para escolher o contrato mais relevante
                        memberContracts.sort((a, b) => {
                            const aName = (a.nameMembership || "").toLowerCase();
                            const bName = (b.nameMembership || "").toLowerCase();
                            const className = nomeTurma.toLowerCase();

                            let aScore = 0;
                            let bScore = 0;

                            if (className.includes("slimfit") && aName.includes("slimfit")) aScore += 10;
                            if (className.includes("slimfit") && bName.includes("slimfit")) bScore += 10;
                            if (className.includes("circuito") && aName.includes("circuito")) aScore += 10;
                            if (className.includes("circuito") && bName.includes("circuito")) bScore += 10;

                            if (tipoDePlano(a.nameMembership) === "fixo") aScore += 5;
                            if (tipoDePlano(b.nameMembership) === "fixo") bScore += 5;

                            if (statusContrato(a) === "Ativo") aScore += 2;
                            if (statusContrato(b) === "Ativo") bScore += 2;

                            // Vigência no mês de cálculo
                            const aStart = a.membershipStart ? new Date(a.membershipStart) : new Date(0);
                            const aEnd = a.membershipEnd ? new Date(a.membershipEnd) : new Date(0);
                            const bStart = b.membershipStart ? new Date(b.membershipStart) : new Date(0);
                            const bEnd = b.membershipEnd ? new Date(b.membershipEnd) : new Date(0);

                            const isVigenteA = (aStart <= calcDate && aEnd >= calcDate) ? 1 : 0;
                            const isVigenteB = (bStart <= calcDate && bEnd >= calcDate) ? 1 : 0;

                            aScore += isVigenteA * 20;
                            bScore += isVigenteB * 20;

                            // Tiebreaker pela maior validade
                            if (aScore === bScore) return bEnd.getTime() - aEnd.getTime();

                            return bScore - aScore;
                        });

                        const m = memberContracts[0];

                        // Valor mensal
                        let valorMes = m.saleValue;

                        if (m.membershipStart && m.membershipEnd) {
                            // Prioridade: dividir pelo número de meses de vigência do contrato.
                            // Isso é mais confiável que totalInstallments, que pode refletir
                            // recebíveis antecipados ou renegociados ao invés do prazo real.
                            const start = new Date(m.membershipStart);
                            const end = new Date(m.membershipEnd);
                            let months =
                                (end.getFullYear() - start.getFullYear()) * 12 +
                                (end.getMonth() - start.getMonth());
                            if (months <= 0) months = 1;
                            if (months > 1 && months <= 24) valorMes = m.saleValue / months;
                        } else {
                            // Fallback: usar totalInstallments se não houver datas de vigência
                            const r = m.receivables.find((rec) => !rec.canceled && rec.totalInstallments > 0);
                            if (r && r.totalInstallments > 1 && r.totalInstallments <= 12) {
                                valorMes = m.saleValue / r.totalInstallments;
                            }
                        }

                        const tipo = tipoDePlano(m.nameMembership);

                        // O valor da mensalidade deve ser calculado em cima de 97% do valor nos contratos fixos
                        if (tipo === "fixo") {
                            valorMes = round2(valorMes * 0.97);
                        }
                        // Reposição: verifica se a aluna tem horário fixo nessa turma
                        let isFixoEmReposicao = false;
                        if (tipo === "fixo") {
                            const diaAulaNum = dataAula.getDay();
                            const startTimeMask = aula.startTime.substring(0, 5); // ex: "08:30"

                            // Grade fixa atual da aluna na EVO
                            const agendaAluna = matriculasFixasGlobal.get(m.idMember) || [];

                            // Verifica se há agendamento para esse dia e horário
                            const ehOficialmenteDela = agendaAluna.some(ag => ag.weekDay === diaAulaNum && ag.startTime.startsWith(startTimeMask));

                            if (!ehOficialmenteDela) {
                                isFixoEmReposicao = true;
                            } else if (isEvoReplacement === true) {
                                // Se a EVO explicitar reposição, respeita mesmo que tenha horário fixo
                                isFixoEmReposicao = true;
                            }
                        }

                        // Alunas Free rendem R$ 11. Fixas em Reposição rendem R$ 0. Fixas Agendadas dividem mensalidade.
                        let contrib = 0;
                        if (tipo === "fixo") {
                            // Encontrar 'dias de treino no mês' (divisor da mensalidade).
                            // A preferência é o que está no nome do contrato ex: '3X/semana' -> frequencia * (dias no mes / 7).
                            // Se o plano não tiver Nx/semana, o fallback é a totalidade global de aulas daquela turma na grade geral.
                            let diasDeTreinoNoMes = globalTurmaAulas.get(nomeTurma) || totalAulasGeral;
                            const diasNoMes = new Date(ano, mes, 0).getDate();
                            const nameStr = (m.nameMembership || "").toUpperCase();

                            // Buscar primeiro explicitamente associado ao SLIMFIT ou CIRC (Aulas)
                            // Exemplo 1: "2X SLIMFIT" / "3X CIRC"
                            // Exemplo 2: "SLIMFIT 3X" / "CIRC 2X"
                            // Se não achar nada perto do nome da aula, pegar o genérico (se hover só 1 no texto)
                            let freq = 0;
                            const matchAulaPre = nameStr.match(/(\d+)\s*X\s*(?:SLIM|CIRC|AULA)/);
                            const matchAulaPos = nameStr.match(/(?:SLIM|CIRC|AULA)\s*(\d+)\s*X/);

                            if (matchAulaPre) {
                                freq = parseInt(matchAulaPre[1]);
                            } else if (matchAulaPos) {
                                freq = parseInt(matchAulaPos[1]);
                            } else {
                                // Fallback cego caso seja tipo "PLANO 3X RECORRENTE" (Não cita o nome explicitamente perto do X)
                                const stringXMatches = nameStr.match(/(\d+)\s*X/g);
                                if (stringXMatches && stringXMatches.length > 0) {
                                    for (const x of stringXMatches) freq += parseInt(x.replace(/\D/g, ""));
                                }
                            }

                            if (freq > 0) diasDeTreinoNoMes = Math.round(freq * (diasNoMes / 7));

                            contrib = isFixoEmReposicao ? 0 : contribuicaoFixa(valorMes, percentual, diasDeTreinoNoMes);
                        } else {
                            // Alunas com plano Free só geram a remuneração de R$ 11,00 se estiverem PRESENTES (status === 0 na EVO)
                            if (isPresent) {
                                contrib = CONTRIBUICAO_FREE;
                            } else {
                                // FREE ausente: não aparece na listagem (R$ 0 não faz sentido exibir)
                                continue;
                            }
                        }

                        // Ocultar alunas de reposição da lista final conforme regra de negócio
                        if (isFixoEmReposicao) continue;

                        const finalStatus = statusContrato(m);

                        alunasDoMes.push({
                            idMember: m.idMember,
                            nome: m.name,
                            tipo,
                            statusContrato: finalStatus as any,
                            nomeContrato: m.nameMembership || "Sem Nome",
                            mensalidade: valorMes,
                            pagouNoMes: temPagamentoNoMes(m, mes, ano),
                            contribuicaoPorAula: contrib,
                        });
                    }

                    // Ordenar alfabeticamente
                    alunasDoMes.sort((a, b) => a.nome.localeCompare(b.nome));

                    // Limitar a 9 alunas por turma e calcular dia (sessão)
                    const alunasDiaList = alunasDoMes.slice(0, 9);
                    const isSabado = dataAula.getDay() === 6;

                    const diaCalc = calcularDiaDaSemana({
                        diaDaSemana: diaDesc,
                        totalAulasNoDia: 1, // Exatamente 1 aula nesta sessão
                        alunasCalculadas: alunasDiaList,
                        piso: (percRecord as any)?.piso ?? 55,
                        teto: (percRecord as any)?.teto ?? 90,
                    });

                    // REGRA DO SÁBADO (DIÁRIA GLOBAL)
                    // Se for Sábado, a professora tem garantidos R$ 70,00 naquele dia.
                    // Para que não some 70,00 várias vezes ao dia, o 70 ficará alocado na primeira sessão de Sábado da turma (se houver cruzamento com as turmas passadas).
                    // Para simplificar a exibição: fixamos R$ 0,00 na contribuição por aula do sábado (já que é diária) e criamos uma "Turma Fake" ou anexamos o Teto de 70.
                    if (isSabado) {
                        diaCalc.valorFinalPorAula = 70.0;
                        diaCalc.totalDiaNoMes = 70.0;
                        diaCalc.pisoAplicado = false;
                        diaCalc.tetoAplicado = false;
                        diaCalc.diaDaSemana += " (Diária Fixa Sábado)";
                    } else {
                        diaCalc.totalBrutoPorAula = round2(diaCalc.totalBrutoPorAula);
                        diaCalc.valorFinalPorAula = round2(diaCalc.valorFinalPorAula);
                        diaCalc.totalDiaNoMes = round2(diaCalc.totalDiaNoMes);
                    }

                    diaCalc.alunas = diaCalc.alunas.map((a) => ({
                        ...a,
                        contribuicaoPorAula: round2(a.contribuicaoPorAula),
                    }));

                    diasCalculados.push(diaCalc);
                }

                // Resolver duplicadas do Sábado em várias turmas:
                // Se o professor lecionou mais de 1 turma de Sábado no Mês inteiro, 
                // ele só recebe um "70,00" por DATA de Sábado.
                // Como não sabemos previamente quais turmas ele tem aos sábados (podem ser diferentes) 
                // Essa travessia acontece após processar todas as turmas, ou localmente.
                const totalTurmaNoMes = round2(
                    diasCalculados.reduce((sum, d) => sum + d.totalDiaNoMes, 0)
                );

                turmasCalculadas.push({
                    nomeAtividade: nomeTurma,
                    diasDaSemana: nomesDias,
                    totalAulas: totalAulasGeral,
                    dias: diasCalculados,
                    totalTurmaNoMes, // Este total momentâneo inclui multiplas de sabado. Consertaremos adiante globalmente.
                });
            }

            // APLICAR AS DIÁRIAS COMPARTILHADAS DE SÁBADO
            // O Professor ganha R$ 70 por cada sábado que pisar no estúdio, independente do # de turmas de sábado.
            const sabadosTrabalhados = new Set<string>();
            let deducoesPorDiariaExtraDeSabado = 0;

            for (const t of turmasCalculadas) {
                for (const d of t.dias) {
                    if (d.diaDaSemana.includes("Sábado")) {
                        // Extrai a data no formato DD/MM
                        const match = d.diaDaSemana.match(/(\d{2}\/\d{2})/);
                        if (match) {
                            const dataKey = match[1];
                            if (sabadosTrabalhados.has(dataKey)) {
                                // Se o sábado já rendeu R$ 70,00 nessa ou noutra turma para o mesmo professor, zera essa.
                                deducoesPorDiariaExtraDeSabado += d.totalDiaNoMes; // desconta os 70 aplicados indevidamente
                                d.valorFinalPorAula = 0;
                                d.totalDiaNoMes = 0;
                                d.diaDaSemana = `${d.diaDaSemana.replace(' (Diária Fixa Sábado)', '')} (Diária contada em outra turma)`;
                            } else {
                                sabadosTrabalhados.add(dataKey);
                            }
                        }
                    }
                }
                // Refaz a soma da turma após os zeramentos dos sábados duplicados
                t.totalTurmaNoMes = round2(
                    t.dias.reduce((sum, dia) => sum + dia.totalDiaNoMes, 0)
                );
            }

            const totalGeralNoMes = round2(
                turmasCalculadas.reduce((sum, t) => sum + t.totalTurmaNoMes, 0)
            );

            resultado.push({
                idProfessorEvo: pid,
                nomeProfessor: prof.nomeProfessor,
                percentual,
                turmas: turmasCalculadas,
                totalGeralNoMes,
            });
        }

        // Ordenar por nome do professor
        resultado.sort((a, b) => a.nomeProfessor.localeCompare(b.nomeProfessor));

        return NextResponse.json({ mes, ano, professores: resultado });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

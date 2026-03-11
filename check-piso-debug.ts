import { config } from 'dotenv';
config({ path: 'C:\\AntiGravity\\sf-pagamento\\.env' });
import { CONTRIBUICAO_FREE, aplicarPisoTeto, contribuicaoFixa } from './lib/calculos';

// Simular o que acontece numa sessão de quarta 10h45 com 1 aluna FIXO de plano SLIMFIT 2X
// Contrato: R$569,39 mensal, 20% percentual, 8 aulas no mês (2x/semana × 4 semanas)
const valorMes = 569.39 * 0.97; // 97% do valor
const percentual = 20;
const diasDeTreinoNoMes = 8; // 2x/semana × 4 semanas

const contrib = contribuicaoFixa(valorMes, percentual, diasDeTreinoNoMes);
console.log(`Contribuição FIXO (569.39 * 0.97 = ${(569.39*0.97).toFixed(2)}, 20%, 8 aulas): R$${contrib.toFixed(2)}`);

// Com 1 aluna free
console.log(`Contribuição FREE: R$${CONTRIBUICAO_FREE}`);

// aplicarPisoTeto no valor de 1 aluna fixo:
const resultado1 = aplicarPisoTeto(contrib, 55, 90);
console.log(`aplicarPisoTeto(${contrib.toFixed(2)}, 55, 90): valorFinal=${resultado1.valorFinal}, piso=${resultado1.pisoAplicado}`);

// Simular a aula real de 10h45 na quarta (1 aluna Isabella: plano 2X R$569.39)
// Dias no mês de fevereiro 2026 = 28 dias
// 2x/semana = freq 2, diasDeTreinoNoMes = round(2 * 28/7) = round(8) = 8
const freq2x = Math.round(2 * (28 / 7));
console.log(`freq2x: ${freq2x} aulas/mes`);
const contrib2x = contribuicaoFixa(569.39 * 0.97, 20, freq2x);
console.log(`Contribuição Isabella (2X, R$569.39, 20%, ${freq2x} aulas): R$${contrib2x.toFixed(2)}`);
const r2 = aplicarPisoTeto(contrib2x, 55, 90);
console.log(`Piso aplicado? ${r2.pisoAplicado}, valorFinal: R$${r2.valorFinal}`);

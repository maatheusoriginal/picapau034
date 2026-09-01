/**
 * Confere as regras do campo de número.
 *
 * O defeito relatado: o campo mostrava "0", apagar não tirava o zero, e o
 * valor digitado entrava depois dele — "020" no lugar de 20. Só selecionando
 * tudo dava para corrigir.
 *
 * Rode com: npm run check:number-input
 */
import { clamp, displayValue, formatTyped, isPartialNumber, parseTyped, settleOnBlur } from "../src/number-input";

const casos: Array<[string, unknown, unknown]> = [
  // O campo pode ficar vazio enquanto se digita — é isto que conserta o "020".
  ["campo vazio é estado válido", isPartialNumber(""), true],
  ["número terminado em vírgula é estado válido", isPartialNumber("1,"), true],
  ["número terminado em ponto é estado válido", isPartialNumber("1."), true],
  ["sinal de menos sozinho é estado válido", isPartialNumber("-"), true],
  ["letra não é número", isPartialNumber("abc"), false],
  ["duas vírgulas não é número", isPartialNumber("1,2,3"), false],

  // Leitura do que está escrito
  ["vazio ainda não é número", parseTyped(""), null],
  ["só o sinal ainda não é número", parseTyped("-"), null],
  ["só a vírgula ainda não é número", parseTyped(","), null],
  ["lê inteiro", parseTyped("20"), 20],
  ["lê decimal com vírgula", parseTyped("35,50"), 35.5],
  ["lê decimal com ponto", parseTyped("35.50"), 35.5],
  ["lê negativo", parseTyped("-4"), -4],
  ["espaço em volta não atrapalha", parseTyped(" 12 "), 12],

  // Como aparece escrito: é aqui que o zero à esquerda morre.
  ["20 aparece como 20, não 020", formatTyped(20), "20"],
  ["zero aparece como 0", formatTyped(0), "0"],
  ["decimal mantém a parte decimal", formatTyped(35.5), "35.5"],
  ["sem valor, campo vazio", formatTyped(null), ""],
  ["valor inválido não vira NaN escrito", formatTyped(Number.NaN), ""],

  // Ao sair do campo
  ["sair vazio cai no padrão da tela", settleOnBlur("", 15), 15],
  ["sair vazio num campo de zero dá zero", settleOnBlur("", 0), 0],
  ["sair com o sinal sozinho cai no padrão", settleOnBlur("-", 45), 45],
  ["sair com número mantém o número", settleOnBlur("7", 15), 7],
  ["sair com zero digitado mantém o zero, não o padrão", settleOnBlur("0", 45), 0],

  // Campo que mostra vazio no lugar do zero, para o placeholder "0,00"
  // continuar visível. Antes isto era feito à mão com
  // `value={custo === 0 ? "" : custo}`, que resolvia só a aparência.
  ["zero vira campo vazio quando pedido", displayValue(0, 0), ""],
  ["valor diferente do branco aparece normal", displayValue(12, 0), "12"],
  ["sem branco pedido, o zero aparece escrito", displayValue(0), "0"],

  // Limites declarados no campo
  ["abaixo do mínimo sobe para o mínimo", clamp(-3, 0), 0],
  ["acima do máximo desce para o máximo", clamp(150, 0, 100), 100],
  ["dentro dos limites não muda", clamp(50, 0, 100), 50],
  ["sem limites não muda", clamp(-99), -99],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO campo de número deixa apagar o que está escrito." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

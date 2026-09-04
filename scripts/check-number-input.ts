/**
 * Confere as regras do campo de número.
 *
 * O defeito relatado: o campo mostrava "0", apagar não tirava o zero, e o
 * valor digitado entrava depois dele — "020" no lugar de 20. Só selecionando
 * tudo dava para corrigir.
 *
 * Rode com: npm run check:number-input
 */
import { arredondar, clamp, displayValue, formatTyped, isPartialNumber, parseTyped, settleOnBlur } from "../src/number-input";

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

  // --- Dinheiro e porcentagem com as casas sempre preenchidas ---
  // "5" num campo de dinheiro obriga quem confere a adivinhar se é cinco reais
  // ou cinco centavos, e uma coluna com quantidade de dígitos variável não dá
  // para somar de cabeça.
  ["dinheiro sai com duas casas", formatTyped(2.68, 2), "2,68"],
  ["zero em dinheiro sai 0,00, não 0", formatTyped(0, 2), "0,00"],
  ["número redondo ganha os centavos", formatTyped(5, 2), "5,00"],
  ["a vírgula é a decimal, não o ponto", formatTyped(51.27, 2), "51,27"],
  // (2.675).toFixed(2) devolve "2,67": o double mais próximo de 2,675 é um
  // pouquinho menor. Um centavo por peça, em toda entrada de nota, vira
  // diferença no fechamento que ninguém consegue explicar.
  ["arredonda meio centavo para cima, e não para baixo", formatTyped(2.675, 2), "2,68"],
  ["o mesmo com 1,005", formatTyped(1.005, 2), "1,01"],
  ["e com 8,345", formatTyped(8.345, 2), "8,35"],
  ["negativo arredonda para longe do zero", formatTyped(-2.675, 2), "-2,68"],
  ["arredondar sozinho devolve número", arredondar(2.675, 2), 2.68],
  ["arredondar não estraga o que já estava certo", arredondar(40, 2), 40],
  ["número minúsculo não quebra", arredondar(0.0000001, 2), 0],
  ["negativo mantém o sinal", formatTyped(-3.5, 2), "-3,50"],
  ["sem casas pedidas continua como era", formatTyped(2.68), "2.68"],
  ["zero casas tira a parte decimal", formatTyped(6.4, 0), "6"],
  ["vazio continua vazio", formatTyped(null, 2), ""],
  ["o campo em branco vence as casas", displayValue(0, 0, 2), ""],
  ["sem branco pedido, o zero aparece com centavos", displayValue(0, undefined, 2), "0,00"],

  // O que se digita continua sendo lido com vírgula OU ponto: o balcão digita
  // vírgula, a leitora de XML e o teclado numérico entregam ponto.
  ["digitar com vírgula é lido", parseTyped("2,68"), 2.68],
  ["digitar com ponto também", parseTyped("2.68"), 2.68],
  ["número pela metade com vírgula é estado normal", isPartialNumber("2,"), true],
  ["letra no meio não entra", isPartialNumber("2,6a"), false],
  ["sair de um campo de dinheiro pela metade assenta", settleOnBlur("2,", 0), 2],

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

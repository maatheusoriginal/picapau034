/**
 * Por onde o cupom sai em cada aparelho.
 *
 * O caso que trouxe este arquivo: a oficina mandou imprimir as três vias de
 * uma OS pelo CELULAR e saiu a tela do sistema — menu, botões, a página
 * inteira — em vez do cupom. O Android não imprime a moldura escondida; ele
 * imprime a página de cima.
 */
import { printTarget } from "../src/printing-target";

const casos: Array<[string, unknown, unknown]> = [
  // O computador do balcão continua na moldura escondida: é o que imprime os
  // cupons todo dia, e trocar isso por uma aba que pisca seria estragar o que
  // funciona para consertar o que não funciona em outro lugar.
  ["Windows vai pela moldura", printTarget("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36"), "moldura"],
  ["Mac vai pela moldura", printTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.0.0 Safari/537.36"), "moldura"],
  ["Linux vai pela moldura", printTarget("Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0 Safari/537.36"), "moldura"],

  // O telefone vai pela janela própria — é o defeito que a oficina viu.
  ["Android Chrome vai pela janela", printTarget("Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/140.0.0.0 Mobile Safari/537.36"), "janela"],
  ["Android Firefox também", printTarget("Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0"), "janela"],
  ["iPhone vai pela janela", printTarget("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1"), "janela"],
  ["iPad vai pela janela", printTarget("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1"), "janela"],
  ["Android de tablet, sem 'Mobile', também", printTarget("Mozilla/5.0 (Linux; Android 13; SM-X200) Chrome/140.0.0.0 Safari/537.36"), "janela"],

  // Maiúscula e minúscula não podem decidir o papel de ninguém.
  ["o nome do aparelho não depende de caixa", printTarget("Mozilla/5.0 (Linux; ANDROID 14) Mobile"), "janela"],

  // Sem identificação, fica como sempre foi: o computador é o caso comum, e a
  // moldura não abre aba nenhuma na cara de quem está atendendo.
  ["navegador sem identificação fica na moldura", printTarget(""), "moldura"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : ` — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`}`);
}
if (falhas) { console.error(`\n${falhas} verificação(ões) de impressão falharam.`); process.exit(1); }
console.log(`\n${casos.length} verificações de por onde o cupom sai passaram.`);

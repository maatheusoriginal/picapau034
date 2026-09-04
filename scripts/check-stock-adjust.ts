/**
 * Confere o ajuste de estoque.
 *
 * O que este script protege: sem um caminho de ajuste, quem precisa corrigir
 * uma contagem inventa uma compra que não existiu — e aí o custo médio da peça
 * muda, aparece um fornecedor que ninguém reconhece, e o relatório de compras
 * do mês passa a mentir. O ajuste só serve se o motivo for obrigatório: uma
 * correção anônima é indistinguível de um erro.
 *
 * Rode com: npm run check:stock-adjust
 */
import { ajusteProblema, diferencaDoAjuste, resumoDoAjuste, saldosDoAjuste, textoDoAjuste, valorDoAjuste, type Ajuste } from "../src/stock-adjust";

const json = (value: unknown) => JSON.stringify(value);
const base = (extra: Partial<Ajuste> = {}): Ajuste => ({
  productId: "PRD-001", nome: "ÓLEO 20W50", saldoAtual: 10, contado: 8,
  motivo: "Contagem de prateleira", custoUnitario: 25, ...extra,
});

const casos: Array<[string, unknown, unknown]> = [
  // --- A diferença ---
  ["contar menos do que tinha tira do estoque", diferencaDoAjuste(base()), -2],
  ["contar mais do que tinha acrescenta", diferencaDoAjuste(base({ contado: 14 })), 4],
  ["contar igual não mexe", diferencaDoAjuste(base({ contado: 10 })), 0],
  ["saldo inicial de estoque zerado", diferencaDoAjuste(base({ saldoAtual: 0, contado: 6 })), 6],
  ["fração é arredondada: peça não se conta pela metade", diferencaDoAjuste(base({ contado: 8.4 })), -2],

  // --- O que impede gravar ---
  ["ajuste completo pode gravar", ajusteProblema(base()), ""],
  ["sem peça escolhida não grava", ajusteProblema(base({ productId: "" })), "Escolha a peça que vai ser ajustada."],
  // Gravar um ajuste que não muda nada só enche o histórico da peça de linhas
  // que não explicam nada.
  ["contado igual ao saldo é recusado", /não há o que ajustar/.test(ajusteProblema(base({ contado: 10 }))), true],
  ["quantidade negativa é recusada", /não pode ser negativa/.test(ajusteProblema(base({ contado: -1 }))), true],
  ["sem motivo não grava", ajusteProblema(base({ motivo: "" })), "Escolha o motivo do ajuste."],
  // "Correção de lançamento" é a saída fácil de quem não quer explicar.
  ["correção de lançamento exige dizer qual",
    /qual lançamento/.test(ajusteProblema(base({ motivo: "Correção de lançamento" }))), true],
  ["com a observação, a correção passa",
    ajusteProblema(base({ motivo: "Correção de lançamento", observacao: "Entrada ENT-0003 lançada em dobro" })), ""],
  ["observação só de espaços não vale",
    /qual lançamento/.test(ajusteProblema(base({ motivo: "Correção de lançamento", observacao: "   " }))), true],
  ["os outros motivos não exigem observação", ajusteProblema(base({ motivo: "Perda, quebra ou vencimento" })), ""],

  // --- O impacto em dinheiro ---
  ["perder 2 peças de R$ 25 tira R$ 50 do estoque", valorDoAjuste(base()), -50],
  ["achar 4 peças de R$ 25 põe R$ 100", valorDoAjuste(base({ contado: 14 })), 100],
  ["sem custo cadastrado o impacto é zero", valorDoAjuste(base({ custoUnitario: undefined })), 0],

  // --- Como aparece no histórico ---
  ["a saída aparece com o sinal e o motivo", textoDoAjuste(base()), "-2 un. · Contagem de prateleira"],
  ["a entrada aparece com o mais", textoDoAjuste(base({ contado: 12 })), "+2 un. · Contagem de prateleira"],
  ["a observação entra no texto",
    textoDoAjuste(base({ motivo: "Perda, quebra ou vencimento", observacao: "CAIU DA BANCADA" })),
    "-2 un. · Perda, quebra ou vencimento · CAIU DA BANCADA"],

  // --- O resumo antes de confirmar ---
  ["o resumo soma as linhas que mexem no saldo",
    json(resumoDoAjuste([base(), base({ productId: "PRD-002", contado: 15 }), base({ productId: "PRD-003", contado: 10 })])),
    json({ itens: 2, entram: 5, saem: 2, valor: 75 })],
  ["lista vazia dá resumo zerado", json(resumoDoAjuste([])), json({ itens: 0, entram: 0, saem: 0, valor: 0 })],
  ["linha sem peça não soma nada", resumoDoAjuste([base({ productId: "" })]).itens, 0],
  ["contagem negativa não soma nada", resumoDoAjuste([base({ contado: -1 })]).itens, 0],
  // O motivo vale para o lote e é escolhido por último: se ele apagasse o
  // resumo, quem contasse a prateleira leria "Impacto R$ 0,00" e acharia que a
  // contagem não entrou.
  ["o resumo não espera o motivo para mostrar o impacto",
    json(resumoDoAjuste([base({ motivo: "" })])),
    json({ itens: 1, entram: 0, saem: 2, valor: -50 })],
  ["\"Correção de lançamento\" sem observação ainda aparece no resumo",
    resumoDoAjuste([base({ motivo: "Correção de lançamento" })]).itens, 1],
  ["mas ela continua barrada na hora de gravar",
    ajusteProblema(base({ motivo: "Correção de lançamento" })),
    "Diga qual lançamento está sendo corrigido."],
  ["e nada de inválido chega ao banco", saldosDoAjuste([base({ motivo: "" })]).length, 0],

  // --- O que vai para o banco ---
  ["os saldos saem no formato do estoque",
    json(saldosDoAjuste([base(), base({ productId: "PRD-002", contado: 15 })])),
    json([{ productId: "PRD-001", delta: -2 }, { productId: "PRD-002", delta: 5 }])],
  ["linha inválida não vira gravação", saldosDoAjuste([base({ contado: 10 })]).length, 0],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nO ajuste de estoque está certo." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere as contas de estoque e precificação.
 *
 * Assim como o check-finance, não é uma suíte de testes: é a verificação do que
 * decide preço de venda e custo de peça, onde um erro passa despercebido por
 * meses e some no lucro.
 *
 * Rode com: npm run check:inventory
 */
import { costAfterEntry, markupFromPrice, mergeParts, priceFromMarkup, shouldReserveStock, stockDeltas, toAmount, weightedAverageCost } from "../src/inventory";
import { serviceOrderStatuses } from "../src/types";

const st = serviceOrderStatuses;
const json = (value: unknown) => JSON.stringify(value);

const casos: Array<[string, unknown, unknown]> = [
  // Preço a partir do markup
  ["markup de 45% sobre R$ 100", priceFromMarkup(100, 45), 145],
  ["markup de 0% mantém o custo", priceFromMarkup(80, 0), 80],
  ["markup sobre custo zero não inventa preço", priceFromMarkup(0, 45), 0],
  ["markup com centavos arredonda em 2 casas", priceFromMarkup(33.33, 45), 48.33],

  // Markup a partir do preço
  ["preço R$ 145 sobre custo R$ 100 é 45%", markupFromPrice(100, 145), 45],
  ["preço igual ao custo é markup zero", markupFromPrice(100, 100), 0],
  ["custo zero não vira divisão por zero", markupFromPrice(0, 50), 0],

  // Custo médio ponderado
  ["10 a R$ 10 + 10 a R$ 20 = R$ 15", weightedAverageCost(10, 10, 10, 20), 15],
  ["estoque zerado assume o custo da entrada", weightedAverageCost(0, 10, 5, 30), 30],
  ["entrada zero mantém o custo atual", weightedAverageCost(10, 10, 0, 99), 10],
  ["peso maior puxa a média para o lote grande", weightedAverageCost(1, 10, 99, 20), 19.9],
  ["estoque negativo não inverte a média", weightedAverageCost(-5, 10, 10, 20), 20],

  // Custo médio ligado x desligado
  ["com custo médio, pondera", costAfterEntry(true, 10, 10, 10, 20), 15],
  ["sem custo médio, vale o último preço pago", costAfterEntry(false, 10, 10, 10, 20), 20],
  ["sem entrada, o custo não muda nos dois modos", costAfterEntry(false, 10, 10, 0, 99), 10],

  // Leitura de valores gravados. O cadastro de produto grava o custo como texto
  // em reais, e a entrada de estoque precisa devolvê-lo no mesmo formato — se
  // um dos dois gravar número, quem lê com parseBRL quebra.
  ["ida e volta pelo formato gravado", toAmount((15).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })), 15],
  ["ida e volta com milhar", toAmount((1234.56).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })), 1234.56],
  ["lê o custo gravado como moeda brasileira", toAmount("R$ 1.234,56"), 1234.56],
  ["lê o custo gravado como número", toAmount(12.5), 12.5],
  ["texto vazio vira zero", toAmount(""), 0],
  ["texto inválido vira zero", toAmount("abc"), 0],
  // Reserva de peça pela OS
  ["primeira baixa tira tudo do estoque", json(stockDeltas([{ productId: "p1", quantity: 2 }], [])), json([{ productId: "p1", quantity: 2 }])],
  ["salvar de novo sem mudar nada não baixa outra vez", json(stockDeltas([{ productId: "p1", quantity: 2 }], [{ productId: "p1", quantity: 2 }])), json([])],
  ["aumentar a quantidade baixa só a diferença", json(stockDeltas([{ productId: "p1", quantity: 5 }], [{ productId: "p1", quantity: 2 }])), json([{ productId: "p1", quantity: 3 }])],
  ["reduzir a quantidade devolve a diferença", json(stockDeltas([{ productId: "p1", quantity: 1 }], [{ productId: "p1", quantity: 4 }])), json([{ productId: "p1", quantity: -3 }])],
  ["tirar a peça da OS devolve tudo", json(stockDeltas([], [{ productId: "p1", quantity: 3 }])), json([{ productId: "p1", quantity: -3 }])],
  ["duas linhas do mesmo produto viram uma", json(mergeParts([{ productId: "p1", quantity: 2 }, { productId: "p1", quantity: 3 }])), json([{ productId: "p1", quantity: 5 }])],
  ["item sem produto vinculado é ignorado", json(mergeParts([{ productId: "", quantity: 9 }])), json([])],

  // Momento da baixa
  ["com a trava ligada, orçamento não reserva", shouldReserveStock("Avaliação", true, st), false],
  ["com a trava ligada, aprovação ainda não reserva", shouldReserveStock("Aprovação", true, st), false],
  ["com a trava ligada, serviço iniciado reserva", shouldReserveStock("Em serviço", true, st), true],
  ["com a trava ligada, entrega segue reservada", shouldReserveStock("Entrega", true, st), true],
  ["com a trava desligada, a recepção já reserva", shouldReserveStock("Recepção", false, st), true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nTodas as contas batem." : `\n${falhas} conta(s) erradas.`);
process.exit(falhas === 0 ? 0 : 1);

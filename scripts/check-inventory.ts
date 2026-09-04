/**
 * Confere as contas de estoque e precificação.
 *
 * Assim como o check-finance, não é uma suíte de testes: é a verificação do que
 * decide preço de venda e custo de peça, onde um erro passa despercebido por
 * meses e some no lucro.
 *
 * Rode com: npm run check:inventory
 */
import { costAfterEntry, markupFromPrice, mergeParts, movementTotals, priceFromMarkup, productMovements, shouldReserveStock, stockDeltas, toAmount, weightedAverageCost } from "../src/inventory";
import { serviceOrderStatuses } from "../src/types";

const st = serviceOrderStatuses;
const json = (value: unknown) => JSON.stringify(value);

const fontes = {
  stockEntries: [
    { id: "ENT-0001", date: "01/03/2026", entryAt: "2026-03-01T10:00:00.000Z", supplierName: "Distribuidora XYZ",
      items: [{ productId: "PRD-001", quantity: 10, unitCost: 40, total: 400 }, { productId: "PRD-002", quantity: 5, unitCost: 10, total: 50 }] },
  ],
  sales: [
    { id: "VEN-0002", date: "05/03/2026", soldAt: "2026-03-05T14:00:00.000Z", origin: "PDV", customer: "Rayane",
      items: [{ productId: "PRD-001", quantity: 2, price: 120, name: "Óleo" }] },
    { id: "VEN-0009", date: "06/03/2026", soldAt: "2026-03-06T09:00:00.000Z", origin: "PDV", customer: "Outro",
      items: [{ productId: "PRD-002", quantity: 1, price: 30, name: "Outra peça" }] },
  ],
  orders: [
    // Encerrada e com baixa registrada: entra no histórico.
    { id: "OS-0001", customer: "João", closedAt: "03/03/2026",
      deductedItems: [{ productId: "PRD-001", quantity: 3 }],
      items: [{ productId: "PRD-001", quantity: 3, price: 180 }] },
    // Ainda em orçamento: lista a peça mas não baixou nada.
    { id: "OS-0002", customer: "Ana", time: "07/03 09:00",
      deductedItems: [],
      items: [{ productId: "PRD-001", quantity: 1, price: 60 }] },
  ],
  adjustments: [
    // Conferência de prateleira: faltaram 4 unidades de R$ 40.
    { id: "AJU-0001", date: "08/03/2026", adjustedAt: "2026-03-08T18:00:00.000Z",
      motivo: "Perda, quebra ou vencimento", observacao: "CAIU DA BANCADA",
      items: [{ productId: "PRD-001", diferenca: -4, custoUnitario: 40 },
              { productId: "PRD-002", diferenca: 2, custoUnitario: 10 }] },
    // Conferência que não mudou nada nesta peça: não é movimentação.
    { id: "AJU-0002", date: "09/03/2026", adjustedAt: "2026-03-09T18:00:00.000Z", motivo: "Contagem de prateleira",
      items: [{ productId: "PRD-001", diferenca: 0, custoUnitario: 40 }] },
  ],
};
const mov = productMovements("PRD-001", fontes);
const totais = movementTotals(mov);

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
  // --- Histórico de movimentação da peça ---
  ["a peça mostra entradas, saídas e conferências", mov.length, 4],
  ["a mais recente vem primeiro", mov[0]!.documentId, "AJU-0001"],
  ["a compra entra com quantidade positiva", mov.find((m) => m.documentId === "ENT-0001")!.quantity, 10],
  ["a venda sai com quantidade negativa", mov.find((m) => m.documentId === "VEN-0002")!.quantity, -2],
  ["a OS aparece pelo que baixou de verdade", mov.find((m) => m.documentId === "OS-0001")!.quantity, -3],
  ["OS ainda em orçamento não aparece", mov.some((m) => m.documentId === "OS-0002"), false],
  ["venda de outra peça não entra no histórico", mov.some((m) => m.documentId === "VEN-0009"), false],
  ["o unitário da venda sai do preço da linha", mov.find((m) => m.documentId === "VEN-0002")!.unitValue, 60],
  ["peça sem id não devolve histórico", productMovements("", fontes).length, 0],
  ["total que entrou", totais.inboundQuantity, 10],
  ["total que saiu", totais.outboundQuantity, 5],
  ["valor comprado", totais.inboundValue, 400],

  // --- O ajuste de estoque no histórico da peça ---
  // O saldo mudava de 42 para 38 e o cadastro do produto não dizia por quê.
  ["a conferência aparece no histórico da peça", mov.some((m) => m.kind === "Ajuste de estoque"), true],
  ["com a quantidade que faltou", mov.find((m) => m.documentId === "AJU-0001")!.quantity, -4],
  ["e o motivo escrito junto", mov.find((m) => m.documentId === "AJU-0001")!.detail, "Perda, quebra ou vencimento · CAIU DA BANCADA"],
  ["valendo o custo da peça", mov.find((m) => m.documentId === "AJU-0001")!.total, -160],
  ["conferência de outra peça não entra", mov.some((m) => m.documentId === "AJU-0001" && m.quantity === 2), false],
  ["conferência que não mudou nada não vira linha", mov.some((m) => m.documentId === "AJU-0002"), false],
  // O "saiu" responde quanto se vendeu desta peça: uma quebra somada ali
  // transformaria perda em faturamento.
  ["a quebra não entra no que saiu em vendas", totais.outboundQuantity, 5],
  ["nem no valor vendido", totais.outboundValue, 300],
  ["ela tem o próprio saldo", totais.adjustedQuantity, -4],
  ["e o próprio valor", totais.adjustedValue, -160],
  ["contando quantas conferências mexeram nesta peça", totais.adjustedCount, 1],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nTodas as contas batem." : `\n${falhas} conta(s) erradas.`);
process.exit(falhas === 0 ? 0 : 1);

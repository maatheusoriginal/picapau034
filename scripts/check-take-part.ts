/**
 * Confere o "pegar peça" do mecânico.
 *
 * O que está sendo testado é o que dói na oficina quando dá errado: peça
 * cobrada em dobro do cliente, saldo baixado errado, e lançamento numa OS que
 * já foi encerrada — que é dinheiro que ninguém cobra mais.
 *
 * Rode com: npm run check:take-part
 */
import {
  acharPecas, itemDaPeca, itensDepoisDePegar, osQuePodemReceber, problemasDoPedido,
  rotuloDaOS, textoDoLancamento, totalDepoisDePegar,
} from "../src/take-part";
import type { OrderRecord, ProductRecord } from "../src/types";

// Atenção: no cadastro, `price` e `cost` são TEXTO no formato brasileiro
// ("1.234,56"), não número — é o que a tela grava. Por isso o item da OS passa
// por `toAmount`, e é isso que este roteiro precisa exercitar de verdade.
const peca = (extra: Partial<ProductRecord>): ProductRecord => ({
  id: "PRD-1", code: "P001", name: "Retentor de roda", price: "40,00", cost: "25,00", stock: 5,
  category: "Peças", unit: "UN", active: true, ...extra,
} as ProductRecord);

const retentor = peca({});
const relacao = peca({ id: "PRD-2", code: "P002", name: "Kit relação Honda CG", price: "1.180,00", cost: "120,00", stock: 2, barcode: "7891234567890" });
const semSaldo = peca({ id: "PRD-3", code: "P003", name: "Vela de ignição", stock: 0 });
const catalogo = [retentor, relacao, semSaldo];

const aberta: OrderRecord = {
  id: "OS-0010", customer: "Rayane", bike: "Honda CG 160", plate: "ABC-1234",
  mechanic: "Ronaldo", mechanicIds: ["F1"], time: "09/09/2026, 08:00",
  status: "Em serviço", tone: "amber", items: [], total: 0,
};
const comRetentor: OrderRecord = { ...aberta, id: "OS-0011", items: [itemDaPeca(retentor, 1)], total: 40 };
const encerrada: OrderRecord = { ...aberta, id: "OS-0009", closed: true };
const antiga: OrderRecord = { ...aberta, id: "OS-0001", closed: true, backfilled: true };

const casos: Array<[string, unknown, unknown]> = [
  // --- Achar a peça ---
  ["acha pelo nome", acharPecas(catalogo, "retentor").map((p) => p.id).join(), "PRD-1"],
  ["acha pelo código", acharPecas(catalogo, "P002").map((p) => p.id).join(), "PRD-2"],
  // O leitor digita o código e dá Enter: a peça certa tem de ser a primeira,
  // senão o mecânico escolhe a errada sem olhar.
  ["código de barras bipado ganha de tudo", acharPecas(catalogo, "7891234567890")[0]?.id, "PRD-2"],
  ["busca vazia não lista nada", acharPecas(catalogo, "  ").length, 0],
  ["peça desativada não aparece", acharPecas([...catalogo, peca({ id: "PRD-9", name: "Retentor velho", active: false })], "retentor").length, 1],
  ["peça sem saldo continua aparecendo", acharPecas(catalogo, "vela").length, 1],

  // --- Escolher a OS ---
  ["só OS aberta pode receber peça", osQuePodemReceber([aberta, encerrada]).map((o) => o.id).join(), "OS-0010"],
  // OS lançada só para o histórico é serviço que já terminou meses atrás:
  // pegar peça para ela baixaria o estoque de hoje por uma moto que já saiu.
  ["OS antiga de histórico fica fora", osQuePodemReceber([aberta, antiga]).map((o) => o.id).join(), "OS-0010"],
  ["a mais recente vem primeiro", osQuePodemReceber([aberta, { ...aberta, id: "OS-0020" }])[0]?.id, "OS-0020"],
  ["o rótulo começa pela placa, que é como se procura a moto",
    rotuloDaOS(aberta), "OS-0010 · ABC-1234 · Honda CG 160 · Rayane"],
  ["moto sem placa não vira texto vazio", rotuloDaOS({ ...aberta, plate: "" }).includes("sem placa"), true],

  // --- O que impede de lançar ---
  ["pedido completo não reclama", problemasDoPedido({ peca: retentor, quantidade: 2, ordem: aberta }).length, 0],
  ["sem peça, reclama", problemasDoPedido({ peca: null, quantidade: 1, ordem: aberta }).length, 1],
  ["sem OS, reclama", problemasDoPedido({ peca: retentor, quantidade: 1, ordem: null }).length, 1],
  ["quantidade zero, reclama", problemasDoPedido({ peca: retentor, quantidade: 0, ordem: aberta }).length, 1],
  ["quantidade negativa, reclama", problemasDoPedido({ peca: retentor, quantidade: -2, ordem: aberta }).length, 1],
  ["meia peça não existe", problemasDoPedido({ peca: retentor, quantidade: 1.5, ordem: aberta }).length, 1],
  ["mais do que tem em estoque, reclama",
    problemasDoPedido({ peca: relacao, quantidade: 3, ordem: aberta })[0], "Só há 2 em estoque de Kit relação Honda CG."],
  // Algumas oficinas preferem deixar passar: a peça saiu de verdade, e negar o
  // lançamento faz o estoque mentir mais do que o saldo negativo.
  ["com a trava desligada, passa mesmo sem saldo",
    problemasDoPedido({ peca: relacao, quantidade: 3, ordem: aberta }, false).length, 0],
  ["OS encerrada é recusada", problemasDoPedido({ peca: retentor, quantidade: 1, ordem: encerrada }).length, 1],
  ["reclama de tudo de uma vez", problemasDoPedido({ peca: null, quantidade: 0, ordem: null }).length, 3],

  // --- O item que entra na OS ---
  // `price` é o TOTAL da linha, não o unitário: é o formato que o histórico e
  // a impressão já usam.
  ["o preço da linha é o total", itemDaPeca(retentor, 3).price, 120],
  // "1.180,00" tem de virar 1180, e não 1,18 nem NaN: o ponto é separador de
  // milhar no Brasil, e é assim que o cadastro grava.
  ["preço brasileiro com milhar não vira centavo", itemDaPeca(relacao, 2).price, 2360],
  ["o custo da linha também", itemDaPeca(retentor, 3).cost, 75],
  ["guarda a quantidade", itemDaPeca(retentor, 3).quantity, 3],
  ["guarda o produto, para a baixa saber em qual peça mexer", itemDaPeca(retentor, 1).productId, "PRD-1"],
  ["entra como peça, não como mão de obra", itemDaPeca(retentor, 1).type, "Peça"],

  // --- A mesma peça duas vezes ---
  // Duas linhas de "retentor 1x" na mesma OS é o que faz o cliente perguntar
  // se está sendo cobrado em dobro.
  ["peça nova cria uma linha", itensDepoisDePegar(aberta, retentor, 2).length, 1],
  ["a mesma peça de novo NÃO cria segunda linha", itensDepoisDePegar(comRetentor, retentor, 2).length, 1],
  ["ela soma na linha que já existe", itensDepoisDePegar(comRetentor, retentor, 2)[0].quantity, 3],
  ["e o valor da linha acompanha", itensDepoisDePegar(comRetentor, retentor, 2)[0].price, 120],
  ["peça diferente cria linha nova", itensDepoisDePegar(comRetentor, relacao, 1).length, 2],
  ["mão de obra que já estava na OS não é tocada",
    itensDepoisDePegar({ ...aberta, items: [{ id: "S1", type: "Mão de obra", name: "Troca", price: 90 }] }, retentor, 1).length, 2],

  // --- O total ---
  ["o total soma peça e mão de obra",
    totalDepoisDePegar(itensDepoisDePegar({ ...aberta, items: [{ id: "S1", type: "Mão de obra", name: "Troca", price: 90 }] }, retentor, 2)), 170],

  // --- O aviso na tela ---
  ["a frase diz a peça, a OS e o saldo que sobrou",
    textoDoLancamento(retentor, 2, aberta), "2x Retentor de roda lançada na OS-0010 (ABC-1234). Saldo agora: 3."],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nA peça sai da prateleira e entra na OS certa." : `\n${falhas} caso(s) errados.`);
if (falhas) process.exit(1);

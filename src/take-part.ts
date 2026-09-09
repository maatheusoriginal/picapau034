/**
 * "Pegar peça": o mecânico tira a peça da prateleira e diz para qual OS foi.
 *
 * É o movimento mais comum da oficina e o que menos era registrado. O mecânico
 * está com a moto na bancada, precisa de um retentor, vai na prateleira e pega.
 * Se o lançamento só pode ser feito depois, pelo balcão, abrindo a OS e
 * editando os itens, ele não é feito: no fim do mês o estoque não bate, a peça
 * não foi cobrada do cliente, e ninguém sabe em qual moto ela entrou.
 *
 * Por isso a operação é uma só e completa: escolher a peça, a quantidade e a
 * OS. Ela acrescenta o item à ordem e baixa o saldo no mesmo movimento.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-take-part.ts).
 */
import type { OrderRecord, ProductRecord, ServiceOrderItem } from "./types";
import { toAmount } from "./inventory";
import { matchesSearch } from "./workspace";

/** As peças que respondem ao que foi digitado ou bipado. */
export function acharPecas(products: ProductRecord[], busca: string, limite = 8): ProductRecord[] {
  const termo = busca.trim();
  if (!termo) return [];
  // Código de barras bipado tem de ganhar de tudo: o leitor digita e dá Enter,
  // e a peça certa precisa ser a primeira, não a sexta da lista.
  const exata = products.filter((peca) => [peca.barcode, peca.code, peca.partNumber]
    .some((campo) => String(campo ?? "").trim() !== "" && String(campo ?? "").trim() === termo));
  if (exata.length) return exata.slice(0, limite);
  return products
    .filter((peca) => peca.active !== false)
    .filter((peca) => matchesSearch(termo, peca.name, peca.code, peca.barcode, peca.partNumber))
    .slice(0, limite);
}

/** As OS que podem receber peça: abertas, da mais recente para a mais antiga. */
export function osQuePodemReceber(orders: OrderRecord[]): OrderRecord[] {
  return orders.filter((order) => !order.closed && !order.backfilled)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

/** Como a OS aparece na hora de escolher: placa primeiro, que é como se procura a moto. */
export function rotuloDaOS(order: OrderRecord): string {
  const partes = [order.plate || "sem placa", order.bike, order.customer].map((p) => String(p ?? "").trim()).filter(Boolean);
  return `${order.id} · ${partes.join(" · ")}`;
}

export type PedidoDePeca = {
  peca: ProductRecord | null;
  quantidade: number;
  ordem: OrderRecord | null;
};

/**
 * O que impede de lançar, tudo de uma vez.
 *
 * `bloquearSemSaldo` acompanha a configuração da oficina: com ela ligada, tirar
 * mais do que existe é recusado; desligada, passa e o saldo fica negativo — que
 * é o que algumas oficinas preferem, porque a peça saiu de verdade e negar o
 * lançamento só faz o estoque mentir mais.
 */
export function problemasDoPedido(pedido: PedidoDePeca, bloquearSemSaldo = true): string[] {
  const problemas: string[] = [];
  if (!pedido.peca) problemas.push("Escolha a peça que saiu do estoque.");
  if (!pedido.ordem) problemas.push("Escolha para qual OS a peça foi.");
  const quantidade = Number(pedido.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) problemas.push("A quantidade precisa ser maior que zero.");
  else if (!Number.isInteger(quantidade)) problemas.push("A quantidade precisa ser um número inteiro de peças.");
  else if (pedido.peca && bloquearSemSaldo) {
    const saldo = Number(pedido.peca.stock ?? 0);
    if (quantidade > saldo) problemas.push(`Só há ${saldo} em estoque de ${pedido.peca.name}.`);
  }
  if (pedido.ordem?.closed) problemas.push("Esta OS já foi encerrada. Escolha outra.");
  return problemas;
}

/**
 * O item que entra na OS.
 *
 * `price` é o TOTAL da linha, não o unitário — é o formato que o resto do
 * sistema já usa, e trocar isso quebraria o histórico e a impressão.
 */
export function itemDaPeca(peca: ProductRecord, quantidade: number): ServiceOrderItem {
  const unitario = toAmount(peca.price);
  return {
    id: peca.code || peca.id,
    type: "Peça",
    name: peca.name,
    price: Number((unitario * quantidade).toFixed(2)),
    quantity: quantidade,
    cost: Number((toAmount(peca.cost) * quantidade).toFixed(2)),
    productId: peca.id,
  };
}

/**
 * Os itens da OS depois de pegar a peça.
 *
 * A mesma peça pegada duas vezes SOMA na linha que já existe, em vez de criar
 * uma segunda: duas linhas de "retentor 1x" na mesma OS é o tipo de coisa que
 * faz o cliente perguntar se está sendo cobrado em dobro.
 */
export function itensDepoisDePegar(order: OrderRecord, peca: ProductRecord, quantidade: number): ServiceOrderItem[] {
  const atuais = [...(order.items ?? [])];
  const indice = atuais.findIndex((item) => item.type === "Peça" && item.productId === peca.id);
  if (indice < 0) return [...atuais, itemDaPeca(peca, quantidade)];
  const existente = atuais[indice];
  const somada = (existente.quantity ?? 1) + quantidade;
  atuais[indice] = itemDaPeca(peca, somada);
  return atuais;
}

/** O total da OS depois da peça entrar. */
export function totalDepoisDePegar(itens: ServiceOrderItem[]): number {
  return Number(itens.reduce((soma, item) => soma + toAmount(item.price), 0).toFixed(2));
}

/** A frase que confirma o que aconteceu, com os dois números que importam. */
export function textoDoLancamento(peca: ProductRecord, quantidade: number, order: OrderRecord): string {
  const saldo = Number(peca.stock ?? 0) - quantidade;
  return `${quantidade}x ${peca.name} lançada na ${order.id} (${order.plate || "sem placa"}). Saldo agora: ${saldo}.`;
}

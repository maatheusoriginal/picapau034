/**
 * Reimprimir OS: achar pela placa, e o lote de quem está devendo.
 *
 * Dois pedidos do balcão, com a mesma raiz: o papel de uma OS que JÁ TERMINOU
 * precisa sair de novo, e procurar a OS no meio da fila da oficina não é o
 * caminho. Uma via rasgou na gaveta, o cliente perdeu a dele, a empresa pediu
 * o comprovante de um serviço do mês passado.
 *
 * - Uma OS: digita a placa e escolhe a via.
 * - Um lote: escolhe a pessoa e sai UMA via de cada OS que ela ainda deve. É
 *   a conferência da fatura, feita no papel, na frente de quem vai pagar.
 *
 * Aqui ficam só as contas e as escolhas. Quem monta o papel é o
 * src/documents.ts, e quem imprime é o app/printing.ts.
 */
import type { AccountRecord, OrderRecord } from "./types";
import { accountOpen, isCreditPayment } from "./finance";
import { matchesSearch } from "./workspace";

/**
 * Esta OS ainda está devendo?
 *
 * A resposta boa vem da CONTA A RECEBER que a OS gerou ao ser encerrada: é
 * ela que sabe se o dinheiro entrou, inclusive quando entrou em pedaços. O
 * `sourceId` da conta é o número da OS.
 *
 * Quando não há conta nenhuma ligada à OS, a forma de pagamento decide. São
 * dois casos, e os dois importam:
 *
 * - quem não pode ver o financeiro não recebe as contas do banco, e mesmo
 *   assim precisa imprimir o lote;
 * - a conta pode ter falhado ao ser criada no encerramento (o sistema avisa e
 *   pede para lançar à mão). Nesse caso a OS a prazo está devendo mesmo, e
 *   dizer que está paga seria o erro caro.
 *
 * OS paga em dinheiro nunca gera conta e nunca é a prazo: sai como paga pelos
 * dois caminhos.
 */
export function orderIsUnpaid(order: OrderRecord, accounts: AccountRecord[] = []): boolean {
  const daOS = accounts.filter((conta) => conta.kind === "receber" && conta.sourceId === order.id);
  if (daOS.length) return daOS.some((conta) => accountOpen(conta) > 0);
  return isCreditPayment(order.paymentMethod);
}

/** As OS já entregues, da mais recente para a mais antiga. */
export function finishedOrders(orders: OrderRecord[]): OrderRecord[] {
  return [...orders]
    .filter((order) => order.closed === true)
    .sort((uma, outra) => quando(outra) - quando(uma));
}

/**
 * O instante em que a OS foi encerrada, para ordenar.
 *
 * Sem data válida vai para o fim: registro incompleto não é registro recente.
 */
function quando(order: OrderRecord): number {
  const marca = Date.parse(String(order.closedAtISO ?? ""));
  return Number.isNaN(marca) ? -Infinity : marca;
}

/**
 * A busca da reimpressão.
 *
 * Procura por placa, número da OS, cliente, moto e empresa parceira — porque é
 * assim que a oficina lembra: "a Biz prata", "a OS da Maria", "ABC1D23". A
 * placa entra com ou sem hífen (ver `matchesSearch`).
 *
 * Busca vazia devolve as últimas entregues em vez de nada: abrir a janela e
 * já ver as de hoje é o caso mais comum, e evita digitar para descobrir que a
 * OS de ontem está ali.
 */
export function searchOrdersToReprint(orders: OrderRecord[], query: string, limite = 30): OrderRecord[] {
  const procurado = String(query ?? "").trim();
  const entregues = finishedOrders(orders);
  if (!procurado) return entregues.slice(0, limite);
  // Com busca, a OS aberta também aparece: quem procura uma placa quer aquela
  // moto, e não uma aula sobre em que etapa ela está.
  const todas = [...entregues, ...orders.filter((order) => order.closed !== true)];
  return todas
    .filter((order) => matchesSearch(procurado, order.id, order.plate, order.customer, order.bike, order.partnerName, order.partnerOrderId))
    .slice(0, limite);
}

/** Quem paga esta OS: a empresa parceira, quando há, senão o dono da moto. */
export function payerOf(order: OrderRecord): { key: string; name: string } {
  const empresa = String(order.partnerName ?? "").trim();
  if (empresa) return { key: `parceira:${order.partnerId || empresa.toLocaleUpperCase("pt-BR")}`, name: empresa };
  const cliente = String(order.customer ?? "").trim();
  const nome = cliente || "Cliente não identificado";
  return { key: `cliente:${order.clientId || nome.toLocaleUpperCase("pt-BR")}`, name: nome };
}

export type ReprintBatch = {
  /** Como a pessoa é identificada, para a tela escolher sem confundir homônimo. */
  key: string;
  name: string;
  /** As OS entregues e ainda não pagas, da mais recente para a mais antiga. */
  orders: OrderRecord[];
  /** Quanto essas OS somam. É o que a pessoa deve por serviço. */
  total: number;
};

/**
 * Quem está devendo, e o que cada um deve.
 *
 * Só entra quem tem OS ENTREGUE e NÃO PAGA: é para isso que o lote serve. A
 * lista vem do maior devedor para o menor, porque é nessa ordem que a
 * conversa acontece.
 *
 * A empresa parceira e o dono da moto são pessoas diferentes aqui: na OS
 * faturada quem deve é a empresa, e imprimir no nome do motoboy que trouxe a
 * moto faria a conferência da fatura não fechar.
 */
export function peopleWithUnpaidOrders(orders: OrderRecord[], accounts: AccountRecord[] = []): ReprintBatch[] {
  const porPessoa = new Map<string, ReprintBatch>();
  for (const order of finishedOrders(orders)) {
    if (!orderIsUnpaid(order, accounts)) continue;
    const { key, name } = payerOf(order);
    const atual = porPessoa.get(key) ?? { key, name, orders: [], total: 0 };
    atual.orders.push(order);
    atual.total = Math.round((atual.total + (Number(order.total) || 0)) * 100) / 100;
    porPessoa.set(key, atual);
  }
  return [...porPessoa.values()].sort((um, outro) => outro.total - um.total || um.name.localeCompare(outro.name, "pt-BR"));
}

/** As OS do lote de uma pessoa. Vazio quando ela não deve nada. */
export function batchFor(orders: OrderRecord[], accounts: AccountRecord[], key: string): OrderRecord[] {
  return peopleWithUnpaidOrders(orders, accounts).find((pessoa) => pessoa.key === key)?.orders ?? [];
}

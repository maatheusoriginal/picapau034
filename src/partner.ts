/**
 * Empresa parceira: quem paga a OS é a empresa, e no começo do mês.
 *
 * A oficina atende frotas — aplicativo de entrega, locadora, transportadora. A
 * moto entra, a peça sai do estoque e o serviço é feito no dia; o dinheiro só
 * vem na fatura do mês seguinte. Tratar isso como venda à vista mentia duas
 * vezes: dizia que entrou dinheiro que não entrou, e o caixa do dia fechava
 * com quebra.
 *
 * Aqui ficam só as contas. Quem grava é o app/page.tsx.
 */
import type { OrderRecord, PartnerConfig, ServiceOrderItem } from "./types";
import { PARTNER_PAYMENT_METHOD, round2 } from "./finance";

/**
 * A forma de pagamento que marca a OS como faturada na parceira.
 *
 * É reconhecida como pagamento a prazo pelo resto do sistema: o serviço saiu, o
 * dinheiro não entrou. Assim a OS não conta como faturamento recebido, não
 * entra na gaveta do caixa, e aparece em Contas a receber — tudo pelo caminho
 * que já existia para a nota a prazo.
 */
export { PARTNER_PAYMENT_METHOD };

/** A OS é paga pela empresa parceira, e não pelo dono da moto? */
export function isPartnerBilled(order: Pick<OrderRecord, "payer" | "partnerId">): boolean {
  return order.payer === "partner" && Boolean(order.partnerId);
}

/**
 * O vencimento da fatura: dia 1 do mês seguinte ao do serviço.
 *
 * Serviço feito em 28 de fevereiro e serviço feito em 1º de março caem em
 * faturas diferentes, que é como a empresa parceira fecha o mês dela.
 */
export function nextBillingDate(reference: Date = new Date()): string {
  const primeiro = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const dia = String(primeiro.getDate()).padStart(2, "0");
  const mes = String(primeiro.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${primeiro.getFullYear()}`;
}

/**
 * A cobrança gerada ao encerrar uma OS que não foi paga na hora.
 *
 * Ficava solta no meio do encerramento, como três perguntas ternárias em
 * sequência, e era a resposta a "quando eu clico em receber, a conta vai
 * mesmo para a parceira?". Pergunta que ninguém conseguia responder olhando o
 * código, e que ninguém conferia — então virou função, com nome e conferência.
 *
 * Quem paga decide TUDO: o nome na conta, o id a que ela se prende, a
 * descrição, a origem e o vencimento. Na OS da parceira a cobrança vai no nome
 * da EMPRESA e vence no dia 1º do mês seguinte (a fatura mensal); na OS comum
 * vai no nome do dono da moto, sem vencimento imposto.
 */
export type OrderReceivable = {
  person: string;
  personId?: string;
  description: string;
  origin: string;
  dueDate?: string;
};

export function receivableForOrder(
  order: Pick<OrderRecord, "id" | "bike" | "customer" | "clientId" | "payer" | "partnerId" | "partnerName">,
  options: { customerName?: string; clientId?: string; partial?: boolean } = {},
  reference: Date = new Date(),
): OrderReceivable {
  const nome = (options.customerName ?? "").trim() || order.customer;
  const id = options.clientId || order.clientId;
  if (isPartnerBilled(order)) {
    return {
      // "Empresa parceira" só aparece se a OS perdeu o nome gravado. É melhor
      // do que uma conta a receber sem dono nenhum na tela do financeiro.
      person: order.partnerName || "Empresa parceira",
      personId: order.partnerId,
      description: billingDescription(order.id, order.bike, reference),
      origin: "Fatura de parceiro",
      dueDate: nextBillingDate(reference),
    };
  }
  return {
    person: nome,
    personId: id,
    // "parte a prazo" só entra quando o pagamento foi dividido: senão a conta
    // diria que é um pedaço de uma OS que foi paga inteira desta forma.
    description: `Ordem de serviço ${order.id} · ${order.bike}${options.partial ? " · parte a prazo" : ""}`,
    origin: "Ordem de serviço",
  };
}

/** A competência da fatura, para a descrição da conta ("03/2026"). */
export function billingReference(reference: Date = new Date()): string {
  return `${String(reference.getMonth() + 1).padStart(2, "0")}/${reference.getFullYear()}`;
}

export type PartnerTotals = {
  /** Mão de obra antes do desconto. */
  labor: number;
  /** Peças, pelo preço cheio. */
  parts: number;
  /** Tudo que foi tirado: o desconto da parceira mais o que a oficina deu na mão. */
  discount: number;
  /** O desconto combinado com a parceira, só na mão de obra. */
  partnerDiscount: number;
  /** O desconto que alguém deu nesta OS, em dinheiro. */
  manualDiscount: number;
  /** O que o cliente paga. */
  total: number;
};

/**
 * O total de uma OS.
 *
 * Esta é A conta da ordem de serviço, e não uma das contas: a tela, o cupom, o
 * PDF do cliente, o encerramento e a fatura da parceira chamam todos esta
 * função. É de propósito — no dia em que existirem duas, elas divergem, e o
 * dia em que divergirem é o dia em que o cliente recebe um papel com um valor
 * e paga outro.
 *
 * SÃO DOIS DESCONTOS, e eles são coisas diferentes:
 *
 * - O da PARCEIRA é combinado no contrato e vale **somente na mão de obra**.
 *   Peça tem preço fixo: dar desconto nela seria vender abaixo do que a
 *   oficina pagou ao fornecedor.
 * - O da OFICINA é o que se dá no balcão, na hora, em dinheiro — "leva por
 *   250". Esse vale sobre o que sobrou, peça incluída, porque quem decide
 *   abrir mão é o dono, e ele sabe o que está fazendo.
 *
 * O total nunca fica negativo: desconto maior que a conta vira a conta
 * inteira, e não dinheiro a devolver.
 */
export function partnerTotals(items: ServiceOrderItem[], laborDiscountPercent: number, manualDiscountAmount = 0): PartnerTotals {
  const labor = round2(items.filter((item) => item.type === "Mão de obra").reduce((sum, item) => sum + (item.price || 0), 0));
  const parts = round2(items.filter((item) => item.type !== "Mão de obra").reduce((sum, item) => sum + (item.price || 0), 0));
  const percent = Number.isFinite(laborDiscountPercent) ? Math.min(100, Math.max(0, laborDiscountPercent)) : 0;
  const partnerDiscount = round2(labor * (percent / 100));
  const depoisDaParceira = round2(labor - partnerDiscount + parts);
  // Desconto quebrado (texto, negativo, vazio) vale zero em vez de derrubar a
  // conta: o campo é digitado por gente com o cliente na frente.
  const pedido = Number.isFinite(manualDiscountAmount) ? Math.max(0, manualDiscountAmount) : 0;
  const manualDiscount = round2(Math.min(pedido, depoisDaParceira));
  return {
    labor,
    parts,
    partnerDiscount,
    manualDiscount,
    discount: round2(partnerDiscount + manualDiscount),
    total: round2(depoisDaParceira - manualDiscount),
  };
}

/** A parceira desta OS, quando ela é faturada. */
export function partnerOf(order: Pick<OrderRecord, "payer" | "partnerId">, partners: PartnerConfig[]): PartnerConfig | null {
  if (!isPartnerBilled(order)) return null;
  return partners.find((partner) => partner.id === order.partnerId) ?? null;
}

/** Motos que podem ser puxadas para uma OS de parceira: todas as do sistema. */
export function billableMotorcycles<T extends { id: string; plate: string; model: string; ownerName?: string }>(motorcycles: T[]): T[] {
  return [...motorcycles].sort((a, b) => `${a.model} ${a.plate}`.localeCompare(`${b.model} ${b.plate}`, "pt-BR"));
}

/** Como a moto aparece na lista de escolha. */
export function motorcycleLabel(motorcycle: { plate: string; model: string; ownerName?: string }): string {
  const dono = motorcycle.ownerName?.trim();
  return `${motorcycle.model} · ${motorcycle.plate}${dono ? ` · ${dono}` : ""}`;
}

/** O que fica escrito na conta a receber da parceira. */
export function billingDescription(orderId: string, bike: string, reference: Date = new Date()): string {
  return `Fatura ${billingReference(reference)} · Ordem de serviço ${orderId}${bike ? ` · ${bike}` : ""}`;
}

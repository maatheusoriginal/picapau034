/**
 * O retorno: a moto que já saiu da oficina e voltou.
 *
 * Acontece o tempo todo — a concessionária parceira leva a moto, o cliente
 * anda dois dias e algo continua errado. Antes disso existir, a saída era
 * abrir um atendimento do zero e digitar de novo o cliente, a moto, a placa e
 * a parceira, ou então reabrir a OS antiga.
 *
 * REABRIR A ANTIGA ESTÁ FORA DE COGITAÇÃO, e não por gosto de arquitetura: ela
 * já foi recebida e o dinheiro dela já entrou no caixa. Reabrir significaria um
 * caixa fechado voltando a ter uma OS aberta dentro, o DRE do mês mudando
 * depois de fechado e o relatório do período deixando de bater com o que foi
 * conferido na gaveta. O retorno é uma OS NOVA, ligada à antiga pelos dois
 * lados: a nova sabe de onde veio, e a antiga ganha uma linha no histórico
 * dizendo para onde a moto foi.
 *
 * O que vem junto é o CADASTRO — cliente, moto, placa, parceira, quem paga. O
 * que NÃO vem é o serviço: peças, mão de obra, total, diagnóstico e prazo são
 * do atendimento anterior. Trazer os itens junto seria cobrar de novo pelo que
 * já foi pago, e ninguém perceberia até o cliente reclamar da segunda conta.
 */
import type { OrderEvent, OrderRecord, ServiceOrderItem } from "./types";
import { orderEvent } from "./order-events";

const texto = (valor: unknown) => String(valor ?? "").trim();

export type ReturnPlan = {
  /** Os campos da OS nova, prontos para gravar. */
  novaOrdem: Record<string, unknown>;
  /** A linha que entra no histórico da OS antiga. */
  marcaNaAntiga: OrderEvent;
  /** O que o operador precisa saber antes de confirmar. */
  aviso: string;
};

/** A OS pode virar retorno? Só o que já foi entregue e pago. */
export function canReturn(order: Pick<OrderRecord, "closed">): boolean {
  return order.closed === true;
}

export function buildReturnPlan({ order, novoId, quando, quem }: {
  order: OrderRecord;
  /** O número da OS nova, já reservado por quem chama. */
  novoId: string;
  /** O instante da abertura, como a OS grava: "16/09/2026, 14:30". */
  quando: string;
  quem: string;
}): ReturnPlan {
  const origem = texto(order.id);
  /*
    O problema relatado já nasce dizendo que é retorno.

    É a primeira linha que o mecânico lê na bancada e a que sai impressa na via
    dele. Sem isso, a segunda OS da mesma moto parece um serviço novo, e o
    mecânico refaz o diagnóstico inteiro em vez de olhar o que foi feito antes.
  */
  const relato = [`RETORNO DA ${origem}.`, texto(order.problem)].filter(Boolean).join(" ");

  const novaOrdem: Record<string, unknown> = {
    customer: texto(order.customer),
    bike: texto(order.bike),
    plate: texto(order.plate),
    mechanic: "",
    mechanicIds: [],
    time: quando,
    status: "Em avaliação",
    tone: "blue",
    // Sem itens e sem total: o serviço da OS antiga já foi cobrado.
    items: [] as ServiceOrderItem[],
    total: 0,
    deductedItems: [],
    problem: relato,
    // A ligação com a OS de origem, que é o que faz o histórico da moto
    // mostrar que foram dois atendimentos do MESMO problema.
    returnOfOrderId: origem,
    origin: `Retorno da ${origem}`,
    priority: texto(order.priority) || "Normal",
    events: [orderEvent(`Retorno da ${origem} · ${quando}`, quem)],
  };

  // O cadastro vem junto; o que não existe não vira campo vazio no banco.
  if (texto(order.clientId)) novaOrdem.clientId = texto(order.clientId);
  if (texto(order.motorcycleId)) novaOrdem.motorcycleId = texto(order.motorcycleId);
  if (texto(order.mileage)) novaOrdem.mileage = texto(order.mileage);
  if (texto(order.partnerId)) {
    novaOrdem.partnerId = texto(order.partnerId);
    novaOrdem.partnerName = texto(order.partnerName);
    // Quem pagou a primeira paga a segunda, se houver o que cobrar. O número
    // do papel da parceira NÃO vem: o retorno é outro papel, com outro número,
    // e repetir o antigo faria as duas OS se confundirem na conferência dela.
    novaOrdem.payer = order.payer === "partner" ? "partner" : "owner";
  }
  if (order.customerPending) novaOrdem.customerPending = true;

  return {
    novaOrdem,
    marcaNaAntiga: orderEvent(`Moto voltou em retorno · ${novoId}`, quem),
    aviso: texto(order.partnerName)
      ? `Retorno da ${origem} · ${texto(order.partnerName)}`
      : `Retorno da ${origem}`,
  };
}

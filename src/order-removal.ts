/**
 * Apagar uma ordem de serviço.
 *
 * Acontece e é legítimo: a OS foi aberta em duplicidade, ou aberta na moto
 * errada, ou o cliente desistiu antes de a moto entrar na bancada. Sem um
 * botão, a oficina convivia com OS fantasma na fila — e fila com lixo é fila
 * que ninguém confia.
 *
 * Mas apagar OS não é apagar um cadastro qualquer: ela pode ter TIRADO PEÇA DO
 * ESTOQUE e pode ter MEXIDO NO DINHEIRO. As duas coisas decidem o que pode e o
 * que não pode ser apagado, e é isso que este arquivo responde — sem tela e sem
 * Firestore, para poder ser conferido por `npm run check:order-removal`.
 */
import type { OrderRecord } from "./types";

export type OrderRemovalDecision = {
  /** "apagar" some com a OS; "bloqueado" explica por que não dá. */
  modo: "apagar" | "bloqueado";
  /** A frase que a confirmação mostra. */
  motivo: string;
  /** Quantas peças voltam para a prateleira ao apagar. */
  pecasDevolvidas: number;
  /** O que fazer em vez de apagar, quando não dá. */
  saida?: string;
};

const texto = (valor: unknown) => String(valor ?? "").trim();

/** Quantas peças esta OS tirou do estoque e precisa devolver. */
export function pecasAdevolver(order: Pick<OrderRecord, "deductedItems">): number {
  return (order.deductedItems ?? []).reduce((soma, item) => soma + (Number(item.quantity) || 0), 0);
}

/**
 * Pode apagar?
 *
 * A trava é UMA só: OS encerrada que passou pelo caixa não se apaga.
 *
 * Encerrar a OS gera dinheiro — entra na gaveta do caixa, no faturamento do
 * dia, no relatório do mês, e quando é fiado vira conta a receber. Apagar o
 * documento não desfaz nada disso: sobraria um lançamento apontando para uma OS
 * que não existe mais, e a conferência do caixa fecharia com diferença que
 * ninguém consegue explicar. Estornar é trabalho do financeiro, não de um botão
 * de apagar.
 *
 * A OS lançada só para o histórico da moto nasce encerrada, mas nunca tocou em
 * dinheiro nem em estoque (ver src/backfill.ts). Essa pode ser apagada: é
 * justamente a que alguém lança errado ao digitar a pilha de papel antiga.
 */
export function decidirExclusaoDaOS(order: Pick<OrderRecord, "id" | "closed" | "backfilled" | "deductedItems" | "customer" | "bike">): OrderRemovalDecision {
  const pecas = pecasAdevolver(order);
  if (order.closed === true && order.backfilled !== true) {
    return {
      modo: "bloqueado",
      pecasDevolvidas: 0,
      motivo: "Esta OS já foi encerrada e recebida: o valor dela entrou no caixa, no faturamento do dia e, se ficou fiado, em contas a receber.",
      saida: "Apagar o documento não desfaz nenhum desses lançamentos — deixaria o caixa fechando com diferença. Para desfazer o dinheiro, lance o estorno em Financeiro.",
    };
  }
  if (order.backfilled === true) {
    return {
      modo: "apagar",
      pecasDevolvidas: 0,
      motivo: "Esta OS foi lançada só para o histórico da moto: não tirou peça do estoque nem entrou no caixa. Apagar não mexe em mais nada.",
    };
  }
  return {
    modo: "apagar",
    pecasDevolvidas: pecas,
    motivo: pecas
      ? `Esta OS já tirou ${pecas === 1 ? "1 peça" : `${pecas} peças`} do estoque. Ao apagar, ${pecas === 1 ? "ela volta" : "elas voltam"} para a prateleira no mesmo movimento.`
      : "Esta OS não tirou peça do estoque nem entrou no caixa. Apagar não mexe em mais nada.",
  };
}

/** O título da confirmação. */
export function tituloDaExclusao(decisao: OrderRemovalDecision): string {
  return decisao.modo === "apagar" ? "Apagar esta ordem de serviço?" : "Esta OS não pode ser apagada";
}

/** O texto do botão que confirma. */
export function rotuloDaExclusao(decisao: OrderRemovalDecision): string {
  if (decisao.modo === "bloqueado") return "Entendi";
  return decisao.pecasDevolvidas ? "Apagar e devolver ao estoque" : "Apagar a OS";
}

/**
 * O que volta para o estoque ao apagar.
 *
 * Quantidade POSITIVA porque quem grava subtrai o delta do saldo — é a mesma
 * convenção de saveOrderWithStock. Devolver peça é subtrair um número negativo.
 */
export function devolucaoAoEstoque(order: Pick<OrderRecord, "deductedItems">): Array<{ productId: string; quantity: number }> {
  return (order.deductedItems ?? [])
    .filter((item) => item.productId && Number(item.quantity) > 0)
    .map((item) => ({ productId: item.productId, quantity: -Number(item.quantity) }));
}

export type OrderRemovalLog = {
  action: "order.delete";
  orderId: string;
  actorUid: string;
  actorName: string;
  at: string;
  /** O que a OS era, para o registro sobreviver ao documento apagado. */
  summary: string;
  total: number;
  returnedParts: number;
};

/**
 * O registro de que alguém apagou uma OS.
 *
 * A OS some, então o rastro precisa morar fora dela. Guarda quem, quando e o
 * que era — senão "sumiu uma OS" vira discussão sem resposta, e é o tipo de
 * pergunta que aparece semanas depois.
 */
export function registroDaExclusao(
  order: Pick<OrderRecord, "id" | "customer" | "bike" | "plate" | "total" | "deductedItems">,
  actor: { uid: string; name: string },
  at: string = new Date().toISOString(),
): OrderRemovalLog {
  return {
    action: "order.delete",
    orderId: order.id,
    actorUid: texto(actor.uid),
    actorName: texto(actor.name),
    at,
    summary: [texto(order.customer), texto(order.bike), texto(order.plate)].filter(Boolean).join(" · ") || "OS sem dados",
    total: Number(order.total) || 0,
    returnedParts: pecasAdevolver(order),
  };
}

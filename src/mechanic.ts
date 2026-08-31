import type { OrderRecord, ServiceOrderStatus } from "./types";

/**
 * A visão do mecânico.
 *
 * O mecânico vê a mesma tabela de seis colunas que o dono, com todas as OS da
 * oficina misturadas e nada indicando quais são dele. No celular, com a mão
 * suja, isso é inútil: ele precisa de duas perguntas respondidas — "o que é
 * meu?" e "o que tem para pegar?".
 *
 * A segunda pergunta importa tanto quanto a primeira: quando a peça de uma OS
 * não chegou, ele não fica parado, puxa outra para adiantar. Sem enxergar o
 * que está livre, ou ele fica ocioso ou vai perguntar para alguém.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-mechanic.ts).
 */

/** OS encerrada não interessa a ninguém na bancada. */
function isOpen(order: OrderRecord): boolean {
  return !order.closed;
}

/** Esta OS é do mecânico? */
export function isAssignedTo(order: OrderRecord, employeeId: string): boolean {
  if (!employeeId) return false;
  return (order.mechanicIds ?? []).includes(employeeId);
}

/**
 * Ordem de urgência na bancada: o que está na mão primeiro, o que já acabou
 * por último. Dentro do mesmo estágio, a OS mais antiga vem antes — quem está
 * esperando há mais tempo é atendido primeiro.
 */
const STAGE_ORDER: Record<string, number> = {
  "Em serviço": 0,
  "Aprovação": 1,
  "Avaliação": 2,
  "Recepção": 3,
  "Entrega": 4,
};

function byStage(a: OrderRecord, b: OrderRecord): number {
  const stage = (STAGE_ORDER[a.status] ?? 9) - (STAGE_ORDER[b.status] ?? 9);
  if (stage !== 0) return stage;
  return String(a.id).localeCompare(String(b.id));
}

export type MechanicBoard = {
  /** As OS atribuídas a ele, abertas. */
  mine: OrderRecord[];
  /** As demais OS abertas da oficina — o que ele pode puxar. */
  shop: OrderRecord[];
};

/**
 * Separa o quadro em "minhas" e "na oficina".
 *
 * Sem vínculo com funcionário (employeeId vazio), nada é "dele": tudo aparece
 * como da oficina. É melhor que mostrar uma tela vazia sem explicação — mas a
 * tela precisa avisar, porque a causa é o cadastro do usuário, não a falta de
 * serviço.
 */
export function mechanicBoard(orders: OrderRecord[], employeeId: string): MechanicBoard {
  const open = orders.filter(isOpen);
  return {
    mine: open.filter((order) => isAssignedTo(order, employeeId)).sort(byStage),
    shop: open.filter((order) => !isAssignedTo(order, employeeId)).sort(byStage),
  };
}

export type MechanicSummary = {
  /** Minhas OS com serviço em andamento. */
  working: number;
  /** Minhas OS que ainda não começaram. */
  waiting: number;
  /** Minhas OS prontas, aguardando a entrega ao cliente. */
  ready: number;
  /** O que há na oficina para pegar. */
  available: number;
};

export function mechanicSummary(board: MechanicBoard): MechanicSummary {
  return {
    working: board.mine.filter((order) => order.status === "Em serviço").length,
    waiting: board.mine.filter((order) => ["Recepção", "Avaliação", "Aprovação"].includes(order.status)).length,
    ready: board.mine.filter((order) => order.status === "Entrega").length,
    available: board.shop.length,
  };
}

/**
 * O próximo passo natural da OS na bancada, para caber em um toque.
 *
 * Só os dois movimentos que o mecânico faz de verdade: começar o serviço e
 * marcar como pronta. Orçamento e aprovação são conversa com o cliente, então
 * "Avaliação" e "Aprovação" também levam a "Em serviço" — é o que acontece
 * quando o cliente aprova e a moto vai para a bancada. Todo o resto continua
 * disponível abrindo a OS.
 */
export function nextStatusFor(status: string): ServiceOrderStatus | null {
  if (status === "Entrega") return null;
  if (status === "Em serviço") return "Entrega";
  return "Em serviço";
}

/** O que o botão de um toque diz. */
export function actionLabelFor(status: string): string {
  if (status === "Entrega") return "";
  if (status === "Em serviço") return "Marcar pronta";
  return "Iniciar serviço";
}

/** O que o botão diz quando a OS ainda não é dele. */
export function takeLabelFor(status: string): string {
  return status === "Em serviço" ? "Ajudar nesta" : "Pegar esta OS";
}

/**
 * Como fica a equipe da OS quando o mecânico a assume.
 *
 * Ele é ACRESCENTADO, não substitui quem já estava: duas pessoas na mesma moto
 * é comum, e apagar o responsável anterior faria a oficina perder de vista quem
 * começou o serviço. Com a oficina configurada para um mecânico por OS, o
 * assumir passa a ser troca — que é o que a configuração pede.
 */
export function mechanicsAfterTaking(order: OrderRecord, employeeId: string, allowMultiple = true): string[] {
  const current = order.mechanicIds ?? [];
  if (!employeeId) return [...current];
  if (current.includes(employeeId)) return [...current];
  return allowMultiple ? [...current, employeeId] : [employeeId];
}

/** Uma linha do quadro, já pronta para a tela desenhar. */
export type BoardRow = {
  order: OrderRecord;
  mine: boolean;
  /** Texto do botão de ação. Vazio quando não há ação de um toque. */
  action: string;
  /** Situação para onde o botão leva. */
  target: ServiceOrderStatus | null;
};

export function boardRow(order: OrderRecord, employeeId: string): BoardRow {
  const mine = isAssignedTo(order, employeeId);
  return {
    order,
    mine,
    action: mine ? actionLabelFor(order.status) : takeLabelFor(order.status),
    target: mine ? nextStatusFor(order.status) : (order.status === "Em serviço" ? null : "Em serviço"),
  };
}

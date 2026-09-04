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
  // Logo depois do que está na mão: é uma moto começada e parada, o que o
  // mecânico precisa reencontrar assim que a peça chegar.
  "Aguardando peça": 1,
  "Aprovação": 2,
  "Avaliação": 3,
  "Recepção": 4,
  "Entrega": 5,
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
  /** Minhas OS paradas esperando peça. */
  blocked: number;
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
    blocked: board.mine.filter((order) => order.status === "Aguardando peça").length,
    waiting: board.mine.filter((order) => ["Recepção", "Avaliação", "Aprovação"].includes(order.status)).length,
    ready: board.mine.filter((order) => order.status === "Entrega").length,
    available: board.shop.length,
  };
}

/** Um botão de um toque na linha da OS. */
export type BoardAction = { label: string; target: ServiceOrderStatus };

/**
 * Os movimentos que o mecânico faz de verdade, para caberem em um toque.
 *
 * "Em serviço" tem DOIS, e é a razão de existir mais de um botão por linha:
 * terminar e travar esperando peça acontecem com a mesma frequência. Deixar a
 * segunda escondida atrás de "Abrir" era o que fazia ninguém registrar a
 * espera — e a oficina não enxergar a moto parada.
 *
 * Orçamento e aprovação são conversa com o cliente, então "Avaliação" e
 * "Aprovação" levam direto a "Em serviço": é o que acontece quando o cliente
 * aprova e a moto vai para a bancada. Todo o resto continua no diálogo da OS.
 */
export function actionsFor(status: string): BoardAction[] {
  // Rótulos curtos de propósito: com três botões na linha ("Abrir" mais dois),
  // texto longo espremia o nome do cliente até quebrar em quatro linhas no
  // celular. A situação colorida ao lado já diz de onde a OS está saindo.
  if (status === "Entrega") return [];
  if (status === "Em serviço") return [
    { label: "Falta peça", target: "Aguardando peça" },
    { label: "Pronta", target: "Entrega" },
  ];
  if (status === "Aguardando peça") return [{ label: "Peça chegou", target: "Em serviço" }];
  return [{ label: "Iniciar", target: "Em serviço" }];
}

/**
 * O que o botão diz quando a OS ainda não é dele.
 *
 * Uma OS parada esperando peça também pode ser assumida: quem tem a peça na
 * mão, ou sabe onde ela está, resolve mais rápido que quem abriu o serviço.
 */
export function takeLabelFor(status: string): string {
  if (status === "Em serviço") return "Ajudar";
  if (status === "Aguardando peça") return "Assumir";
  return "Pegar";
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
  /** Botões de um toque. Vazio quando não há nada a fazer sem abrir a OS. */
  actions: BoardAction[];
};

export function boardRow(order: OrderRecord, employeeId: string): BoardRow {
  const mine = isAssignedTo(order, employeeId);
  if (mine) return { order, mine, actions: actionsFor(order.status) };
  // Assumir uma OS que já está sendo feita seria mexer no serviço do colega
  // sem ele saber; para isso, abre a OS e conversa. Nas demais, assumir leva
  // para a bancada — que é o que a pessoa vai fazer em seguida.
  if (order.status === "Em serviço") return { order, mine, actions: [] };
  return { order, mine, actions: [{ label: takeLabelFor(order.status), target: "Em serviço" }] };
}

/**
 * O relato que o mecânico lê antes de abrir a OS.
 *
 * No computador ele abre a OS para saber o que a moto tem; no celular, com a
 * mão suja, abrir cada uma para descobrir qual é a que ele quer é o que faz a
 * lista não servir. O relato do cliente é a única informação que responde
 * "qual dessas é a que eu vou pegar agora" sem um toque a mais.
 *
 * Corta na palavra, nunca no meio dela: "BARULHO NA RELA…" faz o mecânico
 * abrir a OS de novo só para ler o resto, que é exatamente o que se quer
 * evitar. Uma palavra única maior que o limite é o caso perdido — aí corta
 * onde der, senão a linha estoura a tela.
 */
export function resumoDoServico(order: OrderRecord, limite = 84): string {
  const relato = String(order.problem ?? "").replace(/\s+/g, " ").trim();
  if (!relato) return "Sem relato na OS";
  if (relato.length <= limite) return relato;
  const corte = relato.slice(0, limite);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > 0 ? corte.slice(0, espaco) : corte).replace(/[ ,.;:-]+$/, "")}…`;
}

import { accountDescription, drawerTotal, isCashPayment, parseBRDate, paymentsOf } from "./finance";
import type { AccountRecord, CashMovement, CashSession, ExpenseRecord, MovementRecord, OrderRecord, SaleRecord } from "./types";

/**
 * O caixa da oficina: o dinheiro que está de verdade dentro da gaveta.
 *
 * A conta que o resto do financeiro faz ("recebido menos pago") é o saldo do
 * negócio, e não serve para conferir a gaveta: ela soma PIX e cartão, que
 * nunca passaram pela mão de ninguém. Aqui só entra **dinheiro em espécie**.
 *
 * É essa separação que faz o fechamento valer alguma coisa. Se o esperado
 * incluísse o PIX do dia, o caixa sempre fecharia com uma "falta" gigante e
 * ninguém olharia mais para o número — que é como um desvio de R$ 50 passa
 * despercebido por meses.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-cash.ts).
 */

/** Forma de pagamento que coloca dinheiro na gaveta. */
export const DRAWER_METHOD = "Dinheiro";

export function isDrawerPayment(method: string | undefined): boolean {
  return (method ?? "").trim() === DRAWER_METHOD;
}

/** A sessão aberta, se houver. Só pode existir uma. */
export function openSession(sessions: CashSession[]): CashSession | null {
  return sessions.find((session) => session.status === "aberto") ?? null;
}

/** Sessões já fechadas, da mais recente para a mais antiga. */
export function closedSessions(sessions: CashSession[]): CashSession[] {
  return sessions
    .filter((session) => session.status === "fechado")
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
}

/** Uma linha do extrato da gaveta. */
export type DrawerEntry = {
  id: string;
  kind: "Abertura" | "Venda" | "Ordem de serviço" | "Recebimento" | "Suprimento" | "Sangria" | "Gasto" | "Movimentação";
  description: string;
  /** ISO 8601 do momento em que o dinheiro entrou ou saiu. */
  at: string;
  /** Positivo entra na gaveta, negativo sai. */
  amount: number;
};

/** Está dentro da sessão? Vale do instante da abertura até o fechamento (ou até agora). */
function withinSession(session: CashSession, at: string | undefined): boolean {
  if (!at) return false;
  if (at < session.openedAt) return false;
  return !session.closedAt || at <= session.closedAt;
}

/**
 * Converte a data brasileira de um gasto em ISO, para os gastos antigos que
 * ainda não têm `paidAt`. Cai na meia-noite daquele dia, e por isso um gasto
 * assim entra na sessão que estava aberta naquele dia — não dá para saber a
 * hora exata de um registro que nunca a guardou.
 */
function expenseInstant(expense: ExpenseRecord): string {
  if (expense.paidAt) return expense.paidAt;
  const date = parseBRDate(expense.dueDate);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0).toISOString() : "";
}

/** Mesma ideia para a OS antiga, fechada antes de existir `closedAtISO`. */
function orderInstant(order: OrderRecord): string {
  if (order.closedAtISO) return order.closedAtISO;
  const date = parseBRDate(order.closedAt);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0).toISOString() : "";
}

export type DrawerSources = {
  sales?: SaleRecord[];
  orders?: OrderRecord[];
  expenses?: ExpenseRecord[];
  accounts?: AccountRecord[];
  movements?: MovementRecord[];
};

/**
 * Tudo que passou pela gaveta nesta sessão, do mais recente para o mais antigo.
 *
 * A abertura entra como primeira linha porque o fundo de troco também é
 * dinheiro na gaveta: sem ele o esperado sairia menor que o contado todo dia.
 */
export function drawerEntries(session: CashSession | null, sources: DrawerSources = {}): DrawerEntry[] {
  if (!session) return [];
  const entries: DrawerEntry[] = [{
    id: `${session.id}-abertura`,
    kind: "Abertura",
    description: "Fundo de troco",
    at: session.openedAt,
    amount: session.openingAmount,
  }];

  (sources.sales ?? []).forEach((sale) => {
    if (!withinSession(session, sale.soldAt)) return;
    // Só a parte em espécie: numa venda dividida entre PIX e dinheiro, a gaveta
    // recebeu apenas o dinheiro. Esperar o total era o que fazia a conferência
    // acusar falta todo dia sem ninguém entender.
    const emEspecie = drawerTotal(paymentsOf(sale));
    if (emEspecie <= 0) return;
    const dividido = (sale.payments?.length ?? 0) > 1;
    entries.push({
      id: sale.id,
      kind: "Venda",
      description: `${sale.origin} · ${sale.customer || "Consumidor final"}${dividido ? " · parte em dinheiro" : ""}`,
      at: sale.soldAt,
      // Taxa de maquininha não existe em pagamento em espécie.
      amount: emEspecie,
    });
  });

  (sources.orders ?? []).forEach((order) => {
    const at = orderInstant(order);
    if (!order.closed || !withinSession(session, at)) return;
    const emEspecie = drawerTotal(paymentsOf(order));
    if (emEspecie <= 0) return;
    const dividido = (order.payments?.length ?? 0) > 1;
    entries.push({
      id: order.id,
      kind: "Ordem de serviço",
      description: `${order.customer}${order.plate ? ` · ${order.plate}` : ""}${dividido ? " · parte em dinheiro" : ""}`,
      at,
      amount: emEspecie,
    });
  });

  // Baixa de conta a receber paga em dinheiro entra na gaveta; baixa de conta
  // a pagar quitada em dinheiro sai dela.
  (sources.accounts ?? []).forEach((account) => {
    (account.settlements ?? []).forEach((settlement, index) => {
      if (!isDrawerPayment(settlement.method) || !withinSession(session, settlement.settledAt)) return;
      const outgoing = account.kind === "pagar";
      entries.push({
        id: `${account.id}-${index}`,
        kind: outgoing ? "Gasto" : "Recebimento",
        description: `${account.person || (outgoing ? "Favorecido" : "Cliente")} · ${accountDescription(account)}`,
        at: settlement.settledAt,
        amount: outgoing ? -settlement.amount : settlement.amount,
      });
    });
  });

  (sources.expenses ?? []).forEach((expense) => {
    const at = expenseInstant(expense);
    if (expense.status !== "Pago" || !isDrawerPayment(expense.method) || !withinSession(session, at)) return;
    entries.push({
      id: expense.id,
      kind: "Gasto",
      description: expense.description || expense.category,
      at,
      amount: -expense.amount,
    });
  });

  // Movimentação manual em dinheiro também passa pela gaveta: uma venda de
  // sucata recebida em espécie tem que aparecer na conferência, senão o caixa
  // fecha com sobra e ninguém sabe explicar de onde veio.
  (sources.movements ?? []).forEach((movement) => {
    if (!isDrawerPayment(movement.method) || !withinSession(session, movement.at)) return;
    entries.push({
      id: movement.id,
      kind: "Movimentação",
      description: `${movement.category} · ${movement.description}`,
      at: movement.at,
      amount: movement.kind === "entrada" ? movement.amount : -movement.amount,
    });
  });

  (session.movements ?? []).forEach((movement, index) => {
    entries.push({
      id: `${session.id}-mov-${index}`,
      kind: movement.kind,
      description: movement.reason || movement.kind,
      at: movement.at,
      amount: movement.kind === "Sangria" ? -Math.abs(movement.amount) : Math.abs(movement.amount),
    });
  });

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export type CashSummary = {
  /** Fundo de troco da abertura. */
  opening: number;
  /** Vendas e OS recebidas em dinheiro. */
  sales: number;
  /** Baixas de contas a receber pagas em dinheiro. */
  received: number;
  supplies: number;
  withdrawals: number;
  /** Gastos pagos em dinheiro pela gaveta. */
  expenses: number;
  /** Quanto deveria haver na gaveta agora. */
  expected: number;
  /** Quantidade de movimentações, sem contar a abertura. */
  count: number;
};

export function cashSummary(session: CashSession | null, sources: DrawerSources = {}): CashSummary {
  const entries = drawerEntries(session, sources);
  const total = (kinds: DrawerEntry["kind"][]) => entries
    .filter((entry) => kinds.includes(entry.kind))
    .reduce((sum, entry) => sum + entry.amount, 0);

  const opening = total(["Abertura"]);
  const sales = total(["Venda", "Ordem de serviço"]);
  // A movimentação manual entra junto do recebimento quando é entrada, e junto
  // do gasto quando é saída. Somar o líquido das duas daria o mesmo esperado no
  // fim, mas mostraria "entrou" e "saiu" errados nos cartões da tela.
  const manualIn = entries.filter((entry) => entry.kind === "Movimentação" && entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const manualOut = entries.filter((entry) => entry.kind === "Movimentação" && entry.amount < 0).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const received = total(["Recebimento"]) + manualIn;
  const supplies = total(["Suprimento"]);
  const withdrawals = Math.abs(total(["Sangria"]));
  const expenses = Math.abs(total(["Gasto"])) + manualOut;

  return {
    opening,
    sales,
    received,
    supplies,
    withdrawals,
    expenses,
    expected: round2(opening + sales + received + supplies - withdrawals - expenses),
    count: entries.length - 1,
  };
}

/**
 * Diferença do fechamento: contado menos esperado.
 * Positivo é sobra, negativo é falta.
 */
export function cashDifference(counted: number, expected: number): number {
  return round2(counted - expected);
}

/**
 * Como a diferença deve ser lida. A tolerância de um centavo existe porque
 * arredondamento de parcela não é erro de caixa.
 */
export function differenceLabel(difference: number): "Confere" | "Sobra" | "Falta" {
  if (Math.abs(difference) < 0.01) return "Confere";
  return difference > 0 ? "Sobra" : "Falta";
}

/**
 * Uma sessão de caixa por vez. Duas abertas fariam a mesma venda ser contada
 * nas duas, e nenhuma das duas conferências fecharia.
 */
export function canOpenSession(sessions: CashSession[]): boolean {
  return !openSession(sessions);
}

/** Movimentação pronta para gravar, com o valor sempre positivo. */
export function buildMovement(
  kind: CashMovement["kind"],
  amount: number,
  reason: string,
  operator?: { uid?: string; name?: string },
): CashMovement {
  const now = new Date();
  return {
    kind,
    amount: round2(Math.abs(amount)),
    reason: reason.trim(),
    at: now.toISOString(),
    date: now.toLocaleDateString("pt-BR"),
    operatorUid: operator?.uid ?? "",
    operatorName: operator?.name ?? "",
  };
}

/**
 * O que impede uma sangria de acontecer.
 *
 * Retirar mais do que existe na gaveta deixaria o caixa negativo, que é um
 * estado que não existe no mundo real — e depois ninguém entenderia de onde
 * veio a falta no fechamento.
 */
export function movementProblem(kind: CashMovement["kind"], amount: number, expected: number): string {
  if (!(amount > 0)) return "Informe um valor maior que zero.";
  if (kind === "Sangria" && amount > expected) {
    return `A gaveta tem ${money(expected)}. Não dá para sangrar ${money(amount)}.`;
  }
  return "";
}

/** Passou muito tempo com o caixa aberto? Provavelmente esqueceram de fechar ontem. */
export function sessionIsStale(session: CashSession | null, now: Date = new Date()): boolean {
  if (!session) return false;
  const opened = new Date(session.openedAt);
  if (Number.isNaN(opened.getTime())) return false;
  return now.getTime() - opened.getTime() > 20 * 60 * 60 * 1000;
}

/** Vendas que NÃO passaram pela gaveta, para o fechamento não ser lido como se fosse o dia inteiro. */
export function nonDrawerTotal(session: CashSession | null, sales: SaleRecord[] = [], orders: OrderRecord[] = []): number {
  if (!session) return 0;
  // O que virou dinheiro mas NÃO passou pela gaveta: PIX e cartão. Numa venda
  // dividida, é só a parte que foi por esses meios.
  const foraDaGaveta = (parts: ReturnType<typeof paymentsOf>) => round2(parts
    .filter((part) => isCashPayment(part.method) && part.method.trim() !== "Dinheiro")
    .reduce((total, part) => total + part.amount, 0));
  const fromSales = sales
    .filter((sale) => withinSession(session, sale.soldAt))
    .reduce((total, sale) => total + foraDaGaveta(paymentsOf(sale)), 0);
  const fromOrders = orders
    .filter((order) => order.closed && withinSession(session, orderInstant(order)))
    .reduce((total, order) => total + foraDaGaveta(paymentsOf(order)), 0);
  return round2(fromSales + fromOrders);
}

/** Total em dinheiro que já foi retirado da gaveta em sangrias nesta sessão. */
export function withdrawnTotal(session: CashSession | null): number {
  return round2((session?.movements ?? [])
    .filter((movement) => movement.kind === "Sangria")
    .reduce((total, movement) => total + Math.abs(movement.amount), 0));
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

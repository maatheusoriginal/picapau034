import { accountDescription, drawerTotal, isCashPayment, parseBRDate, paymentsOf } from "./finance";
import type { AccountRecord, CashMovement, CashSession, ExpenseRecord, MovementRecord, OrderRecord, SaleRecord } from "./types";
import { dentroDoPeriodo, type Periodo } from "./report";

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
  /**
   * De onde o dinheiro veio, quando a linha é uma venda.
   *
   * Sem isso o fechamento só conseguia dizer "entrou tanto em vendas e OS", e
   * quem confere a gaveta do balcão no fim do dia não tinha como separar o que
   * é dele do que é da bancada.
   */
  origin?: SaleRecord["origin"];
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
      origin: sale.origin,
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
  /** Vendas do PDV recebidas em dinheiro. */
  counter: number;
  /** Serviços rápidos recebidos em dinheiro. */
  quick: number;
  /** OS encerradas e recebidas em dinheiro. */
  orders: number;
  /** Baixas de contas a receber pagas em dinheiro. */
  received: number;
  /** Entradas avulsas lançadas à mão, em dinheiro. */
  manualIn: number;
  supplies: number;
  withdrawals: number;
  /** Gastos pagos em dinheiro pela gaveta. */
  expenses: number;
  /** Saídas avulsas lançadas à mão, em dinheiro. */
  manualOut: number;
  /** Tudo que entrou, fundo de troco à parte. */
  incoming: number;
  /** Tudo que saiu. */
  outgoing: number;
  /** Quanto deveria haver na gaveta agora. */
  expected: number;
  /** Quantidade de movimentações, sem contar a abertura. */
  count: number;
};

/**
 * O resumo da gaveta, com cada origem na sua linha.
 *
 * Antes venda de balcão e OS entravam somadas num campo só. Quem fecha o
 * balcão no fim do dia precisa saber o que passou pela mão dele: com os dois
 * juntos, uma diferença no balcão só aparecia como uma diferença do caixa
 * inteiro, e ninguém sabia onde procurar.
 */
export function cashSummary(session: CashSession | null, sources: DrawerSources = {}): CashSummary {
  const entries = drawerEntries(session, sources);
  const total = (kinds: DrawerEntry["kind"][]) => entries
    .filter((entry) => kinds.includes(entry.kind))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const vendasDe = (origin: SaleRecord["origin"]) => entries
    .filter((entry) => entry.kind === "Venda" && entry.origin === origin)
    .reduce((sum, entry) => sum + entry.amount, 0);

  const opening = total(["Abertura"]);
  const counter = vendasDe("PDV");
  const quick = vendasDe("Serviço rápido");
  // Venda antiga, gravada antes de a origem existir, não pode sumir do
  // esperado: ela entra como balcão, que é de onde as vendas do sistema saíam.
  const semOrigem = entries
    .filter((entry) => entry.kind === "Venda" && entry.origin !== "PDV" && entry.origin !== "Serviço rápido")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const orders = total(["Ordem de serviço"]);
  const received = total(["Recebimento"]);
  // A movimentação manual fica na própria linha: somada ao recebimento, um
  // "achado" de R$ 200 na gaveta viraria recebimento de cliente no fechamento.
  const manualIn = entries.filter((entry) => entry.kind === "Movimentação" && entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const manualOut = entries.filter((entry) => entry.kind === "Movimentação" && entry.amount < 0).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const supplies = total(["Suprimento"]);
  const withdrawals = Math.abs(total(["Sangria"]));
  const expenses = Math.abs(total(["Gasto"]));

  const incoming = round2(counter + semOrigem + quick + orders + received + manualIn + supplies);
  const outgoing = round2(withdrawals + expenses + manualOut);

  return {
    opening,
    counter: round2(counter + semOrigem),
    quick,
    orders,
    received,
    manualIn,
    supplies,
    withdrawals,
    expenses,
    manualOut,
    incoming,
    outgoing,
    expected: round2(opening + incoming - outgoing),
    count: entries.length - 1,
  };
}

/**
 * As origens do dinheiro da gaveta, cada uma na sua linha, na ordem em que a
 * oficina confere: primeiro o balcão, depois a bancada, depois o resto.
 *
 * Linhas zeradas ficam de fora: uma oficina que não fez serviço rápido hoje
 * não precisa ler "Serviço rápido R$ 0,00" no fechamento.
 */
export function drawerOrigins(summary: CashSummary): Array<{ origem: string; total: number }> {
  return [
    { origem: "Venda no balcão", total: summary.counter },
    { origem: "Serviço rápido", total: summary.quick },
    { origem: "Ordem de serviço", total: summary.orders },
    { origem: "Conta a receber quitada", total: summary.received },
    { origem: "Entrada avulsa", total: summary.manualIn },
    { origem: "Suprimento", total: summary.supplies },
  ].filter((linha) => linha.total !== 0);
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

// ---------------------------------------------------------------------------
// Histórico de caixas fechados
// ---------------------------------------------------------------------------

/**
 * Os caixas fechados dentro de um período, do mais recente para o mais antigo.
 *
 * O histórico só existia dentro do diálogo de abrir o caixa, cortado nos cinco
 * últimos. Quem precisava achar o fechamento de terça passada — porque o
 * dinheiro não bateu e alguém quer entender onde — não tinha por onde começar.
 */
export function sessionsInPeriod(sessions: CashSession[], periodo: Periodo): CashSession[] {
  return closedSessions(sessions).filter((session) => dentroDoPeriodo(session.closedDate, periodo));
}

export type CashHistorySummary = {
  /** Quantos caixas foram fechados no período. */
  caixas: number;
  /** Soma do que o sistema esperava encontrar. */
  esperado: number;
  /** Soma do que foi contado de verdade. */
  contado: number;
  /** Contado menos esperado no período inteiro. */
  diferenca: number;
  /** Quantos fecharam certinho, quantos com falta e quantos com sobra. */
  conferem: number;
  faltas: number;
  sobras: number;
  /** A maior falta de um único dia, em módulo. Zero quando não houve falta. */
  maiorFalta: number;
  /** O caixa da maior falta, para não ter que procurar na tabela. */
  maiorFaltaEm: string;
};

/**
 * O resumo do período.
 *
 * A soma das diferenças é reportada junto do número de faltas de propósito: um
 * mês em que faltaram R$ 50 numa terça e sobraram R$ 50 numa quinta fecha em
 * zero, e olhar só o total diria que está tudo bem. São dois erros, não nenhum.
 */
export function cashHistorySummary(sessions: CashSession[]): CashHistorySummary {
  const diferencaDe = (session: CashSession) =>
    session.difference ?? round2((session.countedAmount ?? 0) - (session.expectedAmount ?? 0));

  let esperado = 0, contado = 0, diferenca = 0;
  let conferem = 0, faltas = 0, sobras = 0, maiorFalta = 0, maiorFaltaEm = "";

  sessions.forEach((session) => {
    const gap = diferencaDe(session);
    esperado += session.expectedAmount ?? 0;
    contado += session.countedAmount ?? 0;
    diferenca += gap;
    const rotulo = differenceLabel(gap);
    if (rotulo === "Confere") conferem += 1;
    else if (rotulo === "Falta") {
      faltas += 1;
      if (Math.abs(gap) > maiorFalta) { maiorFalta = Math.abs(gap); maiorFaltaEm = session.id; }
    } else sobras += 1;
  });

  return {
    caixas: sessions.length,
    esperado: round2(esperado),
    contado: round2(contado),
    diferenca: round2(diferenca),
    conferem, faltas, sobras,
    maiorFalta: round2(maiorFalta),
    maiorFaltaEm,
  };
}

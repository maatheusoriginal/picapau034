import type { AccountRecord, AccountSettlement, ExpenseRecord, OrderRecord, SaleRecord, ServiceOrderItem } from "./types";

/**
 * Cálculos do financeiro da oficina, em um lugar só.
 *
 * Antes cada tela tinha o seu próprio "R$ 0,00" escrito no código — eram 30
 * valores fixos entre a Visão geral, o Financeiro, as Contas a receber/pagar e
 * os Relatórios. Como agora existem dados de verdade (vendas do PDV, serviços
 * rápidos, OS finalizadas e gastos), os números saem daqui e todas as telas
 * concordam entre si.
 *
 * São funções puras de propósito: não tocam no Firebase nem no React, então dá
 * para conferir o resultado com dados na mão.
 */

/**
 * Formas de pagamento que NÃO colocam dinheiro no caixa no momento da venda.
 *
 * "Troca de serviços" é compensação: quita a dívida sem entrada de dinheiro —
 * é o que a própria tela de pagamento já explica ("Entrada em caixa: R$ 0,00").
 * "Nota a prazo" entra depois, e por isso vira conta a receber.
 */
export const NON_CASH_PAYMENT_METHODS = ["Troca de serviços", "Nota a prazo"];

export function isCashPayment(method: string | undefined): boolean {
  return !NON_CASH_PAYMENT_METHODS.includes((method ?? "").trim());
}

export function isCreditPayment(method: string | undefined): boolean {
  return (method ?? "").trim() === "Nota a prazo";
}

/** Data de hoje no formato dd/mm/aaaa, o mesmo que os registros gravam. */
export function todayBR(): string {
  return new Date().toLocaleDateString("pt-BR");
}

/** Converte "dd/mm/aaaa" em Date. Devolve null para texto vazio ou inválido. */
export function parseBRDate(value: string | undefined): Date | null {
  const parts = (value ?? "").trim().split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Meia-noite de hoje, para comparar datas sem a interferência do horário. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isSameMonth(value: string | undefined): boolean {
  const date = parseBRDate(value);
  const now = new Date();
  return Boolean(date) && date!.getMonth() === now.getMonth() && date!.getFullYear() === now.getFullYear();
}

/** Uma entrada ou saída de dinheiro, já normalizada para as listas e somas. */
export type FinanceEntry = {
  id: string;
  /** "Venda do balcão", "Serviço rápido" ou "Ordem de serviço". */
  source: string;
  person: string;
  description: string;
  date: string;
  /** Valor cheio cobrado do cliente. */
  total: number;
  /** Valor que sobra depois da taxa da maquininha. Igual ao total quando não houve taxa. */
  net: number;
  fee: number;
  method: string;
  /** Custo das peças desta entrada. */
  cost: number;
};

/** Custo das peças de uma venda ou OS, conforme gravado no momento em que ela foi fechada. */
function itemsCost(items: ServiceOrderItem[] | undefined): number {
  return (items ?? []).reduce((total, item) => total + (item.cost ?? 0), 0);
}

function saleEntry(sale: SaleRecord): FinanceEntry {
  const fee = sale.fee ?? 0;
  return {
    id: sale.id,
    source: sale.origin === "PDV" ? "Venda do balcão" : "Serviço rápido",
    person: sale.customer || "Consumidor final",
    description: sale.items.map((item) => item.name).join(", ") || sale.origin,
    date: sale.date,
    total: sale.total,
    net: sale.net ?? sale.total - fee,
    fee,
    method: sale.paymentMethod,
    cost: itemsCost(sale.items),
  };
}

function orderEntry(order: OrderRecord): FinanceEntry {
  const total = order.total ?? 0;
  return {
    id: order.id,
    source: "Ordem de serviço",
    person: order.customer,
    description: `${order.bike}${order.plate ? ` · ${order.plate}` : ""}`,
    date: order.closedAt ?? "",
    total,
    // A OS não guarda taxa de maquininha: o encerramento registra a forma de
    // pagamento, e o desconto da máquina é acompanhado pelas vendas do PDV.
    net: total,
    fee: 0,
    method: order.paymentMethod ?? "",
    cost: itemsCost(order.items),
  };
}

/** Tudo que já virou dinheiro: vendas e OS encerradas em forma de pagamento à vista. */
export function revenueEntries(sales: SaleRecord[], orders: OrderRecord[]): FinanceEntry[] {
  return [
    ...sales.map(saleEntry),
    ...orders.filter((order) => order.closed).map(orderEntry),
  ].filter((entry) => isCashPayment(entry.method));
}

/** Vendas e OS fechadas em "Nota a prazo": o serviço saiu, o dinheiro ainda não entrou. */
export function receivableEntries(sales: SaleRecord[], orders: OrderRecord[]): FinanceEntry[] {
  return [
    ...sales.map(saleEntry),
    ...orders.filter((order) => order.closed).map(orderEntry),
  ].filter((entry) => isCreditPayment(entry.method));
}

// ---------------------------------------------------------------------------
// Contas a receber e a pagar
// ---------------------------------------------------------------------------

/** Quanto já foi baixado nesta conta. */
export function accountPaid(account: Pick<AccountRecord, "settlements">): number {
  return (account.settlements ?? []).reduce((total, settlement) => total + (settlement.amount || 0), 0);
}

/** Quanto ainda falta. Nunca negativo: baixa a maior não vira crédito na conta. */
export function accountOpen(account: Pick<AccountRecord, "amount" | "settlements">): number {
  return Math.max(0, round2(account.amount - accountPaid(account)));
}

export function accountIsSettled(account: Pick<AccountRecord, "amount" | "settlements">): boolean {
  return accountOpen(account) <= 0;
}

/**
 * Situação da conta. "Parcial" tem prioridade sobre o vencimento porque é a
 * informação que muda a conversa com o cliente: já pagou parte.
 */
export function accountStatus(account: Pick<AccountRecord, "amount" | "dueDate" | "settlements">): string {
  if (accountIsSettled(account)) return "Quitado";
  if (accountPaid(account) > 0) return "Parcial";
  return payableStatus(account.dueDate);
}

/** Contas em aberto de um tipo, da mais vencida para a mais distante. */
export function openAccounts(accounts: AccountRecord[], kind: AccountRecord["kind"]): AccountRecord[] {
  return accounts
    .filter((account) => account.kind === kind && !accountIsSettled(account))
    .sort((a, b) => (parseBRDate(a.dueDate)?.getTime() ?? 0) - (parseBRDate(b.dueDate)?.getTime() ?? 0));
}

/** Todas as baixas de um tipo de conta, para somar o que entrou ou saiu de caixa. */
export function settlementsOf(accounts: AccountRecord[], kind: AccountRecord["kind"]): AccountSettlement[] {
  return accounts.filter((account) => account.kind === kind).flatMap((account) => account.settlements ?? []);
}

/**
 * Divide um valor em parcelas com vencimento mensal.
 *
 * Os centavos da divisão vão para a PRIMEIRA parcela: R$ 100 em 3 vezes dá
 * 33,34 + 33,33 + 33,33. Sobrar centavo na última faria a conta fechar com
 * diferença justamente na parcela que o cliente confere no fim.
 */
export function splitInstallments(total: number, count: number, firstDueDate: string): Array<{ amount: number; dueDate: string; installment: number }> {
  const parts = Math.max(1, Math.floor(count));
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const rest = cents - base * parts;
  const start = parseBRDate(firstDueDate) ?? new Date();

  return Array.from({ length: parts }, (_unused, index) => {
    const due = new Date(start.getFullYear(), start.getMonth() + index, start.getDate());
    return {
      amount: (base + (index === 0 ? rest : 0)) / 100,
      dueDate: due.toLocaleDateString("pt-BR"),
      installment: index + 1,
    };
  });
}

export type PayableStatus = "Atrasado" | "Vence hoje" | "A vencer";

export function payableStatus(dueDate: string | undefined): PayableStatus {
  const date = parseBRDate(dueDate);
  if (!date) return "A vencer";
  const today = startOfToday();
  if (date.getTime() < today.getTime()) return "Atrasado";
  if (date.getTime() === today.getTime()) return "Vence hoje";
  return "A vencer";
}

/**
 * Contas a pagar: os gastos agendados, já classificados por vencimento.
 * Antes todos entravam como "A vencer" fixo, então uma conta vencida nunca
 * aparecia como atrasada e o total "Vencido" ficava sempre em R$ 0,00.
 */
export function payableEntries(expenses: ExpenseRecord[], accounts: AccountRecord[] = []) {
  const fromExpenses = expenses
    .filter((expense) => expense.status === "Agendado")
    .map((expense) => ({
      id: expense.id,
      person: expense.category || "Despesa manual",
      description: expense.description,
      dueDate: expense.dueDate,
      original: expense.amount,
      open: expense.amount,
      status: payableStatus(expense.dueDate) as string,
    }));

  const fromAccounts = openAccounts(accounts, "pagar").map((account) => ({
    id: account.id,
    person: account.person || account.category || "Favorecido",
    description: accountDescription(account),
    dueDate: account.dueDate,
    original: account.amount,
    open: accountOpen(account),
    status: accountStatus(account),
  }));

  return [...fromAccounts, ...fromExpenses];
}

/** Descrição com a parcela, quando o lançamento foi parcelado. */
export function accountDescription(account: Pick<AccountRecord, "description" | "installment" | "installments">): string {
  return account.installments > 1
    ? `${account.description} · parcela ${account.installment}/${account.installments}`
    : account.description;
}

/** Contas a receber em aberto, no mesmo formato das contas a pagar. */
export function receivableAccountEntries(accounts: AccountRecord[]) {
  return openAccounts(accounts, "receber").map((account) => ({
    id: account.id,
    person: account.person || "Cliente",
    description: accountDescription(account),
    dueDate: account.dueDate,
    original: account.amount,
    open: accountOpen(account),
    status: accountStatus(account),
  }));
}

export type FinanceSummary = {
  /** Entrou em caixa hoje, já descontada a taxa da maquininha. */
  receivedToday: number;
  /** Total bruto recebido hoje, antes da taxa. */
  grossToday: number;
  /** Quantidade de vendas de hoje (PDV e serviço rápido). */
  salesTodayCount: number;
  /** Recebido acumulado, líquido. */
  receivedTotal: number;
  /** Faturamento bruto acumulado. */
  grossTotal: number;
  /** Faturamento bruto do mês corrente. */
  grossMonth: number;
  /** Soma das taxas de maquininha já pagas. */
  cardFees: number;
  /** Custo das peças vendidas, gravado no item no momento da venda. */
  partsCost: number;
  /** Valor médio por venda/OS recebida. */
  averageTicket: number;
  /** Gastos já pagos. */
  paidExpenses: number;
  /** Gastos pagos hoje. */
  paidExpensesToday: number;
  /** Contas a pagar em aberto. */
  pendingExpenses: number;
  /** Contas a pagar já vencidas. */
  overdueExpenses: number;
  /** Quantidade de contas a pagar vencidas. */
  overdueCount: number;
  /** Total a receber de vendas e OS a prazo. */
  receivableTotal: number;
  /** Saldo acumulado: o que entrou menos o que já foi pago. */
  cashBalance: number;
  /** Saldo do dia: entradas de hoje menos gastos pagos hoje. */
  dayBalance: number;
  /** Lucro líquido: recebido (já sem a taxa da maquininha) menos gastos pagos e o custo das peças. */
  netProfit: number;
  /** OS encerradas. */
  closedOrders: number;
};

export function financeSummary(
  sales: SaleRecord[],
  orders: OrderRecord[],
  expenses: ExpenseRecord[],
  accounts: AccountRecord[] = [],
): FinanceSummary {
  const today = todayBR();
  const revenue = revenueEntries(sales, orders);
  const revenueToday = revenue.filter((entry) => entry.date === today);

  const sum = (entries: FinanceEntry[], field: "total" | "net" | "fee" | "cost") => entries.reduce((total, entry) => total + entry[field], 0);

  const grossTotal = sum(revenue, "total");
  const receivedTotal = sum(revenue, "net");
  const cardFees = sum(revenue, "fee");
  const partsCost = sum(revenue, "cost");
  const grossMonth = revenue.filter((entry) => isSameMonth(entry.date)).reduce((total, entry) => total + entry.total, 0);

  const paidExpenseRecords = expenses.filter((expense) => expense.status === "Pago");
  const paidExpenses = paidExpenseRecords.reduce((total, expense) => total + expense.amount, 0);
  const paidExpensesToday = paidExpenseRecords.filter((expense) => expense.dueDate === today).reduce((total, expense) => total + expense.amount, 0);

  // Baixas de contas a receber são entrada de caixa; baixas de contas a pagar
  // são saída. Sem isso, quitar uma nota a prazo não apareceria em lugar nenhum.
  const receivedSettlements = settlementsOf(accounts, "receber");
  const paidSettlements = settlementsOf(accounts, "pagar");
  const settlementTotal = (list: AccountSettlement[], onlyToday: boolean) => list
    .filter((settlement) => !onlyToday || settlement.date === today)
    .reduce((total, settlement) => total + settlement.amount, 0);

  const payables = payableEntries(expenses, accounts);
  const overdue = payables.filter((entry) => entry.status === "Atrasado");

  const receivedToday = sum(revenueToday, "net") + settlementTotal(receivedSettlements, true);

  const receivedFromAccounts = settlementTotal(receivedSettlements, false);
  const paidFromAccounts = settlementTotal(paidSettlements, false);
  const totalReceived = receivedTotal + receivedFromAccounts;
  const totalPaid = paidExpenses + paidFromAccounts;
  const totalPaidToday = paidExpensesToday + settlementTotal(paidSettlements, true);

  return {
    receivedToday,
    grossToday: sum(revenueToday, "total") + settlementTotal(receivedSettlements, true),
    salesTodayCount: revenueToday.length + receivedSettlements.filter((settlement) => settlement.date === today).length,
    receivedTotal: totalReceived,
    grossTotal,
    grossMonth,
    cardFees,
    partsCost,
    averageTicket: revenue.length ? grossTotal / revenue.length : 0,
    paidExpenses: totalPaid,
    paidExpensesToday: totalPaidToday,
    pendingExpenses: payables.reduce((total, entry) => total + entry.open, 0),
    overdueExpenses: overdue.reduce((total, entry) => total + entry.open, 0),
    overdueCount: overdue.length,
    // Sai das contas em aberto. Deduzir das vendas a prazo, como antes, fazia o
    // valor nunca zerar: não havia onde registrar que o cliente pagou.
    receivableTotal: openAccounts(accounts, "receber").reduce((total, account) => total + accountOpen(account), 0),
    cashBalance: totalReceived - totalPaid,
    dayBalance: receivedToday - totalPaidToday,
    netProfit: totalReceived - totalPaid - partsCost,
    closedOrders: orders.filter((order) => order.closed).length,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

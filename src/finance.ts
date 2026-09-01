import type { AccountRecord, AccountSettlement, ExpenseRecord, MovementRecord, OrderRecord, SalePayment, SaleRecord, ServiceOrderItem } from "./types";

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
 * "Nota a prazo" entra depois, e por isso vira conta a receber. "Faturado no
 * parceiro" é o mesmo caso da nota, só que o prazo é o fechamento do mês da
 * empresa: a moto sai da oficina hoje, o dinheiro vem na fatura.
 */
export const PARTNER_PAYMENT_METHOD = "Faturado no parceiro";

export const NON_CASH_PAYMENT_METHODS = ["Troca de serviços", "Nota a prazo", PARTNER_PAYMENT_METHOD];

export function isCashPayment(method: string | undefined): boolean {
  return !NON_CASH_PAYMENT_METHODS.includes((method ?? "").trim());
}

export function isCreditPayment(method: string | undefined): boolean {
  const forma = (method ?? "").trim();
  // "Faturado no parceiro" é a prazo pelo mesmo motivo da nota: o serviço saiu,
  // o dinheiro entra na fatura do mês seguinte. Assim a OS da frota não conta
  // como faturamento recebido, não entra na gaveta do caixa e aparece em
  // Contas a receber — tudo pelo caminho que já existia.
  return forma === "Nota a prazo" || forma === PARTNER_PAYMENT_METHOD;
}

// ---------------------------------------------------------------------------
// Pagamento dividido
// ---------------------------------------------------------------------------

/**
 * As partes do pagamento de uma venda ou OS, sempre como lista.
 *
 * É o adaptador que faz todo o resto do sistema funcionar sem saber se o
 * pagamento foi dividido — e, principalmente, sem quebrar as vendas antigas,
 * que têm só `paymentMethod` e nenhuma lista. Uma venda antiga vira uma lista
 * de um item só.
 */
export function paymentsOf(record: { total?: number; paymentMethod?: string; payments?: SalePayment[]; fee?: number; machineName?: string; installments?: number }): SalePayment[] {
  const parts = record.payments ?? [];
  if (parts.length) return parts;
  return [{
    method: record.paymentMethod ?? "",
    amount: record.total ?? 0,
    fee: record.fee ?? 0,
    machineName: record.machineName,
    installments: record.installments,
  }];
}

/** Quanto entrou em espécie — o único valor que a gaveta do caixa deve esperar. */
export function drawerTotal(payments: SalePayment[]): number {
  return round2(payments.filter((part) => part.method.trim() === "Dinheiro").reduce((total, part) => total + part.amount, 0));
}

/** Quanto ficou a prazo, e por isso vira conta a receber em vez de dinheiro agora. */
export function creditTotal(payments: SalePayment[]): number {
  return round2(payments.filter((part) => isCreditPayment(part.method)).reduce((total, part) => total + part.amount, 0));
}

/**
 * Quanto virou dinheiro de fato, em qualquer forma (espécie, PIX, cartão).
 *
 * Fica de fora o que foi a prazo e o que foi trocado por serviço: nenhum dos
 * dois colocou dinheiro em lugar nenhum no momento da venda.
 */
export function settledTotal(payments: SalePayment[]): number {
  return round2(payments.filter((part) => isCashPayment(part.method)).reduce((total, part) => total + part.amount, 0));
}

/** Soma das taxas de maquininha das partes no cartão. */
export function feeTotal(payments: SalePayment[]): number {
  return round2(payments.reduce((total, part) => total + (part.fee ?? 0), 0));
}

/**
 * O que impede o pagamento dividido de ser aceito.
 *
 * A soma das partes tem que fechar com o total, ao centavo. Aceitar diferença
 * seria gravar uma venda que não bate com o que o cliente pagou — e a sobra ou
 * falta apareceria no fechamento do caixa como se fosse erro de alguém.
 */
export function splitProblem(total: number, payments: SalePayment[]): string {
  const validas = payments.filter((part) => part.amount > 0);
  if (validas.length < 2) return "Informe as duas formas com valor maior que zero.";
  if (validas.some((part) => !part.method.trim())) return "Escolha a forma de cada parte do pagamento.";
  const soma = round2(validas.reduce((sum, part) => sum + part.amount, 0));
  const alvo = round2(total);
  if (soma !== alvo) {
    const falta = round2(alvo - soma);
    return falta > 0
      ? `Faltam ${brl(falta)} para fechar o total de ${brl(alvo)}.`
      : `As partes somam ${brl(soma)}, ${brl(-falta)} a mais que o total.`;
  }
  return "";
}

/** Descrição curta do pagamento, para listas e cupons: "PIX + Dinheiro". */
export function paymentLabel(payments: SalePayment[]): string {
  const validas = payments.filter((part) => part.amount > 0);
  if (validas.length <= 1) return validas[0]?.method ?? "";
  return validas.map((part) => part.method).join(" + ");
}

/** Troco a devolver quando o cliente entrega mais do que deve. */
export function changeFor(due: number, received: number): number {
  return round2(Math.max(0, received - due));
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
  /** Quanto desta venda virou dinheiro agora (o resto ficou a prazo). */
  settled: number;
  /** Quanto ficou a prazo e virou conta a receber. */
  credit: number;
};

/**
 * Desconto que cabe na venda.
 *
 * Desconto maior que o subtotal deixaria o total negativo — a oficina pagando
 * para vender. É recusado, não aparado em silêncio: se alguém digitou 500 num
 * carrinho de 50, o certo é a pessoa ver o erro, e não a venda sair por zero.
 */
export function discountProblem(subtotal: number, discount: number): string {
  if (discount < 0) return "O desconto não pode ser negativo.";
  if (discount > subtotal) return `O desconto não pode passar do subtotal de ${brl(subtotal)}.`;
  return "";
}

/** Total que o cliente paga: o subtotal menos o desconto, nunca negativo. */
export function totalAfterDiscount(subtotal: number, discount: number): number {
  return round2(Math.max(0, subtotal - Math.max(0, discount)));
}

/** Quanto o desconto representa do subtotal, para a tela mostrar. */
export function discountPercent(subtotal: number, discount: number): number {
  if (!(subtotal > 0)) return 0;
  return Math.round((discount / subtotal) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Movimentações lançadas à mão
// ---------------------------------------------------------------------------

export function movementIsIncome(movement: Pick<MovementRecord, "kind">): boolean {
  return movement.kind === "entrada";
}

/** Soma das entradas manuais, opcionalmente só as de hoje. */
export function movementIncome(movements: MovementRecord[], onlyToday = false): number {
  const today = todayBR();
  return round2(movements
    .filter((movement) => movementIsIncome(movement) && (!onlyToday || movement.date === today))
    .reduce((total, movement) => total + movement.amount, 0));
}

/** Soma das saídas manuais, opcionalmente só as de hoje. */
export function movementExpense(movements: MovementRecord[], onlyToday = false): number {
  const today = todayBR();
  return round2(movements
    .filter((movement) => !movementIsIncome(movement) && (!onlyToday || movement.date === today))
    .reduce((total, movement) => total + movement.amount, 0));
}

/** O que impede a movimentação de ser lançada. */
export function movementProblem(amount: number, category: string, description: string): string {
  if (!(amount > 0)) return "Informe um valor maior que zero.";
  if (!category.trim()) return "Escolha o motivo da movimentação.";
  if (!description.trim()) return "Descreva a movimentação. Sem isso ninguém entende o lançamento depois.";
  return "";
}

/** Custo das peças de uma venda ou OS, conforme gravado no momento em que ela foi fechada. */
function itemsCost(items: ServiceOrderItem[] | undefined): number {
  return (items ?? []).reduce((total, item) => total + (item.cost ?? 0), 0);
}

function saleEntry(sale: SaleRecord): FinanceEntry {
  const parts = paymentsOf(sale);
  const dividido = Boolean(sale.payments?.length);
  const fee = dividido ? feeTotal(parts) : (sale.fee ?? 0);
  // `settled` é o que virou dinheiro AGORA. Numa venda dividida entre PIX e
  // nota a prazo, só a parte do PIX entrou; o resto virou conta a receber.
  const settled = dividido ? settledTotal(parts) : (isCashPayment(sale.paymentMethod) ? sale.total : 0);
  return {
    id: sale.id,
    source: sale.origin === "PDV" ? "Venda do balcão" : "Serviço rápido",
    person: sale.customer || "Consumidor final",
    description: sale.items.map((item) => item.name).join(", ") || sale.origin,
    date: sale.date,
    total: sale.total,
    net: dividido ? round2(settled - fee) : (sale.net ?? sale.total - fee),
    fee,
    method: paymentLabel(parts) || sale.paymentMethod,
    cost: itemsCost(sale.items),
    settled,
    credit: dividido ? creditTotal(parts) : (isCreditPayment(sale.paymentMethod) ? sale.total : 0),
  };
}

function orderEntry(order: OrderRecord): FinanceEntry {
  const total = order.total ?? 0;
  const parts = paymentsOf(order);
  const dividido = Boolean(order.payments?.length);
  const settled = dividido ? settledTotal(parts) : (isCashPayment(order.paymentMethod) ? total : 0);
  return {
    id: order.id,
    source: "Ordem de serviço",
    person: order.customer,
    description: `${order.bike}${order.plate ? ` · ${order.plate}` : ""}`,
    date: order.closedAt ?? "",
    total,
    // A OS não guarda taxa de maquininha: o encerramento registra a forma de
    // pagamento, e o desconto da máquina é acompanhado pelas vendas do PDV.
    net: settled,
    fee: 0,
    method: paymentLabel(parts) || (order.paymentMethod ?? ""),
    cost: itemsCost(order.items),
    settled,
    credit: dividido ? creditTotal(parts) : (isCreditPayment(order.paymentMethod) ? total : 0),
  };
}

function allEntries(sales: SaleRecord[], orders: OrderRecord[]): FinanceEntry[] {
  return [...sales.map(saleEntry), ...orders.filter((order) => order.closed).map(orderEntry)];
}

/**
 * Tudo que já virou dinheiro.
 *
 * Uma venda dividida entre PIX e nota a prazo entra aqui pela parte do PIX E
 * na lista de a receber pela parte fiada — as duas coisas são verdade ao mesmo
 * tempo, e é isso que o "dividir pagamento" significa.
 */
export function revenueEntries(sales: SaleRecord[], orders: OrderRecord[]): FinanceEntry[] {
  return allEntries(sales, orders).filter((entry) => entry.settled > 0);
}

/** Vendas e OS com parte a prazo: o serviço saiu, esse pedaço do dinheiro não entrou. */
export function receivableEntries(sales: SaleRecord[], orders: OrderRecord[]): FinanceEntry[] {
  return allEntries(sales, orders).filter((entry) => entry.credit > 0);
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
  /** Entradas lançadas à mão (sucata, aporte, reembolso). */
  manualIncome: number;
  /** Saídas lançadas à mão. */
  manualExpense: number;
  /** Desconto concedido nas vendas. */
  discountGiven: number;
};

export function financeSummary(
  sales: SaleRecord[],
  orders: OrderRecord[],
  expenses: ExpenseRecord[],
  accounts: AccountRecord[] = [],
  movements: MovementRecord[] = [],
): FinanceSummary {
  const today = todayBR();
  const revenue = revenueEntries(sales, orders);
  const revenueToday = revenue.filter((entry) => entry.date === today);

  const sum = (entries: FinanceEntry[], field: "total" | "net" | "fee" | "cost" | "settled") => entries.reduce((total, entry) => total + entry[field], 0);

  // "settled", e não "total": numa venda dividida, a parte fiada ainda não é
  // dinheiro. Ela entra no faturamento quando o cliente pagar, pela baixa da
  // conta a receber — somar as duas coisas contaria o mesmo dinheiro duas vezes.
  const grossTotal = sum(revenue, "settled");
  const receivedTotal = sum(revenue, "net");
  const cardFees = sum(revenue, "fee");
  const partsCost = sum(revenue, "cost");
  const grossMonth = revenue.filter((entry) => isSameMonth(entry.date)).reduce((total, entry) => total + entry.settled, 0);

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

  // Movimentações manuais mexem no dinheiro, mas NÃO no faturamento: aporte do
  // dono e venda de sucata não são serviço prestado, e somá-los ao faturamento
  // estragaria o ticket médio e a leitura de como a oficina está vendendo.
  const manualIncome = movementIncome(movements);
  const manualExpense = movementExpense(movements);

  const receivedToday = sum(revenueToday, "net") + settlementTotal(receivedSettlements, true) + movementIncome(movements, true);

  const receivedFromAccounts = settlementTotal(receivedSettlements, false);
  const paidFromAccounts = settlementTotal(paidSettlements, false);
  const totalReceived = receivedTotal + receivedFromAccounts + manualIncome;
  const totalPaid = paidExpenses + paidFromAccounts + manualExpense;
  const totalPaidToday = paidExpensesToday + settlementTotal(paidSettlements, true) + movementExpense(movements, true);

  return {
    receivedToday,
    grossToday: sum(revenueToday, "settled") + settlementTotal(receivedSettlements, true),
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
    manualIncome,
    manualExpense,
    // O desconto sai do que foi gravado na venda: recalcular pelos itens daria
    // outro número se o preço da peça mudar no cadastro depois.
    discountGiven: round2(sales.reduce((total, sale) => total + (sale.discount ?? 0), 0)),
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

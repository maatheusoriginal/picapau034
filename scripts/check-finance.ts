/**
 * Confere as contas do financeiro com um cenário montado à mão.
 *
 * Não é uma suíte de testes — o projeto não tem uma. É uma verificação das
 * regras que mais doem se estiverem erradas, porque tratam de dinheiro:
 * o que entra em caixa, o que fica a receber, o que já venceu e quanto sobra.
 *
 * Rode com: npm run check:finance
 */
import {
  accountOpen,
  accountPaid,
  accountStatus,
  discountPercent,
  discountProblem,
  financeSummary,
  movementExpense,
  movementIncome,
  movementProblem,
  openAccounts,
  payableEntries,
  payableStatus,
  receivableEntries,
  receivableAccountEntries,
  splitInstallments,
  totalAfterDiscount,
} from "../src/finance";
import type { AccountRecord, ExpenseRecord, MovementRecord, OrderRecord, SaleRecord } from "../src/types";

const hoje = new Date().toLocaleDateString("pt-BR");
const ontem = new Date(Date.now() - 86400000).toLocaleDateString("pt-BR");
const amanha = new Date(Date.now() + 86400000).toLocaleDateString("pt-BR");

const sales: SaleRecord[] = [
  // Venda no cartão: R$ 100 com 3% de taxa -> líquido 97. Peça custou 40.
  { id: "VEN-0001", origin: "PDV", items: [{ id: "p1", type: "Peça", name: "Óleo", price: 100, quantity: 1, cost: 40 }],
    total: 100, paymentMethod: "Crédito", fee: 3, net: 97, date: hoje, soldAt: new Date().toISOString() },
  // Serviço rápido em dinheiro, hoje, sem peça.
  { id: "VEN-0002", origin: "Serviço rápido", items: [{ id: "s1", type: "Mão de obra", name: "Troca", price: 50 }],
    total: 50, paymentMethod: "Dinheiro", date: hoje, soldAt: new Date().toISOString() },
  // A prazo: não entra em caixa, vira conta a receber.
  { id: "VEN-0003", origin: "PDV", items: [{ id: "p2", type: "Peça", name: "Pastilha", price: 80, quantity: 1, cost: 30 }],
    total: 80, paymentMethod: "Nota a prazo", date: hoje, soldAt: new Date().toISOString() },
  // Troca de serviços: quita sem dinheiro. Não entra em caixa nem a receber.
  { id: "VEN-0004", origin: "PDV", items: [{ id: "p3", type: "Peça", name: "Cabo", price: 20, quantity: 1, cost: 5 }],
    total: 20, paymentMethod: "Troca de serviços", date: hoje, soldAt: new Date().toISOString() },
  // Venda de ontem, em dinheiro: entra no acumulado, não no "hoje".
  { id: "VEN-0005", origin: "PDV", items: [{ id: "p4", type: "Peça", name: "Vela", price: 30, quantity: 1, cost: 10 }],
    total: 30, paymentMethod: "Dinheiro", date: ontem, soldAt: new Date().toISOString() },
];

const orders: OrderRecord[] = [
  // OS encerrada hoje, em PIX: entra.
  { id: "OS-0001", customer: "João", bike: "CG 160", plate: "ABC-1234", mechanic: "Zé", mechanicIds: [], time: "", status: "Entrega", tone: "green",
    total: 200, closed: true, closedAt: hoje, paymentMethod: "PIX", items: [{ id: "p5", type: "Peça", name: "Kit", price: 120, cost: 70 }] },
  // OS ainda aberta: não conta como faturamento.
  { id: "OS-0002", customer: "Ana", bike: "Fan", plate: "DEF-5678", mechanic: "Zé", mechanicIds: [], time: "", status: "Em serviço", tone: "amber", total: 500 },
];

const expenses: ExpenseRecord[] = [
  { id: "G1", description: "Peça avulsa", category: "Peça", amount: 60, dueDate: hoje, status: "Pago", method: "Dinheiro" },
  { id: "G2", description: "Aluguel", category: "Fixo", amount: 900, dueDate: ontem, status: "Agendado", method: "Banco" },
  { id: "G3", description: "Internet", category: "Fixo", amount: 100, dueDate: hoje, status: "Agendado", method: "Banco" },
  { id: "G4", description: "Fornecedor", category: "Peça", amount: 300, dueDate: amanha, status: "Agendado", method: "Banco" },
];

const accounts: AccountRecord[] = [
  // Nota a prazo de R$ 80 gerada pela venda, ainda sem baixa.
  { id: "CR-0001", kind: "receber", person: "João", description: "Venda VEN-0003", category: "Venda de peças",
    amount: 80, dueDate: amanha, settlements: [], origin: "Venda", sourceId: "VEN-0003", installment: 1, installments: 1 },
  // Conta a receber com baixa parcial: R$ 200, recebidos R$ 50 hoje.
  { id: "CR-0002", kind: "receber", person: "Parceiro Moto Center", description: "Acerto mensal", category: "Serviços de oficina",
    amount: 200, dueDate: hoje, origin: "Manual", installment: 1, installments: 1,
    settlements: [{ date: hoje, settledAt: new Date().toISOString(), amount: 50, method: "PIX" }] },
  // Conta a receber já quitada: sai da lista e não conta mais no "a receber".
  { id: "CR-0003", kind: "receber", person: "Ana", description: "Serviço antigo", category: "Serviços de oficina",
    amount: 120, dueDate: ontem, origin: "Manual", installment: 1, installments: 1,
    settlements: [{ date: ontem, settledAt: new Date().toISOString(), amount: 120, method: "Dinheiro" }] },
  // Conta a pagar lançada à mão, com baixa parcial de R$ 100 hoje.
  { id: "CP-0001", kind: "pagar", person: "Fornecedor Peças SA", description: "Compra parcelada", category: "Fornecedor de peças",
    amount: 400, dueDate: amanha, origin: "Manual", installment: 2, installments: 3,
    settlements: [{ date: hoje, settledAt: new Date().toISOString(), amount: 100, method: "Transferência" }] },
];

// Movimentações lançadas à mão, para conferir que mexem no dinheiro sem
// mexer no faturamento.
const movimentacoes = [
  { id: "MOV-0001", kind: "entrada", amount: 40, category: "Venda de sucata", method: "Dinheiro", description: "Ferro velho", date: hoje, at: new Date().toISOString() },
  { id: "MOV-0002", kind: "saida", amount: 25, category: "Frete", method: "Dinheiro", description: "Motoboy", date: hoje, at: new Date().toISOString() },
  { id: "MOV-0003", kind: "entrada", amount: 100, category: "Aporte do dono", method: "PIX", description: "Capital", date: ontem, at: new Date(Date.now() - 86400000).toISOString() },
] as unknown as MovementRecord[];

const s = financeSummary(sales, orders, expenses, accounts);
const sm = financeSummary(sales, orders, expenses, accounts, movimentacoes);
const conta = accounts[1]!;
const parcelas = splitInstallments(100, 3, hoje);
const esperado = {
  "recebido hoje: vendas (347) + baixa recebida (50)": [s.receivedToday, 397],
  "bruto hoje: vendas (350) + baixa recebida (50)": [s.grossToday, 400],
  "movimentações hoje: 3 vendas + 1 baixa": [s.salesTodayCount, 4],
  "recebido acumulado: vendas (377) + baixas (50 + 120)": [s.receivedTotal, 547],
  "faturamento bruto (350 + 30)": [s.grossTotal, 380],
  "taxas de maquininha": [s.cardFees, 3],
  "custo das peças (40 + 70 + 10)": [s.partsCost, 120],
  "a receber: conta da venda (80) + saldo do acerto (150)": [s.receivableTotal, 230],
  "gastos pagos: gasto (60) + baixa de conta a pagar (100)": [s.paidExpenses, 160],
  "a pagar: gastos agendados (1300) + saldo da conta (300)": [s.pendingExpenses, 1600],
  "vencido (só o aluguel de ontem)": [s.overdueExpenses, 900],
  "qtd vencidas": [s.overdueCount, 1],
  "saldo do caixa: recebido (547) - pago (160)": [s.cashBalance, 387],
  "saldo do dia: recebido hoje (397) - pago hoje (160)": [s.dayBalance, 237],
  "lucro: recebido (547) - pago (160) - custo das peças (120)": [s.netProfit, 267],
  "OS encerradas": [s.closedOrders, 1],
  "vencimento de ontem": [payableStatus(ontem), "Atrasado"],
  "vencimento de hoje": [payableStatus(hoje), "Vence hoje"],
  "vencimento de amanhã": [payableStatus(amanha), "A vencer"],
  "entradas a receber": [receivableEntries(sales, orders).length, 1],

  // --- Contas a receber e a pagar ---
  "baixa parcial soma o que já entrou": [accountPaid(conta), 50],
  "saldo em aberto desconta a baixa": [accountOpen(conta), 150],
  "conta com baixa parcial fica 'Parcial'": [accountStatus(conta), "Parcial"],
  "conta quitada fica 'Quitado'": [accountStatus(accounts[2]!), "Quitado"],
  "conta sem baixa segue o vencimento": [accountStatus(accounts[0]!), "A vencer"],
  "conta quitada sai da lista de abertas": [openAccounts(accounts, "receber").length, 2],
  "a receber soma só o que falta (80 + 150)": [s.receivableTotal, 230],
  "a receber ignora a conta já quitada": [receivableAccountEntries(accounts).some((e) => e.id === "CR-0003"), false],
  "a parcela aparece na descrição": [receivableAccountEntries(accounts)[0]!.description.includes("parcela"), false],
  "conta parcelada mostra a parcela": [
    payableEntries([], accounts).find((e) => e.id === "CP-0001")!.description,
    "Compra parcelada · parcela 2/3",
  ],

  // Baixas entram e saem do caixa
  "baixa recebida hoje entra no recebido de hoje": [s.receivedToday, 347 + 50],
  "baixa paga hoje entra nos gastos de hoje": [s.paidExpensesToday, 60 + 100],
  "saldo do caixa considera as baixas dos dois lados": [s.cashBalance, 377 + 170 - 60 - 100],
  "a pagar soma gastos agendados e contas lançadas": [s.pendingExpenses, 1300 + 300],

  // Parcelamento
  "divide em três parcelas": [parcelas.length, 3],
  "a soma das parcelas fecha o total": [parcelas.reduce((t, p) => t + p.amount, 0), 100],
  "o centavo da divisão vai para a primeira": [parcelas[0]!.amount, 33.34],
  "as demais ficam iguais": [`${parcelas[1]!.amount}-${parcelas[2]!.amount}`, "33.33-33.33"],
  "parcela única não quebra": [splitInstallments(50, 1, hoje).length, 1],
  "as parcelas são numeradas em ordem": [parcelas.map((p) => p.installment).join(""), "123"],

  // --- Desconto na venda ---
  "desconto abate do subtotal": [totalAfterDiscount(100, 15), 85],
  "sem desconto, o total é o subtotal": [totalAfterDiscount(100, 0), 100],
  "desconto igual ao subtotal zera a venda": [totalAfterDiscount(100, 100), 0],
  "desconto maior que o subtotal é recusado": [discountProblem(100, 150).includes("não pode passar"), true],
  "e não vira venda negativa": [totalAfterDiscount(100, 150), 0],
  "desconto negativo é recusado": [discountProblem(100, -5), "O desconto não pode ser negativo."],
  "desconto que cabe passa": [discountProblem(100, 30), ""],
  "desconto igual ao subtotal ainda passa": [discountProblem(100, 100), ""],
  "o percentual do desconto é mostrado": [discountPercent(200, 30), 15],
  "desconto sobre subtotal zero não divide por zero": [discountPercent(0, 30), 0],

  // --- Movimentação lançada à mão ---
  "entradas manuais somam": [movementIncome(movimentacoes), 140],
  "só as de hoje, quando pedido": [movementIncome(movimentacoes, true), 40],
  "saídas manuais somam": [movementExpense(movimentacoes), 25],
  "movimentação sem valor é recusada": [movementProblem(0, "Sucata", "x"), "Informe um valor maior que zero."],
  "movimentação sem motivo é recusada": [movementProblem(10, "", "x"), "Escolha o motivo da movimentação."],
  "movimentação sem descrição é recusada": [movementProblem(10, "Sucata", "  ").includes("Descreva"), true],
  "movimentação completa passa": [movementProblem(10, "Sucata", "Ferro velho"), ""],

  // Entra no dinheiro, não no faturamento: aporte do dono não é serviço prestado.
  "entrada manual entra no saldo em caixa": [sm.cashBalance - s.cashBalance, 115],
  "e no recebido de hoje": [sm.receivedToday - s.receivedToday, 40],
  "saída manual entra nos gastos pagos": [sm.paidExpenses - s.paidExpenses, 25],
  "mas o faturamento não muda": [sm.grossTotal, s.grossTotal],
  "nem o ticket médio": [sm.averageTicket, s.averageTicket],
  "nem a contagem de vendas do dia": [sm.salesTodayCount, s.salesTodayCount],
  "as entradas manuais aparecem no resumo": [sm.manualIncome, 140],
  "e as saídas também": [sm.manualExpense, 25],
  "sem movimentação, o resumo fica zerado": [s.manualIncome, 0],
};

let falhas = 0;
for (const [nome, [obtido, esperadoValor]] of Object.entries(esperado)) {
  const ok = obtido === esperadoValor;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperadoValor}`);
}
console.log(falhas === 0 ? "\nTodas as contas batem." : `\n${falhas} conta(s) erradas.`);
process.exit(falhas === 0 ? 0 : 1);

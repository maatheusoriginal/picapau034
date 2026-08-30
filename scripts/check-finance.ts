/**
 * Confere as contas do financeiro com um cenário montado à mão.
 *
 * Não é uma suíte de testes — o projeto não tem uma. É uma verificação das
 * regras que mais doem se estiverem erradas, porque tratam de dinheiro:
 * o que entra em caixa, o que fica a receber, o que já venceu e quanto sobra.
 *
 * Rode com: npm run check:finance
 */
import { financeSummary, payableStatus, receivableEntries } from "../src/finance";
import type { ExpenseRecord, OrderRecord, SaleRecord } from "../src/types";

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

const s = financeSummary(sales, orders, expenses);
const esperado = {
  "recebido hoje (líquido: 97 + 50 + 200)": [s.receivedToday, 347],
  "bruto hoje (100 + 50 + 200)": [s.grossToday, 350],
  "movimentações hoje": [s.salesTodayCount, 3],
  "recebido acumulado (347 + 30)": [s.receivedTotal, 377],
  "faturamento bruto (350 + 30)": [s.grossTotal, 380],
  "taxas de maquininha": [s.cardFees, 3],
  "custo das peças (40 + 70 + 10)": [s.partsCost, 120],
  "a receber (só a nota a prazo)": [s.receivableTotal, 80],
  "gastos pagos": [s.paidExpenses, 60],
  "a pagar (900 + 100 + 300)": [s.pendingExpenses, 1300],
  "vencido (só o aluguel de ontem)": [s.overdueExpenses, 900],
  "qtd vencidas": [s.overdueCount, 1],
  "saldo do caixa (377 - 60)": [s.cashBalance, 317],
  "saldo do dia (347 - 60)": [s.dayBalance, 287],
  "lucro (377 - 60 - 120)": [s.netProfit, 197],
  "OS encerradas": [s.closedOrders, 1],
  "vencimento de ontem": [payableStatus(ontem), "Atrasado"],
  "vencimento de hoje": [payableStatus(hoje), "Vence hoje"],
  "vencimento de amanhã": [payableStatus(amanha), "A vencer"],
  "entradas a receber": [receivableEntries(sales, orders).length, 1],
};

let falhas = 0;
for (const [nome, [obtido, esperadoValor]] of Object.entries(esperado)) {
  const ok = obtido === esperadoValor;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperadoValor}`);
}
console.log(falhas === 0 ? "\nTodas as contas batem." : `\n${falhas} conta(s) erradas.`);
process.exit(falhas === 0 ? 0 : 1);

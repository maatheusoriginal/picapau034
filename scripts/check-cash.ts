/**
 * Confere o caixa da oficina.
 *
 * É o script que mais importa dos cinco: o fechamento de caixa é o único
 * momento em que a oficina compara o que o sistema diz com o dinheiro que
 * está na mão. Se a conta do esperado estiver errada, o número acusa falta
 * todo dia, ninguém olha mais para ele, e aí um desvio de verdade some no
 * meio do ruído.
 *
 * Rode com: npm run check:cash
 */
import { buildMovement, canOpenSession, cashHistorySummary, cashDifference, cashSummary, closedSessions, differenceLabel, drawerEntries, drawerOrigins, sessionsInPeriod, isDrawerPayment, movementProblem, nonDrawerTotal, openSession, sessionIsStale, withdrawnTotal } from "../src/cash";
import type { AccountRecord, CashSession, ExpenseRecord, MovementRecord, OrderRecord, SaleRecord } from "../src/types";

const json = (value: unknown) => JSON.stringify(value);

// Um dia de oficina: abre às 8h com R$ 200 de troco e fecha às 18h.
const sessao: CashSession = {
  id: "CX-0001",
  openedAt: "2026-03-10T11:00:00.000Z",
  openedDate: "10/03/2026",
  openingAmount: 200,
  status: "aberto",
  movements: [
    { kind: "Suprimento", amount: 100, reason: "Troco extra", at: "2026-03-10T13:00:00.000Z", date: "10/03/2026" },
    { kind: "Sangria", amount: 300, reason: "Depósito no banco", at: "2026-03-10T17:00:00.000Z", date: "10/03/2026" },
  ],
};

const sales = [
  // Dinheiro na gaveta.
  { id: "VEN-0001", origin: "PDV", customer: "Rayane", items: [], total: 150, paymentMethod: "Dinheiro", date: "10/03/2026", soldAt: "2026-03-10T14:00:00.000Z" },
  // PIX: entrou no negócio, mas não na gaveta.
  { id: "VEN-0002", origin: "PDV", customer: "Carlos", items: [], total: 400, paymentMethod: "PIX", date: "10/03/2026", soldAt: "2026-03-10T15:00:00.000Z" },
  // Cartão, com taxa: também não é gaveta.
  { id: "VEN-0003", origin: "PDV", customer: "Ana", items: [], total: 200, fee: 8, net: 192, paymentMethod: "Crédito", date: "10/03/2026", soldAt: "2026-03-10T15:30:00.000Z" },
  // Fiado: não virou dinheiro em lugar nenhum.
  { id: "VEN-0004", origin: "PDV", customer: "Pedro", items: [], total: 90, paymentMethod: "Nota a prazo", date: "10/03/2026", soldAt: "2026-03-10T16:00:00.000Z" },
  // Dividida: R$ 70 no PIX e R$ 30 em dinheiro. Só os R$ 30 vão para a gaveta.
  { id: "VEN-0005", origin: "PDV", customer: "Sofia", items: [], total: 100, paymentMethod: "PIX", date: "10/03/2026", soldAt: "2026-03-10T16:10:00.000Z",
    payments: [{ method: "PIX", amount: 70 }, { method: "Dinheiro", amount: 30 }] },
  // Dividida entre dinheiro e fiado: entra só o dinheiro.
  { id: "VEN-0006", origin: "PDV", customer: "Tiago", items: [], total: 200, paymentMethod: "Dinheiro", date: "10/03/2026", soldAt: "2026-03-10T16:15:00.000Z",
    payments: [{ method: "Dinheiro", amount: 80 }, { method: "Nota a prazo", amount: 120 }] },
  // Dinheiro, mas ANTES da abertura: é da sessão de ontem.
  { id: "VEN-0000", origin: "PDV", customer: "Ontem", items: [], total: 999, paymentMethod: "Dinheiro", date: "09/03/2026", soldAt: "2026-03-09T20:00:00.000Z" },
] as unknown as SaleRecord[];

const orders = [
  { id: "OS-0001", customer: "João", plate: "ABC-1D23", total: 320, closed: true, paymentMethod: "Dinheiro",
    closedAt: "10/03/2026", closedAtISO: "2026-03-10T16:30:00.000Z" },
  // Ainda aberta: não recebeu nada.
  { id: "OS-0002", customer: "Marta", total: 500, closed: false, paymentMethod: "Dinheiro", closedAtISO: "2026-03-10T16:40:00.000Z" },
  // Fechada no PIX.
  { id: "OS-0003", customer: "Bruno", total: 250, closed: true, paymentMethod: "PIX", closedAt: "10/03/2026", closedAtISO: "2026-03-10T17:10:00.000Z" },
] as unknown as OrderRecord[];

const expenses = [
  { id: "GAS-0001", description: "Almoço da equipe", category: "Alimentação", amount: 60, dueDate: "10/03/2026", status: "Pago", method: "Dinheiro", paidAt: "2026-03-10T15:00:00.000Z" },
  // Pago pelo banco: não sai da gaveta.
  { id: "GAS-0002", description: "Energia", category: "Contas", amount: 300, dueDate: "10/03/2026", status: "Pago", method: "Banco Inter", paidAt: "2026-03-10T15:00:00.000Z" },
  // Ainda não pago.
  { id: "GAS-0003", description: "Aluguel", category: "Contas", amount: 1200, dueDate: "20/03/2026", status: "Agendado", method: "Dinheiro" },
] as unknown as ExpenseRecord[];

const accounts = [
  { id: "CT-0001", kind: "receber", person: "Pedro", description: "Nota a prazo", amount: 90, installment: 1, installments: 1, dueDate: "20/03/2026",
    settlements: [{ date: "10/03/2026", settledAt: "2026-03-10T16:00:00.000Z", amount: 90, method: "Dinheiro" }] },
  { id: "CT-0002", kind: "pagar", person: "Distribuidora", description: "Peças", amount: 400, installment: 1, installments: 1, dueDate: "12/03/2026",
    settlements: [{ date: "10/03/2026", settledAt: "2026-03-10T16:20:00.000Z", amount: 150, method: "Dinheiro" },
                  { date: "10/03/2026", settledAt: "2026-03-10T16:25:00.000Z", amount: 250, method: "PIX" }] },
] as unknown as AccountRecord[];

const movements = [
  // Sucata vendida em dinheiro: passa pela gaveta.
  { id: "MOV-0001", kind: "entrada", amount: 40, category: "Venda de sucata", method: "Dinheiro", description: "Ferro velho", date: "10/03/2026", at: "2026-03-10T15:45:00.000Z" },
  // Frete pago em dinheiro: sai da gaveta.
  { id: "MOV-0002", kind: "saida", amount: 25, category: "Frete e entrega", method: "Dinheiro", description: "Motoboy", date: "10/03/2026", at: "2026-03-10T15:50:00.000Z" },
  // Aporte por PIX: entra no negócio, não na gaveta.
  { id: "MOV-0003", kind: "entrada", amount: 1000, category: "Aporte do dono", method: "PIX", description: "Capital de giro", date: "10/03/2026", at: "2026-03-10T15:55:00.000Z" },
] as unknown as MovementRecord[];

const fontes = { sales, orders, expenses, accounts };
const comMovimentacoes = { ...fontes, movements };
const resumoComMov = cashSummary(sessao, comMovimentacoes);
const extrato = drawerEntries(sessao, fontes);
const resumo = cashSummary(sessao, fontes);

// Esperado: 200 (abertura) + 150 (venda dinheiro) + 30 e 80 (partes em dinheiro
//         das vendas divididas) + 320 (OS dinheiro) + 90 (recebimento em
//         dinheiro) + 100 (suprimento) − 300 (sangria) − 60 (gasto dinheiro)
//         − 150 (baixa em dinheiro) = 460
const esperado = 460;

const sessaoVazia: CashSession = { id: "CX-0002", openedAt: "2026-03-11T11:00:00.000Z", openedDate: "11/03/2026", openingAmount: 150, status: "aberto" };
const historico = [sessao, { ...sessao, id: "CX-0000", status: "fechado", closedAt: "2026-03-09T21:00:00.000Z" },
                   { ...sessao, id: "CX-0009", status: "fechado", closedAt: "2026-03-08T21:00:00.000Z" }] as CashSession[];

// Um dia curto, só para conferir que cada origem cai na sua linha. Fica
// separado do dia cheio de propósito: mexer no cenário grande para provar a
// separação mudaria uma dúzia de outros números sem necessidade.
const sessaoOrigens: CashSession = {
  id: "CX-0003", openedAt: "2026-03-12T11:00:00.000Z", openedDate: "12/03/2026", openingAmount: 100, status: "aberto",
};
const vendasDeOrigem = [
  { id: "VEN-1001", origin: "PDV", customer: "Balcão", items: [], total: 60, paymentMethod: "Dinheiro", date: "12/03/2026", soldAt: "2026-03-12T12:00:00.000Z" },
  { id: "VEN-1002", origin: "Serviço rápido", customer: "Troca de óleo", items: [], total: 80, paymentMethod: "Dinheiro", date: "12/03/2026", soldAt: "2026-03-12T13:00:00.000Z" },
  // Venda antiga, gravada antes de a origem existir: não pode sumir do esperado.
  { id: "VEN-1003", customer: "Sem origem", items: [], total: 10, paymentMethod: "Dinheiro", date: "12/03/2026", soldAt: "2026-03-12T13:30:00.000Z" },
] as unknown as SaleRecord[];
const ordensDeOrigem = [
  { id: "OS-1001", customer: "Bancada", total: 200, closed: true, paymentMethod: "Dinheiro", closedAt: "12/03/2026", closedAtISO: "2026-03-12T14:00:00.000Z" },
] as unknown as OrderRecord[];
const contasDeOrigem = [
  { id: "CT-1001", kind: "receber", person: "Fiado", description: "Nota", amount: 50, installment: 1, installments: 1, dueDate: "12/03/2026",
    settlements: [{ date: "12/03/2026", settledAt: "2026-03-12T15:00:00.000Z", amount: 50, method: "Dinheiro" }] },
] as unknown as AccountRecord[];
const porOrigem = cashSummary(sessaoOrigens, { sales: vendasDeOrigem, orders: ordensDeOrigem, accounts: contasDeOrigem });

// Um mês de caixas fechados, para o histórico. Duas faltas, uma sobra e dois
// que conferem — e uma falta e uma sobra do mesmo tamanho, de propósito.
const fechado = (id: string, data: string, esperado: number, contado: number): CashSession => ({
  id, openedAt: "", openedDate: data, openingAmount: 200, status: "fechado",
  closedAt: `${data.split("/").reverse().join("-")}T21:00:00.000Z`, closedDate: data,
  openedByName: "Matheus", closedByName: "Matheus",
  expectedAmount: esperado, countedAmount: contado, difference: Number((contado - esperado).toFixed(2)),
});
const mes = [
  fechado("CX-0101", "02/03/2026", 500, 500),
  fechado("CX-0102", "03/03/2026", 640, 590),   // falta de 50
  fechado("CX-0103", "05/03/2026", 700, 700),
  fechado("CX-0104", "09/03/2026", 480, 530),   // sobra de 50
  fechado("CX-0105", "12/03/2026", 900, 780),   // falta de 120
  fechado("CX-0106", "02/04/2026", 300, 300),   // fora do mês
  { ...fechado("CX-0107", "10/03/2026", 100, 100), status: "aberto" } as CashSession, // ainda aberto
];
const marco = { de: "2026-03-01", ate: "2026-03-31" };
const noMes = sessionsInPeriod(mes, marco);
const resumoDoMes = cashHistorySummary(noMes);

const casos: Array<[string, unknown, unknown]> = [
  // --- O que é dinheiro de gaveta ---
  ["dinheiro é gaveta", isDrawerPayment("Dinheiro"), true],
  ["PIX não é gaveta", isDrawerPayment("PIX"), false],
  ["débito não é gaveta", isDrawerPayment("Débito"), false],
  ["crédito não é gaveta", isDrawerPayment("Crédito"), false],
  ["fiado não é gaveta", isDrawerPayment("Nota a prazo"), false],
  ["troca de serviço não é gaveta", isDrawerPayment("Troca de serviços"), false],
  ["forma em branco não é gaveta", isDrawerPayment(undefined), false],

  // --- Extrato da gaveta ---
  ["a abertura é a primeira linha do extrato", extrato[extrato.length - 1]!.kind, "Abertura"],
  ["o extrato mostra o que passou pela gaveta", extrato.length, 10],
  ["o mais recente aparece primeiro", extrato[0]!.kind, "Sangria"],
  ["venda em dinheiro entra", extrato.some((e) => e.id === "VEN-0001" && e.amount === 150), true],
  ["venda no PIX não entra", extrato.some((e) => e.id === "VEN-0002"), false],
  ["venda no cartão não entra", extrato.some((e) => e.id === "VEN-0003"), false],
  ["venda fiada não entra", extrato.some((e) => e.id === "VEN-0004"), false],
  ["venda de ontem não entra na sessão de hoje", extrato.some((e) => e.id === "VEN-0000"), false],
  ["OS fechada em dinheiro entra", extrato.some((e) => e.id === "OS-0001" && e.amount === 320), true],
  ["OS ainda aberta não entra", extrato.some((e) => e.id === "OS-0002"), false],
  ["OS fechada no PIX não entra", extrato.some((e) => e.id === "OS-0003"), false],
  ["gasto pago em dinheiro sai da gaveta", extrato.some((e) => e.id === "GAS-0001" && e.amount === -60), true],
  ["gasto pago pelo banco não mexe na gaveta", extrato.some((e) => e.id === "GAS-0002"), false],
  ["gasto ainda não pago não mexe na gaveta", extrato.some((e) => e.id === "GAS-0003"), false],
  ["cliente que quitou em dinheiro entra", extrato.some((e) => e.id === "CT-0001-0" && e.amount === 90), true],
  ["conta paga em dinheiro sai", extrato.some((e) => e.id === "CT-0002-0" && e.amount === -150), true],
  ["a parte da conta paga no PIX não sai da gaveta", extrato.some((e) => e.id === "CT-0002-1"), false],
  ["suprimento entra positivo", extrato.find((e) => e.kind === "Suprimento")!.amount, 100],
  ["sangria sai negativa", extrato.find((e) => e.kind === "Sangria")!.amount, -300],
  ["sem sessão aberta não há extrato", drawerEntries(null, fontes).length, 0],

  // --- Resumo do caixa ---
  ["o fundo de troco entra no esperado", resumo.opening, 200],
  ["vendas do balcão em dinheiro somam", resumo.counter, 260],
  ["OS em dinheiro somam à parte", resumo.orders, 320],
  ["e as duas juntas dão o que entrou de venda", resumo.counter + resumo.quick + resumo.orders, 580],
  ["recebimento de fiado em dinheiro soma", resumo.received, 90],
  ["suprimentos somam", resumo.supplies, 100],
  ["sangrias são contadas à parte", resumo.withdrawals, 300],
  ["gastos em dinheiro somam", resumo.expenses, 210],
  ["o esperado na gaveta fecha", resumo.expected, esperado],
  ["a abertura não conta como movimentação", resumo.count, 9],
  ["caixa recém-aberto espera só o fundo de troco", cashSummary(sessaoVazia, fontes).expected, 150],

  // --- Cada origem na sua linha ---
  // Antes o fechamento dizia só "entrou tanto em vendas e OS": uma diferença
  // no balcão aparecia como diferença do caixa inteiro, sem onde procurar.
  ["o balcão fica na linha do balcão", porOrigem.counter, 70],
  ["o serviço rápido não é confundido com balcão", porOrigem.quick, 80],
  ["a OS fica na linha dela", porOrigem.orders, 200],
  ["a conta quitada fica na linha dela", porOrigem.received, 50],
  ["a venda antiga sem origem não some do esperado", porOrigem.expected, 500],
  ["o que entrou é a soma das origens", porOrigem.incoming, 400],
  ["nada saiu neste dia", porOrigem.outgoing, 0],
  ["as linhas saem na ordem em que se confere",
    json(drawerOrigins(porOrigem).map((linha) => linha.origem)),
    json(["Venda no balcão", "Serviço rápido", "Ordem de serviço", "Conta a receber quitada"])],
  ["linha zerada não aparece no fechamento",
    drawerOrigins(porOrigem).some((linha) => linha.origem === "Suprimento"), false],
  ["a movimentação avulsa não vira recebimento de cliente", resumoComMov.received, 90],
  ["ela fica na própria linha", resumoComMov.manualIn, 40],
  ["e a saída avulsa não vira gasto", resumoComMov.manualOut, 25],
  ["e sem movimentação nenhuma", cashSummary(sessaoVazia, fontes).count, 0],

  // --- Histórico de caixas fechados ---
  // O histórico só existia dentro do diálogo, cortado nos cinco últimos: achar
  // o fechamento de terça passada era impossível.
  ["o período traz só os caixas fechados dentro dele", noMes.length, 5],
  ["caixa de outro mês fica de fora", noMes.some((c) => c.id === "CX-0106"), false],
  ["caixa ainda aberto não entra no histórico", noMes.some((c) => c.id === "CX-0107"), false],
  ["o mais recente vem primeiro", noMes[0]!.id, "CX-0105"],
  ["o esperado do mês soma", resumoDoMes.esperado, 3220],
  ["o contado do mês soma", resumoDoMes.contado, 3100],
  ["a diferença do mês é a soma das diferenças", resumoDoMes.diferenca, -120],
  ["conta quantos conferiram", resumoDoMes.conferem, 2],
  ["conta as faltas", resumoDoMes.faltas, 2],
  ["conta as sobras", resumoDoMes.sobras, 1],
  // Uma falta de 50 e uma sobra de 50 se anulam no total: olhar só a soma diria
  // que o mês fechou certo, quando na verdade foram dois erros.
  ["a maior falta do mês aparece sozinha", resumoDoMes.maiorFalta, 120],
  ["e diz em qual caixa foi", resumoDoMes.maiorFaltaEm, "CX-0105"],
  ["mês sem caixa fechado dá resumo zerado",
    json(cashHistorySummary(sessionsInPeriod(mes, { de: "2026-01-01", ate: "2026-01-31" }))),
    json({ caixas: 0, esperado: 0, contado: 0, diferenca: 0, conferem: 0, faltas: 0, sobras: 0, maiorFalta: 0, maiorFaltaEm: "" })],
  // Caixa antigo, fechado antes de o sistema gravar a diferença: a conta é
  // refeita do contado menos o esperado, em vez de sumir do resumo.
  ["caixa sem diferença gravada ainda é contado",
    cashHistorySummary([{ ...fechado("CX-0108", "04/03/2026", 400, 350), difference: undefined }]).faltas, 1],

  // --- Fechamento ---
  ["contando o esperado, o caixa confere", cashDifference(esperado, esperado), 0],
  ["e a etiqueta diz que confere", differenceLabel(cashDifference(esperado, esperado)), "Confere"],
  ["faltando R$ 50, a diferença é negativa", cashDifference(esperado - 50, esperado), -50],
  ["e a etiqueta diz falta", differenceLabel(cashDifference(esperado - 50, esperado)), "Falta"],
  ["sobrando R$ 20, a diferença é positiva", cashDifference(esperado + 20, esperado), 20],
  ["e a etiqueta diz sobra", differenceLabel(cashDifference(esperado + 20, esperado)), "Sobra"],
  ["um centavo de arredondamento não é erro de caixa", differenceLabel(cashDifference(esperado + 0.004, esperado)), "Confere"],
  ["mas um centavo de verdade é", differenceLabel(cashDifference(esperado + 0.01, esperado)), "Sobra"],

  // --- Uma sessão por vez ---
  ["com o caixa aberto, não dá para abrir outro", canOpenSession([sessao]), false],
  ["sem caixa aberto, dá", canOpenSession(closedSessions(historico)), true],
  ["a sessão aberta é encontrada", openSession(historico)!.id, "CX-0001"],
  ["sessão fechada não conta como aberta", openSession([{ ...sessao, status: "fechado" }]), null],
  ["o histórico vem da mais recente para a mais antiga", json(closedSessions(historico).map((s) => s.id)), json(["CX-0000", "CX-0009"])],

  // --- Regras da movimentação ---
  ["sangria acima do que há na gaveta é barrada", movementProblem("Sangria", esperado + 50, esperado).includes("Não dá para sangrar"), true],
  ["sangria do valor exato passa", movementProblem("Sangria", esperado, esperado), ""],
  ["suprimento acima do saldo é normal", movementProblem("Suprimento", esperado + 5000, esperado), ""],
  ["valor zero é barrado", movementProblem("Suprimento", 0, esperado), "Informe um valor maior que zero."],
  ["valor negativo é barrado", movementProblem("Sangria", -10, esperado), "Informe um valor maior que zero."],
  ["a movimentação é gravada sempre positiva", buildMovement("Sangria", -80, " Depósito ").amount, 80],
  ["e com o motivo sem espaço sobrando", buildMovement("Sangria", 80, " Depósito ").reason, "Depósito"],
  ["já retirado da gaveta nesta sessão", withdrawnTotal(sessao), 300],
  ["sem sangria, nada foi retirado", withdrawnTotal(sessaoVazia), 0],

  // --- O que NÃO está na gaveta ---
  // 400 do PIX + 200 do crédito. Fiado fica de fora: não virou dinheiro.
  ["o que entrou fora da gaveta é somado à parte", nonDrawerTotal(sessao, sales, orders), 920],
  ["sem sessão, nada a somar", nonDrawerTotal(null, sales, orders), 0],

  // --- Pagamento dividido na gaveta ---
  ["a venda dividida entra só com a parte em dinheiro", extrato.find((e) => e.id === "VEN-0005")!.amount, 30],
  ["e a linha avisa que é parte do pagamento", extrato.find((e) => e.id === "VEN-0005")!.description.includes("parte em dinheiro"), true],
  ["dividida com fiado entra só o dinheiro", extrato.find((e) => e.id === "VEN-0006")!.amount, 80],
  ["o PIX e o fiado não passam pela gaveta", extrato.filter((e) => e.id === "VEN-0005").length, 1],
  // 470 do cenário base + 30 + 80 das duas divididas.
  ["as partes em dinheiro somam nas vendas", resumo.counter + resumo.quick + resumo.orders, 580],
  // 850 do base + 70 do PIX da venda dividida. O fiado não entra: não virou dinheiro.
  ["o que entrou fora da gaveta soma só PIX e cartão", nonDrawerTotal(sessao, sales, orders), 920],

  // --- Movimentação manual na gaveta ---
  ["entrada manual em dinheiro entra na gaveta", drawerEntries(sessao, comMovimentacoes).some((e) => e.id === "MOV-0001" && e.amount === 40), true],
  ["saída manual em dinheiro sai da gaveta", drawerEntries(sessao, comMovimentacoes).some((e) => e.id === "MOV-0002" && e.amount === -25), true],
  ["entrada manual por PIX não passa pela gaveta", drawerEntries(sessao, comMovimentacoes).some((e) => e.id === "MOV-0003"), false],
  ["a entrada manual soma no que entrou", resumoComMov.incoming - resumo.incoming, 40],
  ["a saída manual soma no que saiu", resumoComMov.outgoing - resumo.outgoing, 25],
  // 460 do cenário base + 40 de entrada − 25 de saída.
  ["o esperado na gaveta considera as duas", resumoComMov.expected, 475],
  ["sem movimentação manual, o esperado não muda", cashSummary(sessao, fontes).expected, esperado],

  // --- Caixa esquecido aberto ---
  ["caixa aberto há 10h ainda é do dia", sessionIsStale(sessao, new Date("2026-03-10T21:00:00.000Z")), false],
  ["caixa aberto há mais de 20h ficou de ontem", sessionIsStale(sessao, new Date("2026-03-11T12:00:00.000Z")), true],
  ["sem caixa aberto não há o que avisar", sessionIsStale(null), false],
];

let falhas = 0;
for (const [nome, obtido, esperadoCaso] of casos) {
  const ok = obtido === esperadoCaso;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperadoCaso}`);
}
console.log(falhas === 0 ? "\nO caixa fecha certo." : `\n${falhas} conta(s) erradas.`);
process.exit(falhas === 0 ? 0 : 1);

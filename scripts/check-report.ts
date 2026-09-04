/**
 * Confere o relatório do período.
 *
 * O que este script protege: o relatório era uma casca que dizia ter exportado
 * um PDF sem gerar arquivo nenhum, e o resto do financeiro só sabia responder
 * "hoje" e "acumulado". As perguntas que o dono faz de verdade — quanto entrou
 * no mês passado, qual peça deu mais lucro, quanto a maquininha comeu — todas
 * precisam de período, e período errado num relatório é pior que relatório
 * nenhum: dá para tomar decisão em cima.
 *
 * Rode com: npm run check:report
 */
import {
  dentroDoPeriodo, nomeDoArquivo, paraCSV, pecasMaisVendidas, periodoDe, periodoEmTexto,
  porFormaDePagamento, resultadoDoPeriodo, servicosMaisFeitos,
} from "../src/report";
import type { ExpenseRecord, MovementRecord, OrderRecord, SaleRecord } from "../src/types";

const json = (value: unknown) => JSON.stringify(value);
// 15/03/2026, uma quinta-feira, como "hoje" de referência.
const BASE = new Date(2026, 2, 15);

const sales = [
  { id: "VEN-0001", origin: "PDV", date: "10/03/2026", total: 200, paymentMethod: "Dinheiro", discount: 10,
    items: [{ id: "1", type: "Peça", name: "ÓLEO 20W50", price: 200, quantity: 2, cost: 120 }] },
  { id: "VEN-0002", origin: "PDV", date: "12/03/2026", total: 300, paymentMethod: "Crédito", fee: 9, net: 291,
    items: [{ id: "2", type: "Peça", name: "KIT RELAÇÃO", price: 300, quantity: 1, cost: 180 }] },
  // Fevereiro: fora de "este mês", dentro de "mês passado".
  { id: "VEN-0003", origin: "PDV", date: "20/02/2026", total: 100, paymentMethod: "Dinheiro",
    items: [{ id: "3", type: "Peça", name: "ÓLEO 20W50", price: 100, quantity: 1, cost: 60 }] },
] as unknown as SaleRecord[];

const orders = [
  { id: "OS-0001", closed: true, closedAt: "11/03/2026", total: 450, paymentMethod: "PIX", customer: "JOÃO", bike: "CG 160",
    items: [{ id: "a", type: "Peça", name: "PASTILHA", price: 150, quantity: 1, cost: 90 },
            { id: "b", type: "Mão de obra", name: "TROCA DE PASTILHA", price: 300 }] },
  // OS aberta não entra: o serviço ainda não virou dinheiro.
  { id: "OS-0002", closed: false, closedAt: "13/03/2026", total: 900, items: [] },
] as unknown as OrderRecord[];

const expenses = [
  { id: "GAS-1", status: "Pago", dueDate: "05/03/2026", amount: 150, category: "Aluguel", description: "Aluguel" },
  { id: "GAS-2", status: "Agendado", dueDate: "28/03/2026", amount: 400, category: "Energia", description: "Luz" },
] as unknown as ExpenseRecord[];

const movements = [
  { id: "MOV-1", kind: "entrada", amount: 50, date: "12/03/2026", category: "Sucata", description: "Venda de sucata" },
  { id: "MOV-2", kind: "saida", amount: 20, date: "12/03/2026", category: "Lanche", description: "Lanche" },
] as unknown as MovementRecord[];

const esteMes = periodoDe("Este mês", BASE);
const mesPassado = periodoDe("Mês passado", BASE);
const resultado = resultadoDoPeriodo(esteMes, { sales, orders, expenses, movements });
const doMesPassado = resultadoDoPeriodo(mesPassado, { sales, orders, expenses, movements });

const casos: Array<[string, unknown, unknown]> = [
  // --- Os períodos ---
  ["hoje é um dia só", json(periodoDe("Hoje", BASE)), json({ de: "2026-03-15", ate: "2026-03-15" })],
  // Sete dias contando hoje: de segunda a domingo dá sete, não oito.
  ["últimos 7 dias contam hoje", json(periodoDe("Últimos 7 dias", BASE)), json({ de: "2026-03-09", ate: "2026-03-15" })],
  ["este mês começa no dia 1 e para hoje", json(esteMes), json({ de: "2026-03-01", ate: "2026-03-15" })],
  ["mês passado vai do 1 ao último dia", json(mesPassado), json({ de: "2026-02-01", ate: "2026-02-28" })],
  ["este ano começa em janeiro", json(periodoDe("Este ano", BASE)), json({ de: "2026-01-01", ate: "2026-03-15" })],
  ["dezembro volta para novembro sem quebrar o ano",
    json(periodoDe("Mês passado", new Date(2026, 0, 10))), json({ de: "2025-12-01", ate: "2025-12-31" })],

  // --- A data cai no período? ---
  ["a data do meio entra", dentroDoPeriodo("10/03/2026", esteMes), true],
  ["o primeiro dia entra", dentroDoPeriodo("01/03/2026", esteMes), true],
  ["o último dia entra", dentroDoPeriodo("15/03/2026", esteMes), true],
  ["um dia antes fica de fora", dentroDoPeriodo("28/02/2026", esteMes), false],
  ["um dia depois fica de fora", dentroDoPeriodo("16/03/2026", esteMes), false],
  // Registro sem data entrar num período sem se saber em qual é o que faz o
  // relatório de dois meses somar mais que o do ano.
  ["registro sem data fica de fora", dentroDoPeriodo(undefined, esteMes), false],
  ["texto que não é data fica de fora", dentroDoPeriodo("ontem", esteMes), false],

  // --- O resultado ---
  ["o faturamento soma o que virou dinheiro", resultado.faturamento, 950],
  ["a OS aberta não entra no faturamento", resultado.atendimentos, 3],
  ["o custo das peças vem do que foi gravado na venda", resultado.custoDasPecas, 390],
  ["a taxa da maquininha aparece separada", resultado.taxas, 9],
  ["só o gasto PAGO no período entra", resultado.despesas, 150],
  ["as entradas avulsas somam", resultado.entradasAvulsas, 50],
  ["as saídas avulsas somam", resultado.saidasAvulsas, 20],
  // 950 − 390 − 9 − 150 + 50 − 20
  ["o lucro é o que sobra de tudo", resultado.lucro, 431],
  ["a margem é sobre o faturamento", resultado.margem, 45.4],
  ["o ticket médio divide pelo número de atendimentos", resultado.ticketMedio, 316.67],
  ["o desconto concedido aparece", resultado.descontos, 10],
  ["o mês passado tem a venda de fevereiro", doMesPassado.faturamento, 100],
  ["e não tem as de março", doMesPassado.atendimentos, 1],
  ["período sem movimento dá tudo zero", resultadoDoPeriodo(periodoDe("Hoje", BASE), { sales, orders }).faturamento, 0],
  ["e margem zero, sem dividir por zero", resultadoDoPeriodo(periodoDe("Hoje", BASE), { sales, orders }).margem, 0],

  // --- Por forma de pagamento ---
  ["as formas vêm ordenadas pelo total",
    json(porFormaDePagamento(esteMes, sales, orders).map((l) => l.forma)), json(["PIX", "Crédito", "Dinheiro"])],
  ["a taxa fica ao lado do total, não diluída",
    json(porFormaDePagamento(esteMes, sales, orders).find((l) => l.forma === "Crédito")),
    json({ forma: "Crédito", atendimentos: 1, total: 300, taxa: 9, liquido: 291 })],

  // --- Peças e serviços ---
  ["as peças vêm ordenadas por faturamento",
    json(pecasMaisVendidas(esteMes, sales, orders).map((l) => l.nome)), json(["KIT RELAÇÃO", "ÓLEO 20W50", "PASTILHA"])],
  ["a peça traz o lucro dela",
    json(pecasMaisVendidas(esteMes, sales, orders)[0]),
    json({ nome: "KIT RELAÇÃO", quantidade: 1, total: 300, custo: 180, lucro: 120 })],
  ["a mesma peça em vendas diferentes é somada numa linha só",
    json(pecasMaisVendidas(periodoDe("Este ano", BASE), sales, orders).find((l) => l.nome === "ÓLEO 20W50")),
    json({ nome: "ÓLEO 20W50", quantidade: 3, total: 300, custo: 180, lucro: 120 })],
  ["a mão de obra sai na lista de serviços",
    json(servicosMaisFeitos(esteMes, sales, orders)), json([{ nome: "TROCA DE PASTILHA", quantidade: 1, total: 300, custo: 0, lucro: 300 }])],
  ["o limite corta a lista", pecasMaisVendidas(esteMes, sales, orders, 1).length, 1],

  // --- O arquivo ---
  // Ponto e vírgula com vírgula decimal é o que o Excel em português abre com
  // as colunas separadas; vírgula faria "1.234,56" virar duas colunas.
  ["o CSV usa ponto e vírgula e vírgula decimal",
    paraCSV(["Peça", "Total"], [["ÓLEO", 40.5]]), "Peça;Total\r\nÓLEO;40,50"],
  ["texto com ponto e vírgula é protegido por aspas",
    paraCSV(["A"], [["um; dois"]]), 'A\r\n"um; dois"'],
  ["aspas dentro do texto são dobradas", paraCSV(["A"], [['diz "oi"']]), 'A\r\n"diz ""oi"""'],
  ["o nome do arquivo carrega o período",
    nomeDoArquivo("resultado", esteMes), "resultado-2026-03-01-a-2026-03-15.csv"],
  ["o período em texto sai em português", periodoEmTexto(esteMes), "01/03/2026 a 15/03/2026"],
  ["um dia só não repete a data", periodoEmTexto(periodoDe("Hoje", BASE)), "15/03/2026"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${json(obtido)}, esperado ${json(esperado)}`);
}
console.log(falhas === 0 ? "\nO relatório do período está certo." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

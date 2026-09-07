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
  periodoAnterior, porFormaDePagamento, resultadoDoPeriodo, resultadoPorTipo, servicosMaisFeitos, variacao,
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

const par = (p: { de: string; ate: string }) => `${p.de} a ${p.ate}`;

// Peça e mão de obra são dois negócios dentro da mesma oficina. No cenário:
// VEN-0001 (200 de peça) + VEN-0002 (300 de peça) + OS-0001 (150 de peça e
// 300 de serviço) = 650 de peça e 300 de serviço.
const porTipo = resultadoPorTipo(esteMes, { sales, orders });

// Uma OS recebida pela metade: o recebido tem de ser repartido na proporção
// dos itens, e não jogado inteiro num dos lados.
const meioPago = resultadoPorTipo({ de: "2026-04-01", ate: "2026-04-30" }, {
  orders: [{ id: "OS-0100", closed: true, closedAt: "10/04/2026", total: 1000,
    paymentMethod: "Dinheiro",
    payments: [{ method: "Dinheiro", amount: 500 }, { method: "Nota a prazo", amount: 500 }],
    items: [{ id: "p", type: "Peça", name: "PECA", price: 600, quantity: 1, cost: 400 },
            { id: "m", type: "Mão de obra", name: "SERVICO", price: 400 }] }] as unknown as OrderRecord[],
});

// Serviço rápido sem item gravado: é mão de obra por natureza.
const rapidoSemItem = resultadoPorTipo({ de: "2026-04-01", ate: "2026-04-30" }, {
  sales: [{ id: "VEN-0100", origin: "Serviço rápido", date: "10/04/2026", total: 80,
    paymentMethod: "Dinheiro", items: [] }] as unknown as SaleRecord[],
});

// Venda sem item nenhum e sem origem de serviço: fica declarada, não chutada.
const semItem = resultadoPorTipo({ de: "2026-04-01", ate: "2026-04-30" }, {
  orders: [{ id: "OS-0200", closed: true, closedAt: "10/04/2026", total: 250,
    paymentMethod: "Dinheiro", items: [] }] as unknown as OrderRecord[],
});

const casos: Array<[string, unknown, unknown]> = [
  // --- Peça e mão de obra, separadas ---
  // Com o faturamento somado não dá para saber qual dos dois sustenta o mês —
  // e é isso que decide se vale mexer na margem da peça ou no preço da hora.
  ["a revenda de peça tem o próprio faturamento", porTipo.pecas.faturamento, 650],
  ["a mão de obra tem o dela", porTipo.maoDeObra.faturamento, 300],
  ["e as duas somam o faturamento do período",
    Math.round((porTipo.pecas.faturamento + porTipo.maoDeObra.faturamento + porTipo.naoClassificado) * 100) / 100,
    resultado.faturamento],
  ["o custo é todo da peça", porTipo.pecas.custo, 390],
  ["o lucro da peça desconta o custo", porTipo.pecas.lucro, 260],
  ["e a margem da peça sai da conta dela", porTipo.pecas.margem, 40],
  // O sistema não sabe quanto custa a hora do mecânico. Mostrar margem de 100%
  // no serviço seria mentira confortável.
  ["o custo da mão de obra fica zerado, porque o sistema não sabe", porTipo.maoDeObra.custo, 0],

  // O recebido pela metade é repartido na proporção dos itens.
  ["OS recebida pela metade divide a peça na proporção", meioPago.pecas.faturamento, 300],
  ["e o serviço também", meioPago.maoDeObra.faturamento, 200],
  ["sem inventar faturamento",
    meioPago.pecas.faturamento + meioPago.maoDeObra.faturamento, 500],

  ["serviço rápido sem item é mão de obra", rapidoSemItem.maoDeObra.faturamento, 80],
  ["e não vira peça", rapidoSemItem.pecas.faturamento, 0],
  // Empurrar para um dos lados faria a revenda parecer menor, ou a oficina
  // parecer loja de peças. Fica declarado.
  ["o que não dá para separar fica declarado", semItem.naoClassificado, 250],
  ["e não é chutado para a peça", semItem.pecas.faturamento, 0],
  ["nem para a mão de obra", semItem.maoDeObra.faturamento, 0],
  ["período sem movimento dá tudo zerado",
    json(resultadoPorTipo({ de: "2020-01-01", ate: "2020-01-31" }, { sales, orders })),
    json({ pecas: { faturamento: 0, custo: 0, lucro: 0, margem: 0 },
           maoDeObra: { faturamento: 0, custo: 0, lucro: 0, margem: 0 }, naoClassificado: 0 })],

  // --- O período anterior, para comparar ---
  // Comparar 1 a 4 de setembro com 28 a 31 de agosto responderia a pergunta
  // errada: quem olha o mês corrente quer o mesmo trecho do mês passado.
  ["mês corrente compara com os mesmos dias do mês passado",
    par(periodoAnterior({ de: "2026-09-01", ate: "2026-09-04" })), "2026-08-01 a 2026-08-04"],
  ["mês inteiro compara com o mês inteiro anterior",
    par(periodoAnterior({ de: "2026-08-01", ate: "2026-08-31" })), "2026-07-01 a 2026-07-31"],
  // Fevereiro é mais curto: 1 a 31 de março para no dia 28.
  ["mês mais curto atrás para no último dia que ele tem",
    par(periodoAnterior({ de: "2026-03-01", ate: "2026-03-31" })), "2026-02-01 a 2026-02-28"],
  ["e o mesmo vale para o mês corrente",
    par(periodoAnterior({ de: "2026-03-01", ate: "2026-03-30" })), "2026-02-01 a 2026-02-28"],
  ["janeiro compara com dezembro do ano anterior",
    par(periodoAnterior({ de: "2026-01-01", ate: "2026-01-15" })), "2025-12-01 a 2025-12-15"],
  ["o ano até hoje compara com o mesmo trecho do ano passado",
    par(periodoAnterior({ de: "2026-01-01", ate: "2026-09-04" })), "2025-01-01 a 2025-09-04"],
  ["29 de fevereiro compara com o dia 28 do ano que não é bissexto",
    par(periodoAnterior({ de: "2024-01-01", ate: "2024-02-29" })), "2023-01-01 a 2023-02-28"],
  ["hoje compara com ontem",
    par(periodoAnterior({ de: "2026-09-04", ate: "2026-09-04" })), "2026-09-03 a 2026-09-03"],
  ["sete dias comparam com os sete anteriores",
    par(periodoAnterior({ de: "2026-08-29", ate: "2026-09-04" })), "2026-08-22 a 2026-08-28"],
  ["um período qualquer volta o mesmo tanto de dias",
    par(periodoAnterior({ de: "2026-05-10", ate: "2026-05-14" })), "2026-05-05 a 2026-05-09"],
  ["e atravessa a virada do mês sem se perder",
    par(periodoAnterior({ de: "2026-03-02", ate: "2026-03-04" })), "2026-02-27 a 2026-03-01"],

  // --- A variação ---
  ["subir de 100 para 150 é mais 50%", variacao(150, 100), 50],
  ["cair de 200 para 150 é menos 25%", variacao(150, 200), -25],
  ["ficar igual é zero", variacao(100, 100), 0],
  ["a casa decimal é arredondada", variacao(1234, 1000), 23.4],
  // "Subiu 100%" a partir de zero não quer dizer nada, e como número faz o mês
  // parecer melhor do que foi.
  ["não dá para comparar com zero", variacao(500, 0), null],
  ["nem zero com zero", variacao(0, 0), null],
  ["mas cair para zero é menos 100%", variacao(0, 400), -100],

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

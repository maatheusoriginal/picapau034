/**
 * Reimprimir OS e o lote de quem está devendo.
 *
 * O caso que trouxe isto: "o Gonzaga, se eu precisar, eu consigo imprimir
 * todas as OS que foram finalizadas". O erro caro aqui não é imprimir papel a
 * mais — é dizer que alguém está quite quando não está, ou imprimir a conta
 * da empresa no nome do motoboy que trouxe a moto.
 */
import type { AccountRecord, OrderRecord } from "../src/types";
import { PARTNER_PAYMENT_METHOD } from "../src/finance";
import { batchFor, finishedOrders, orderIsUnpaid, payerOf, peopleWithUnpaidOrders, searchOrdersToReprint } from "../src/order-reprint";

const os = (extra: Partial<OrderRecord>): OrderRecord => ({
  id: "OS-0001", customer: "JOÃO DA SILVA", bike: "Honda CG 160", plate: "ABC-1D23",
  status: "Finalizada", time: "10/09/2026, 09:00", total: 100, ...extra,
} as OrderRecord);

const conta = (extra: Partial<AccountRecord>): AccountRecord => ({
  id: "CR-0001", kind: "receber", person: "JOÃO DA SILVA", description: "OS", category: "Serviço",
  amount: 100, dueDate: "01/10/2026", settlements: [], origin: "Ordem de serviço", installment: 1, installments: 1, ...extra,
} as AccountRecord);

const casos: Array<[string, unknown, unknown]> = [];

/* ---------------------------------------------------------------------------
   QUEM ESTÁ DEVENDO
--------------------------------------------------------------------------- */
const aPrazo = os({ id: "OS-0010", closed: true, paymentMethod: "Nota a prazo" });
const aVista = os({ id: "OS-0011", closed: true, paymentMethod: "Dinheiro" });
casos.push(
  ["OS em dinheiro está paga", orderIsUnpaid(aVista, []), false],
  ["OS a prazo sem conta lançada conta como devendo", orderIsUnpaid(aPrazo, []), true],
  ["OS faturada na parceira também", orderIsUnpaid(os({ id: "OS-0012", closed: true, paymentMethod: PARTNER_PAYMENT_METHOD }), []), true],

  // Com a conta no banco, é ELA que manda: é ela que sabe do pagamento.
  ["conta em aberto: devendo", orderIsUnpaid(aPrazo, [conta({ sourceId: "OS-0010" })]), true],
  ["conta quitada: pago, mesmo sendo a prazo", orderIsUnpaid(aPrazo, [conta({ sourceId: "OS-0010", settlements: [{ amount: 100 } as never] })]), false],
  ["baixa parcial ainda é dívida", orderIsUnpaid(aPrazo, [conta({ sourceId: "OS-0010", settlements: [{ amount: 40 } as never] })]), true],
  ["conta de OUTRA OS não quita esta", orderIsUnpaid(aPrazo, [conta({ sourceId: "OS-9999", settlements: [{ amount: 100 } as never] })]), true],
  ["conta a pagar não tem nada a ver com receber", orderIsUnpaid(aPrazo, [conta({ kind: "pagar", sourceId: "OS-0010", settlements: [{ amount: 100 } as never] })]), true],
  // Duas parcelas: uma quitada, outra não. Ainda deve.
  ["parcela quitada e parcela aberta: devendo", orderIsUnpaid(aPrazo, [
    conta({ id: "CR-1", sourceId: "OS-0010", amount: 50, settlements: [{ amount: 50 } as never] }),
    conta({ id: "CR-2", sourceId: "OS-0010", amount: 50 }),
  ]), true],
  ["as duas parcelas quitadas: pago", orderIsUnpaid(aPrazo, [
    conta({ id: "CR-1", sourceId: "OS-0010", amount: 50, settlements: [{ amount: 50 } as never] }),
    conta({ id: "CR-2", sourceId: "OS-0010", amount: 50, settlements: [{ amount: 50 } as never] }),
  ]), false],
);

/* ---------------------------------------------------------------------------
   QUEM PAGA A OS
--------------------------------------------------------------------------- */
casos.push(
  ["na OS comum quem paga é o dono da moto", payerOf(os({})).name, "JOÃO DA SILVA"],
  ["na OS faturada quem paga é a EMPRESA", payerOf(os({ partnerId: "P1", partnerName: "GONZAGA ENTREGAS", customer: "MOTOBOY" })).name, "GONZAGA ENTREGAS"],
  ["e a empresa não se mistura com o motoboy", payerOf(os({ partnerId: "P1", partnerName: "GONZAGA ENTREGAS", customer: "MOTOBOY" })).key === payerOf(os({ customer: "MOTOBOY" })).key, false],
  ["dois clientes com o mesmo nome não viram um só", payerOf(os({ clientId: "C1" })).key === payerOf(os({ clientId: "C2" })).key, false],
  ["OS sem cliente nenhum ainda tem um nome na tela", payerOf(os({ customer: "" })).name, "Cliente não identificado"],
);

/* ---------------------------------------------------------------------------
   O LOTE
--------------------------------------------------------------------------- */
const frota = [
  os({ id: "OS-0100", closed: true, closedAtISO: "2026-09-01T10:00:00.000Z", partnerId: "P1", partnerName: "GONZAGA ENTREGAS", customer: "MOTOBOY 1", paymentMethod: PARTNER_PAYMENT_METHOD, total: 300 }),
  os({ id: "OS-0101", closed: true, closedAtISO: "2026-09-05T10:00:00.000Z", partnerId: "P1", partnerName: "GONZAGA ENTREGAS", customer: "MOTOBOY 2", paymentMethod: PARTNER_PAYMENT_METHOD, total: 200 }),
  // Esta o Gonzaga já pagou: não entra no lote.
  os({ id: "OS-0102", closed: true, closedAtISO: "2026-09-06T10:00:00.000Z", partnerId: "P1", partnerName: "GONZAGA ENTREGAS", customer: "MOTOBOY 3", paymentMethod: "Dinheiro", total: 999 }),
  // Esta ainda está na oficina: não terminou, não entra.
  os({ id: "OS-0103", closed: false, partnerId: "P1", partnerName: "GONZAGA ENTREGAS", paymentMethod: PARTNER_PAYMENT_METHOD, total: 777 }),
  os({ id: "OS-0200", closed: true, closedAtISO: "2026-09-04T10:00:00.000Z", clientId: "C9", customer: "MARIA SOUZA", paymentMethod: "Nota a prazo", total: 150 }),
];
const devedores = peopleWithUnpaidOrders(frota, []);
casos.push(
  ["duas pessoas devendo", devedores.length, 2],
  ["o maior devedor vem primeiro", devedores[0]?.name, "GONZAGA ENTREGAS"],
  ["e o que ele deve é a soma das OS em aberto", devedores[0]?.total, 500],
  ["a OS paga fica de fora do lote", devedores[0]?.orders.map((item) => item.id), ["OS-0101", "OS-0100"]],
  ["OS ainda na oficina não entra no lote", devedores.flatMap((pessoa) => pessoa.orders).some((item) => item.id === "OS-0103"), false],
  ["a mais recente sai primeiro no papel", devedores[0]?.orders[0]?.id, "OS-0101"],
  ["o lote de uma pessoa sai pela chave dela", batchFor(frota, [], devedores[0]!.key).length, 2],
  ["chave que ninguém tem devolve lote vazio, e não a lista toda", batchFor(frota, [], "cliente:NINGUEM").length, 0],
  ["quem pagou tudo some da lista de devedores", peopleWithUnpaidOrders([frota[2]!], []).length, 0],
  ["oficina sem OS nenhuma não quebra", peopleWithUnpaidOrders([], []).length, 0],
);
// E quitar a conta no financeiro tira a OS do lote, sem mexer na OS.
const quitouOGonzaga = [conta({ sourceId: "OS-0100", amount: 300, settlements: [{ amount: 300 } as never] })];
casos.push(
  ["conta quitada tira aquela OS do lote", batchFor(frota, quitouOGonzaga, "parceira:P1").map((item) => item.id), ["OS-0101"]],
  ["e o que ele deve cai junto", peopleWithUnpaidOrders(frota, quitouOGonzaga)[0]?.total, 200],
);

/* ---------------------------------------------------------------------------
   A BUSCA DA REIMPRESSÃO
--------------------------------------------------------------------------- */
casos.push(
  ["entregues, da mais recente para a mais antiga", finishedOrders(frota).map((item) => item.id), ["OS-0102", "OS-0101", "OS-0200", "OS-0100"]],
  ["sem digitar nada já mostra as últimas entregues", searchOrdersToReprint(frota, "").length, 4],
  ["a placa acha a OS", searchOrdersToReprint(frota, "ABC-1D23").length > 0, true],
  ["e a placa sem hífen também", searchOrdersToReprint(frota, "abc1d23").length > 0, true],
  ["o número da OS acha só ela", searchOrdersToReprint(frota, "OS-0200").map((item) => item.id), ["OS-0200"]],
  ["o nome do cliente acha", searchOrdersToReprint(frota, "maria").map((item) => item.id), ["OS-0200"]],
  ["o nome da empresa acha as dela", searchOrdersToReprint(frota, "gonzaga").length, 4],
  // Com busca, a OS que ainda está na oficina aparece: quem procura a placa
  // quer aquela moto, e não uma aula sobre em que etapa ela está.
  ["buscando, a OS ainda aberta também aparece", searchOrdersToReprint(frota, "gonzaga").some((item) => item.id === "OS-0103"), true],
  ["sem busca, a OS ainda aberta não aparece", searchOrdersToReprint(frota, "").some((item) => item.id === "OS-0103"), false],
  ["busca que não acha ninguém devolve vazio, e não tudo", searchOrdersToReprint(frota, "zzzzzz").length, 0],
  ["o limite é respeitado", searchOrdersToReprint(frota, "", 2).length, 2],
);

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : ` — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`}`);
}
if (falhas) { console.error(`\n${falhas} verificação(ões) de reimpressão falharam.`); process.exit(1); }
console.log(`\n${casos.length} verificações de reimpressão e lote passaram.`);

/**
 * Confere o histórico geral: OS encerrada, venda do balcão e serviço rápido
 * na mesma lista.
 *
 * É a tela que o dono usa para saber o que passou pela oficina no dia e no
 * mês. Se ela somar errado, ou esconder um atendimento, ninguém percebe pela
 * tela — só pela diferença no fim do mês, quando já não dá para reconstituir.
 *
 * Rode com: npm run check:ledger
 */
import {
  filterLedger,
  generalLedger,
  ledgerTotals,
  periodStart,
  type LedgerEntry,
} from "../src/ledger";
import type { OrderRecord, SaleRecord } from "../src/types";

const HOJE = new Date(2026, 8, 16, 15, 0, 0); // 16/09/2026, 15:00
const emDias = (dias: number, hora = 10) => new Date(2026, 8, 16 - dias, hora, 0, 0).toISOString();

const os = (partes: Partial<OrderRecord>): OrderRecord => ({
  id: "OS-X", customer: "", bike: "", plate: "", mechanic: "", mechanicIds: [],
  time: "", status: "Entrega", tone: "green", ...partes,
});
const venda = (partes: Partial<SaleRecord>): SaleRecord => ({
  id: "VEN-X", origin: "PDV", items: [], total: 0, paymentMethod: "Dinheiro",
  date: "16/09/2026", soldAt: emDias(0), ...partes,
});

const ordens: OrderRecord[] = [
  os({ id: "OS-0001", customer: "MARIA SOUZA", bike: "HONDA BIZ 125", plate: "XYZ-9999",
       mechanic: "RONALDO", total: 250, closed: true, closedAtISO: emDias(0, 14), closedAt: "16/09/2026",
       paymentMethod: "PIX", items: [{ id: "1", type: "Mão de obra", name: "TROCA DE RELAÇÃO", price: 250 }] }),
  // Ainda na bancada: não entra no histórico, porque pode mudar de valor até
  // a entrega.
  os({ id: "OS-0002", customer: "JOÃO", status: "Em serviço", total: 900, time: "16/09/2026, 09:00" }),
  // Lançada só para o histórico da moto: aparece, mas fora da soma.
  os({ id: "OS-0003", customer: "ANTIGO", bike: "CG 160", total: 500, closed: true, backfilled: true,
       closedAt: "02/03/2026", time: "02/03/2026, 08:00" }),
  // OS de parceira: a linha sai no nome de quem paga.
  os({ id: "OS-0004", customer: "MOTOBOY", partnerName: "GONZAGA MOTOS", partnerId: "PAR-1",
       total: 180, closed: true, closedAtISO: emDias(3), paymentMethod: "Faturado no parceiro" }),
];
const vendas: SaleRecord[] = [
  venda({ id: "VEN-0031", total: 118, soldAt: emDias(0, 11), customer: "PEDRO",
          items: [{ id: "1", type: "Peça", name: "PASTILHA DE FREIO", price: 118, quantity: 2 }] }),
  venda({ id: "VEN-0032", origin: "Serviço rápido", total: 140, soldAt: emDias(2), operatorName: "RAYANE",
          customer: "MARIA SOUZA", vehicle: "HONDA BIZ 125 · XYZ-9999",
          items: [{ id: "1", type: "Mão de obra", name: "TROCA DE ÓLEO", price: 140 }] }),
  venda({ id: "VEN-0033", total: 60, soldAt: emDias(20) }),
  // Venda antiga, gravada antes de o sistema guardar o ISO.
  venda({ id: "VEN-0009", total: 40, soldAt: "", date: "10/09/2026" }),
];

const tudo = generalLedger(ordens, vendas);
const ids = (linhas: LedgerEntry[]) => linhas.map((linha) => linha.id).join(",");
const hoje = filterLedger(tudo, { period: "Hoje", reference: HOJE });
const semana = filterLedger(tudo, { period: "7 dias", reference: HOJE });
const mes = filterLedger(tudo, { period: "30 dias", reference: HOJE });

const casos: Array<[string, unknown, unknown]> = [
  // As três fontes na mesma lista, que é o pedido.
  ["as três origens entram na mesma lista", new Set(tudo.map((linha) => linha.kind)).size, 3],
  ["a OS encerrada entra", tudo.some((linha) => linha.id === "OS-0001"), true],
  ["a venda do balcão entra", tudo.some((linha) => linha.id === "VEN-0031"), true],
  ["o serviço rápido entra", tudo.some((linha) => linha.kind === "Serviço rápido"), true],
  // OS na bancada pode mudar de valor até a entrega: somar isso mentiria.
  ["OS ainda aberta NÃO entra", tudo.some((linha) => linha.id === "OS-0002"), false],

  ["a lista vem da mais recente para a mais antiga", tudo[0].id, "OS-0001"],
  ["e a venda de hoje de manhã vem depois da OS da tarde", tudo[1].id, "VEN-0031"],
  ["registro sem data válida vai para o fim", tudo[tudo.length - 1].id, "OS-0003"],

  // Quem paga é quem aparece: a fatura é da empresa, não do motoboy.
  ["a OS de parceira sai no nome da empresa", tudo.find((linha) => linha.id === "OS-0004")?.person, "GONZAGA MOTOS"],
  ["a OS sem cliente não sai com o nome em branco", generalLedger([os({ id: "OS-9", closed: true })], [])[0].person, "Cliente não identificado"],
  ["a venda sem cliente sai como consumidor", tudo.find((linha) => linha.id === "VEN-0033")?.person, "Consumidor"],
  ["a linha diz o que foi feito", tudo.find((linha) => linha.id === "OS-0001")?.summary, "TROCA DE RELAÇÃO"],
  ["a linha traz a moto e a placa", tudo.find((linha) => linha.id === "OS-0001")?.vehicle, "HONDA BIZ 125 · XYZ-9999"],
  ["a linha da OS abre a OS", tudo.find((linha) => linha.id === "OS-0001")?.orderId, "OS-0001"],
  ["a linha da venda reimprime a venda", tudo.find((linha) => linha.id === "VEN-0031")?.saleId, "VEN-0031"],
  ["e a linha da OS não é venda", tudo.find((linha) => linha.id === "OS-0001")?.saleId, undefined],
  ["venda antiga sem ISO ainda mostra a data que tem", tudo.find((linha) => linha.id === "VEN-0009")?.when.includes("10/09/2026"), true],

  // Períodos.
  ["hoje traz só o que foi hoje", ids(hoje), "OS-0001,VEN-0031"],
  ["sete dias alcançam o serviço rápido de anteontem", semana.some((linha) => linha.id === "VEN-0032"), true],
  ["e a OS de três dias atrás", semana.some((linha) => linha.id === "OS-0004"), true],
  ["mas não a venda de vinte dias atrás", semana.some((linha) => linha.id === "VEN-0033"), false],
  ["trinta dias alcançam a de vinte dias", mes.some((linha) => linha.id === "VEN-0033"), true],
  // Registro sem data não pode ser chutado para dentro de um recorte.
  ["registro sem data fica fora de qualquer período", mes.some((linha) => linha.id === "OS-0003"), false],
  ["e aparece em 'Todos'", filterLedger(tudo, { period: "Todos" }).some((linha) => linha.id === "OS-0003"), true],
  ["'Todos' não tem data de corte", periodStart("Todos"), ""],
  ["o corte de hoje começa à meia-noite", periodStart("Hoje", HOJE).includes("T"), true],

  // Filtros de tipo e busca.
  ["dá para ver só as OS", ids(filterLedger(tudo, { kind: "Ordem de serviço" })), "OS-0001,OS-0004,OS-0003"],
  ["dá para ver só o serviço rápido", ids(filterLedger(tudo, { kind: "Serviço rápido" })), "VEN-0032"],
  ["a busca acha pela placa", ids(filterLedger(tudo, { query: "xyz-9999" })), "OS-0001,VEN-0032"],
  ["a busca acha pelo nome, sem ligar para maiúscula", ids(filterLedger(tudo, { query: "maria" })), "OS-0001,VEN-0032"],
  ["a busca acha pelo número", ids(filterLedger(tudo, { query: "VEN-0031" })), "VEN-0031"],
  ["a busca acha pelo que foi feito", ids(filterLedger(tudo, { query: "pastilha" })), "VEN-0031"],
  ["busca vazia não esconde nada", filterLedger(tudo, { query: "   " }).length, tudo.length],

  // A soma é o que o dono confere no fim do dia.
  ["o total de hoje soma OS e balcão", ledgerTotals(hoje).total, 368],
  ["e conta as duas linhas", ledgerTotals(hoje).count, 2],
  ["separando o que veio da oficina", ledgerTotals(hoje).orders, 250],
  ["do que veio do balcão", ledgerTotals(hoje).counter, 118],
  ["e do serviço rápido", ledgerTotals(semana).quick, 140],
  /*
    OS lançada só para o histórico não entra na soma: aquele dinheiro já foi
    contado onde quer que a oficina contasse antes. Mas a linha APARECE, porque
    é atendimento que aconteceu — e é para isso que ela foi lançada.
  */
  ["a OS antiga aparece na lista", filterLedger(tudo, { period: "Todos" }).some((linha) => linha.id === "OS-0003"), true],
  ["mas fica fora do dinheiro", ledgerTotals(filterLedger(tudo, { period: "Todos" })).total, 788],
  ["e a tela sabe quantas são, para poder avisar", ledgerTotals(filterLedger(tudo, { period: "Todos" })).backfilled, 1],

  ["oficina sem movimento não quebra a soma", ledgerTotals([]).total, 0],
  ["nem a lista", generalLedger([], []).length, 0],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO histórico geral fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * O retorno da moto que já saiu da oficina.
 *
 * Duas coisas são conferidas aqui, e as duas custam dinheiro quando erram:
 *
 * 1. O QUE VEM JUNTO. O cadastro — cliente, moto, placa, parceira, quem paga —
 *    tem de vir, senão o balcão digita tudo de novo e a oficina fica com dois
 *    cadastros da mesma moto.
 *
 * 2. O QUE NÃO PODE VIR. Peça, mão de obra e total são do atendimento
 *    anterior, que já foi pago. Se vierem, a oficina cobra do cliente a mesma
 *    peça duas vezes — e ninguém percebe até ele reclamar da segunda conta.
 *
 * Rode com: npm run check:order-return
 */
import { buildReturnPlan, canReturn } from "../src/order-return";
import type { OrderRecord } from "../src/types";

const entregue: OrderRecord = {
  id: "OS-0041", customer: "JOAO DA SILVA", bike: "Honda CG 160 Fan ESDI", plate: "ABC-1D23",
  mechanic: "RONALDO", mechanicIds: ["EMP-1"], time: "01/09/2026, 09:15", status: "Finalizada", tone: "green",
  clientId: "CLI-1", motorcycleId: "MOTO-1", mileage: "41200", priority: "Normal",
  partnerId: "PAR-1", partnerName: "GONZAGA MOTOS", partnerOrderId: "9912", payer: "partner",
  problem: "BARULHO NA CORRENTE.", solution: "KIT RELACAO SUBSTITUIDO.", notes: "AVISAR NO WHATSAPP.",
  items: [
    { id: "L1", type: "Mão de obra", name: "TROCA DO KIT", price: 90 },
    { id: "P1", type: "Peça", productId: "PRD-1", name: "KIT RELACAO", price: 180, quantity: 1, cost: 110 },
  ],
  total: 270, closed: true, closedAt: "02/09/2026",
  deductedItems: [{ productId: "PRD-1", quantity: 1 }],
  events: [{ at: "2026-09-01T12:15:00.000Z", what: "Ordem de serviço aberta", who: "RAYANE" }],
};

const plano = buildReturnPlan({ order: entregue, novoId: "OS-0058", quando: "16/09/2026, 14:30", quem: "MATHEUS" });
const nova = plano.novaOrdem;

const casos: Array<[string, unknown, unknown]> = [
  // Quem pode virar retorno.
  ["a OS entregue e paga aceita retorno", canReturn(entregue), true],
  ["a que ainda está na oficina não", canReturn({ closed: false }), false],
  ["e a que nunca foi encerrada também não", canReturn({}), false],

  // O cadastro vem junto: é a razão de o botão existir.
  ["o cliente vem junto", nova.customer, "JOAO DA SILVA"],
  ["a moto também", nova.bike, "Honda CG 160 Fan ESDI"],
  ["a placa", nova.plate, "ABC-1D23"],
  ["o cadastro do cliente, para a próxima OS achar o dono", nova.clientId, "CLI-1"],
  ["o cadastro da moto", nova.motorcycleId, "MOTO-1"],
  ["a quilometragem, que é o ponto de partida do novo serviço", nova.mileage, "41200"],
  ["a parceira que mandou a moto", nova.partnerName, "GONZAGA MOTOS"],
  ["e quem paga continua sendo quem pagava", nova.payer, "partner"],

  /*
    O QUE NÃO PODE VIR.

    O total e os itens do atendimento anterior já foram cobrados e já entraram
    no caixa. Trazer junto é cobrar duas vezes pela mesma peça.
  */
  ["a OS de retorno nasce sem itens", JSON.stringify(nova.items), "[]"],
  ["e sem valor nenhum", nova.total, 0],
  ["nada marcado como baixado do estoque", JSON.stringify(nova.deductedItems), "[]"],
  ["o diagnóstico do serviço anterior não vem", nova.solution, undefined],
  ["nem as observações", nova.notes, undefined],
  ["nem a data de encerramento", nova.closedAt, undefined],
  ["e ela NÃO nasce encerrada", nova.closed, undefined],
  // O número do papel da parceira é outro: repetir faria as duas OS se
  // confundirem na conferência dela no fim do mês.
  ["o número da OS do parceiro não é repetido", nova.partnerOrderId, undefined],
  // Mecânico se escolhe de novo: quem fez da primeira vez pode não ser quem
  // vai olhar o retorno, e herdar isso esconde o problema de quem precisa ver.
  ["nasce sem mecânico atribuído", JSON.stringify(nova.mechanicIds), "[]"],

  // A OS nova começa do começo.
  ["começa em avaliação", nova.status, "Em avaliação"],
  ["e o relato já diz de onde ela veio", nova.problem, "RETORNO DA OS-0041. BARULHO NA CORRENTE."],
  ["a ligação com a OS de origem fica gravada", nova.returnOfOrderId, "OS-0041"],
  ["a origem também, para a lista mostrar", nova.origin, "Retorno da OS-0041"],

  // E os dois lados se acham.
  ["o histórico da OS nova abre dizendo que é retorno", (nova.events as Array<{ what: string }>)[0].what, "Retorno da OS-0041 · 16/09/2026, 14:30"],
  ["a OS antiga ganha a linha apontando para a nova", plano.marcaNaAntiga.what, "Moto voltou em retorno · OS-0058"],
  ["com o nome de quem abriu", plano.marcaNaAntiga.who, "MATHEUS"],
];

// OS sem parceira e sem cadastro: o retorno tem de funcionar igual.
const simples: OrderRecord = {
  id: "OS-0002", customer: "MARIA", bike: "Biz 125", plate: "XYZ-9A87",
  mechanic: "", mechanicIds: [], time: "01/09/2026, 08:00", status: "Finalizada", tone: "green",
  total: 80, closed: true,
};
const plano2 = buildReturnPlan({ order: simples, novoId: "OS-0059", quando: "16/09/2026, 15:00", quem: "RAYANE" });
casos.push(
  ["OS sem parceira vira retorno do mesmo jeito", plano2.novaOrdem.customer, "MARIA"],
  ["sem inventar parceira", plano2.novaOrdem.partnerName, undefined],
  ["sem inventar cadastro de cliente", plano2.novaOrdem.clientId, undefined],
  ["e sem inventar quilometragem", plano2.novaOrdem.mileage, undefined],
  ["o relato diz que é retorno mesmo sem problema anterior", plano2.novaOrdem.problem, "RETORNO DA OS-0002."],
);

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0
  ? "\nO retorno traz o cadastro e não traz a conta do serviço anterior."
  : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

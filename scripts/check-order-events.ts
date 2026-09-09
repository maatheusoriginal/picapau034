/**
 * Confere o histórico da ordem de serviço.
 *
 * É registro que ninguém digita: se ele anotar errado, ninguém corrige — a
 * oficina só descobre meses depois, discutindo com o cliente, que a linha do
 * tempo mentiu. Por isso cada regra é conferida aqui.
 *
 * Rode com: npm run check:order-events
 */
import {
  appendEvents,
  changeEvents,
  eventStamp,
  eventTime,
  isoDaDataBrasileira,
  MAX_ORDER_EVENTS,
  orderEvent,
  orderTimeline,
} from "../src/order-events";
import type { OrderEvent, OrderRecord, ServiceOrderItem } from "../src/types";

const item = (name: string, quantity = 1): ServiceOrderItem =>
  ({ id: name, type: "Peça", name, price: 10, quantity }) as ServiceOrderItem;

const QUANDO = "2026-09-09T17:32:00.000Z";

// --- mudanças ---------------------------------------------------------------
const trocaDeSituacao = changeEvents({ status: "Recepção" }, { status: "Em serviço" }, "RAYANE", QUANDO);
const primeiraSituacao = changeEvents({}, { status: "Recepção" }, "RAYANE", QUANDO);
const semMudanca = changeEvents({ status: "Em serviço", mechanic: "RONALDO" }, { status: "Em serviço", mechanic: "RONALDO" }, "RAYANE", QUANDO);

const pecaIncluida = changeEvents({ items: [item("ÓLEO")] }, { items: [item("ÓLEO"), item("RETENTOR")] }, "RONALDO", QUANDO);
const pecaRetirada = changeEvents({ items: [item("ÓLEO"), item("RETENTOR")] }, { items: [item("ÓLEO")] }, "RONALDO", QUANDO);
const mesmaPecaDeNovo = changeEvents({ items: [item("RETENTOR", 1)] }, { items: [item("RETENTOR", 2)] }, "RONALDO", QUANDO);
const itensIguais = changeEvents({ items: [item("ÓLEO")] }, { items: [item("ÓLEO")] }, "RONALDO", QUANDO);

// --- linha do tempo ---------------------------------------------------------
const osAntiga: Partial<OrderRecord> = { time: "03/09/2026, 08:15", status: "Em serviço" };
const osAntigaEncerrada: Partial<OrderRecord> = { time: "03/09/2026, 08:15", closed: true, closedAt: "05/09/2026", paymentMethod: "PIX" };
const osNova: Partial<OrderRecord> = {
  time: "09/09/2026, 08:15",
  events: [
    orderEvent("Ordem de serviço aberta · 09/09/2026, 08:15", "RAYANE", "2026-09-09T11:15:00.000Z"),
    orderEvent("Situação: Recepção → Em serviço", "RONALDO", "2026-09-09T13:40:00.000Z"),
  ],
};
// Linha carimbada fora de ordem: a tela precisa devolver em ordem de relógio.
const foraDeOrdem: Partial<OrderRecord> = {
  events: [
    orderEvent("Situação: Recepção → Em serviço", "RONALDO", "2026-09-09T13:40:00.000Z"),
    orderEvent("Ordem de serviço aberta", "RAYANE", "2026-09-09T11:15:00.000Z"),
  ],
};
const semDataValida: Partial<OrderRecord> = {
  events: [orderEvent("Primeira", "", "não é data"), orderEvent("Segunda", "", "também não")],
};

const cheia: OrderEvent[] = Array.from({ length: MAX_ORDER_EVENTS }, (_, indice) => orderEvent(`linha ${indice}`, "", QUANDO));
const passouDoTeto = appendEvents(cheia, [orderEvent("a mais", "", QUANDO)]);

const casos: Array<[string, unknown, unknown]> = [
  // A situação é a pergunta que a oficina faz ao telefone.
  ["troca de situação vira linha", trocaDeSituacao[0]?.what, "Situação: Recepção → Em serviço"],
  ["e guarda quem mexeu", trocaDeSituacao[0]?.who, "RAYANE"],
  ["e a hora exata", trocaDeSituacao[0]?.at, QUANDO],
  ["a primeira situação não inventa um 'de'", primeiraSituacao[0]?.what, "Situação: Recepção"],
  ["salvar sem mudar nada não anota", semMudanca.length, 0],

  // Peça lançada e peça tirada: é o que o cliente contesta na entrega.
  ["peça incluída aparece pelo nome", pecaIncluida[0]?.what, "Incluído: RETENTOR"],
  ["peça retirada também", pecaRetirada[0]?.what, "Retirado: RETENTOR"],
  // A mesma peça pegada de novo SOMA na linha que já existe, então "2x" onde
  // havia "1x" é entrada nova — e não a mesma linha de antes.
  ["pegar a mesma peça de novo é entrada nova", mesmaPecaDeNovo.map((linha) => linha.what).join(" | "), "Incluído: 2x RETENTOR | Retirado: RETENTOR"],
  ["lista igual não gera linha", itensIguais.length, 0],

  ["mecânico trocado aparece", changeEvents({ mechanic: "" }, { mechanic: "RONALDO" }, "", QUANDO)[0]?.what, "Mecânico: RONALDO"],
  ["mecânico apagado não vira linha vazia", changeEvents({ mechanic: "RONALDO" }, { mechanic: "" }, "", QUANDO).length, 0],
  ["previsão de entrega aparece", changeEvents({}, { delivery: "11/09/2026" }, "", QUANDO)[0]?.what, "Previsão de entrega: 11/09/2026"],
  ["o serviço executado é anotado sem repetir o texto", changeEvents({}, { solution: "TROCA DE RETENTOR" }, "", QUANDO)[0]?.what, "Serviço executado descrito"],

  // OS de antes deste histórico não pode aparecer vazia.
  ["OS antiga ganha a abertura reconstruída", orderTimeline(osAntiga)[0]?.what, "Ordem de serviço aberta · 03/09/2026, 08:15"],
  ["e só ela", orderTimeline(osAntiga).length, 1],
  ["OS antiga encerrada ganha as duas pontas", orderTimeline(osAntigaEncerrada).map((linha) => linha.what).join(" | "), "Ordem de serviço aberta · 03/09/2026, 08:15 | Encerrada · PIX"],
  ["e na ordem certa", orderTimeline(osAntigaEncerrada)[0]?.what.startsWith("Ordem de serviço aberta"), true],

  ["OS nova não ganha abertura duplicada", orderTimeline(osNova).filter((linha) => linha.what.startsWith("Ordem de serviço aberta")).length, 1],
  ["e mantém as duas linhas", orderTimeline(osNova).length, 2],
  ["linha carimbada fora de ordem volta em ordem de relógio", orderTimeline(foraDeOrdem)[0]?.what, "Ordem de serviço aberta"],
  ["data que não dá para entender não embaralha o resto", orderTimeline(semDataValida).map((linha) => linha.what).join(","), "Primeira,Segunda"],

  // O teto existe para uma OS grande não derrubar o documento.
  ["o teto segura o tamanho", passouDoTeto.length, MAX_ORDER_EVENTS],
  ["e quem cai é a linha mais antiga", passouDoTeto[0]?.what, "linha 1"],
  ["a mais nova fica", passouDoTeto[passouDoTeto.length - 1]?.what, "a mais"],
  ["abaixo do teto não corta nada", appendEvents([orderEvent("a", "", QUANDO)], [orderEvent("b", "", QUANDO)]).length, 2],
  ["OS sem histórico aceita a primeira linha", appendEvents(undefined, [orderEvent("a", "", QUANDO)]).length, 1],

  // Formatação: a hora é o que ele pediu para enxergar.
  ["a hora sai no formato da oficina", eventTime("2026-09-09T17:32:00.000Z").length, 5],
  ["dia e hora juntos", eventStamp("2026-09-09T17:32:00.000Z").includes("/2026"), true],
  ["data inválida não vira 'Invalid Date' na tela", eventTime("qualquer coisa"), ""],
  ["nem no carimbo completo", eventStamp("qualquer coisa"), ""],

  // A reconstrução da OS antiga depende disto.
  ["data brasileira com hora vira ISO", isoDaDataBrasileira("03/09/2026, 08:15").slice(0, 4), "2026"],
  ["data brasileira sem hora também", isoDaDataBrasileira("03/09/2026") !== "", true],
  ["texto que não é data não vira ISO", isoDaDataBrasileira("ontem"), ""],

  ["quem fez fica de fora quando o sistema não sabe", orderEvent("x", "").who, undefined],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO histórico da OS conta a história certa." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

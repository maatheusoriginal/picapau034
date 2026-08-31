/**
 * Confere o quadro do mecânico.
 *
 * O que este script protege: um mecânico que não enxerga a própria OS vai
 * perguntar para alguém, e um que enxerga OS que não é dele mexe no serviço
 * do colega. Os dois estragam o dia da oficina de formas difíceis de rastrear
 * depois.
 *
 * Rode com: npm run check:mechanic
 */
import { actionLabelFor, boardRow, isAssignedTo, mechanicBoard, mechanicSummary, mechanicsAfterTaking, nextStatusFor, takeLabelFor } from "../src/mechanic";
import type { OrderRecord } from "../src/types";

const json = (value: unknown) => JSON.stringify(value);
const RONALDO = "USR-003";
const ANA = "USR-007";

const orders = [
  // Do Ronaldo, na bancada agora.
  { id: "OS-0001", customer: "João", status: "Em serviço", mechanicIds: [RONALDO] },
  // Do Ronaldo, ainda não começou.
  { id: "OS-0002", customer: "Marta", status: "Aprovação", mechanicIds: [RONALDO] },
  // Do Ronaldo, já pronta esperando o cliente.
  { id: "OS-0003", customer: "Bruno", status: "Entrega", mechanicIds: [RONALDO] },
  // Do Ronaldo, mas ENCERRADA: saiu da oficina, não aparece mais.
  { id: "OS-0004", customer: "Antigo", status: "Entrega", mechanicIds: [RONALDO], closed: true },
  // Da Ana.
  { id: "OS-0005", customer: "Carlos", status: "Em serviço", mechanicIds: [ANA] },
  // Sem ninguém: é o que está livre para pegar.
  { id: "OS-0006", customer: "Rayane", status: "Recepção", mechanicIds: [] },
  // Compartilhada entre os dois.
  { id: "OS-0007", customer: "Pedro", status: "Em serviço", mechanicIds: [ANA, RONALDO] },
] as unknown as OrderRecord[];

const board = mechanicBoard(orders, RONALDO);
const resumo = mechanicSummary(board);
const semVinculo = mechanicBoard(orders, "");

const livre = orders.find((o) => o.id === "OS-0006")!;
const daAna = orders.find((o) => o.id === "OS-0005")!;
const minha = orders.find((o) => o.id === "OS-0001")!;

const casos: Array<[string, unknown, unknown]> = [
  // --- De quem é a OS ---
  ["a OS atribuída a ele é dele", isAssignedTo(minha, RONALDO), true],
  ["a OS da colega não é dele", isAssignedTo(daAna, RONALDO), false],
  ["OS sem mecânico não é de ninguém", isAssignedTo(livre, RONALDO), false],
  ["OS compartilhada é dos dois", isAssignedTo(orders[6]!, RONALDO) && isAssignedTo(orders[6]!, ANA), true],
  ["sem vínculo de funcionário, nada é dele", isAssignedTo(minha, ""), false],

  // --- O quadro ---
  ["as OS dele aparecem em 'minhas'", json(board.mine.map((o) => o.id)), json(["OS-0001", "OS-0007", "OS-0002", "OS-0003"])],
  ["OS encerrada não aparece", board.mine.some((o) => o.id === "OS-0004"), false],
  ["nem entre as da oficina", board.shop.some((o) => o.id === "OS-0004"), false],
  ["o que é dos outros fica em 'na oficina'", json(board.shop.map((o) => o.id)), json(["OS-0005", "OS-0006"])],
  ["o que está na bancada vem primeiro", board.mine[0]!.status, "Em serviço"],
  ["o que já está pronto vai para o fim", board.mine[board.mine.length - 1]!.status, "Entrega"],
  ["nenhuma OS aparece nas duas listas", board.mine.some((m) => board.shop.some((s) => s.id === m.id)), false],
  ["nenhuma OS aberta se perde", board.mine.length + board.shop.length, orders.filter((o) => !o.closed).length],

  // --- Sem vínculo com funcionário ---
  ["sem vínculo, nada cai em 'minhas'", semVinculo.mine.length, 0],
  ["e tudo que está aberto aparece como da oficina", semVinculo.shop.length, 6],

  // --- Resumo ---
  ["quantas ele está fazendo agora", resumo.working, 2],
  ["quantas ainda não começou", resumo.waiting, 1],
  ["quantas dele estão prontas", resumo.ready, 1],
  ["quantas há para pegar", resumo.available, 2],

  // --- O passo de um toque ---
  ["quem não começou, inicia", nextStatusFor("Recepção"), "Em serviço"],
  ["orçamento aprovado vai para a bancada", nextStatusFor("Aprovação"), "Em serviço"],
  ["quem está em serviço, fica pronta", nextStatusFor("Em serviço"), "Entrega"],
  ["quem já está pronta não tem próximo passo", nextStatusFor("Entrega"), null],
  ["o botão diz o que vai fazer", actionLabelFor("Em serviço"), "Marcar pronta"],
  ["e some quando não há o que fazer", actionLabelFor("Entrega"), ""],
  ["OS livre convida a pegar", takeLabelFor("Recepção"), "Pegar esta OS"],
  ["OS já em serviço convida a ajudar", takeLabelFor("Em serviço"), "Ajudar nesta"],

  // --- Assumir a OS ---
  ["pegar uma OS livre coloca o nome dele", json(mechanicsAfterTaking(livre, RONALDO)), json([RONALDO])],
  ["ajudar não apaga quem já estava", json(mechanicsAfterTaking(daAna, RONALDO)), json([ANA, RONALDO])],
  ["pegar duas vezes não duplica", json(mechanicsAfterTaking(minha, RONALDO)), json([RONALDO])],
  ["com um mecânico por OS, assumir é troca", json(mechanicsAfterTaking(daAna, RONALDO, false)), json([RONALDO])],
  ["sem vínculo, a equipe não muda", json(mechanicsAfterTaking(daAna, "")), json([ANA])],

  // --- A linha pronta para a tela ---
  ["a linha sabe que a OS é dele", boardRow(minha, RONALDO).mine, true],
  ["e oferece o passo seguinte", boardRow(minha, RONALDO).target, "Entrega"],
  ["a linha da colega oferece ajudar", boardRow(daAna, RONALDO).action, "Ajudar nesta"],
  ["mas não muda a situação dela", boardRow(daAna, RONALDO).target, null],
  ["a linha livre leva direto para a bancada", boardRow(livre, RONALDO).target, "Em serviço"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nO quadro do mecânico está certo." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere o histórico de atendimento.
 *
 * Rode com: npm run check:history
 */
import { clientHistory, historyServices, historySortKey, motorcycleHistory } from "../src/history";
import type { MotorcycleRecord, OrderRecord } from "../src/types";

const os = (partes: Partial<OrderRecord>): OrderRecord => ({
  id: "OS-X", customer: "", bike: "", plate: "", mechanic: "", mechanicIds: [],
  time: "", status: "Recepção", tone: "", ...partes,
});
const moto = (partes: Partial<MotorcycleRecord>): MotorcycleRecord => ({
  id: "MOTO-X", ownerId: "", plate: "", model: "", year: "", color: "", ...partes,
});

const motos = [
  moto({ id: "MOTO-ABC1D23", ownerId: "CLI-1", plate: "ABC-1D23", model: "CG 160 Fan" }),
  moto({ id: "MOTO-XYZ9999", ownerId: "CLI-2", plate: "XYZ-9999", model: "Factor 150" }),
];
const ordens = [
  os({ id: "OS-0001", clientId: "CLI-1", plate: "ABC-1D23", bike: "Honda CG 160 Fan",
       time: "02/01/2026", closedAt: "05/01/2026", closed: true, total: 150,
       items: [{ id: "1", type: "Mão de obra", name: "Troca do kit relação", price: 150 }] }),
  os({ id: "OS-0002", clientId: "CLI-1", plate: "ABC-1D23", bike: "Honda CG 160 Fan",
       time: "28/06/2026", closedAt: "28/06/2026", closed: true, total: 90,
       items: [{ id: "1", type: "Peça", name: "Óleo 20W50", price: 40 },
               { id: "2", type: "Mão de obra", name: "Troca de óleo", price: 50 }] }),
  // Aberta antes de o cadastro existir: guarda a placa, não o id do cliente.
  os({ id: "OS-0003", plate: "ABC-1D23", bike: "Honda CG 160 Fan", time: "10/03/2026",
       total: 70, service: "Regulagem de válvulas" }),
  // Ainda na bancada: entra na lista, mas não conta como dinheiro que entrou.
  os({ id: "OS-0004", clientId: "CLI-1", plate: "ABC-1D23", time: "01/08/2026",
       total: 500, status: "Em serviço" }),
  os({ id: "OS-0005", clientId: "CLI-2", plate: "XYZ-9999", time: "03/03/2026",
       closedAt: "03/03/2026", closed: true, total: 300 }),
];

const doCliente = clientHistory({ id: "CLI-1" }, ordens, motos);
const daMoto = motorcycleHistory(motos[0], ordens);
const vazio = clientHistory(null, ordens, motos);

const casos: Array<[string, unknown, unknown]> = [
  ["a data brasileira vira chave que ordena", historySortKey("28/06/2026"), "2026-06-28"],
  ["com hora também", historySortKey("28/06/2026 14:30"), "2026-06-28"],
  ["data ISO passa direto", historySortKey("2026-06-28"), "2026-06-28"],
  ["data que não dá para entender fica sem chave", historySortKey("ontem"), ""],
  ["data vazia fica sem chave", historySortKey(""), ""],

  ["o serviço sai dos itens da OS", historyServices(ordens[1]), "Óleo 20W50, Troca de óleo"],
  ["sem itens, usa o resumo do serviço", historyServices(ordens[2]), "Regulagem de válvulas"],
  ["sem nada, avisa em vez de vir vazio", historyServices(os({})), "Sem serviço descrito"],

  ["o histórico do cliente traz as OS dele", doCliente.visits, 4],
  ["inclusive a antiga, achada pela placa da moto dele", doCliente.entries.some((e) => e.id === "OS-0003"), true],
  ["e nenhuma de outro cliente", doCliente.entries.some((e) => e.id === "OS-0005"), false],
  // Ordenar por texto colocaria 02/01 depois de 28/06.
  ["da mais recente para a mais antiga", doCliente.entries.map((e) => e.id).join(","), "OS-0004,OS-0002,OS-0003,OS-0001"],
  ["a última visita é a mais recente", doCliente.lastVisit, "01/08/2026"],
  // 150 + 90; os 500 da OS aberta não entram, e a de outro cliente também não.
  ["só OS encerrada conta como dinheiro que entrou", doCliente.totalSpent, 240],
  ["a data mostrada é a do encerramento quando houve", doCliente.entries[1].date, "28/06/2026"],
  ["OS aberta aparece com a data de abertura", doCliente.entries[0].date, "01/08/2026"],

  ["o histórico da moto acha pela placa", daMoto.visits, 4],
  ["e não pega a moto do vizinho", daMoto.entries.some((e) => e.plate === "XYZ-9999"), false],

  ["sem cliente, histórico vazio", vazio.visits, 0],
  ["sem cliente, nada gasto", vazio.totalSpent, 0],
  ["sem cliente, sem última visita", vazio.lastVisit, ""],
  ["sem moto, histórico vazio", motorcycleHistory(null, ordens).visits, 0],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO histórico de atendimento fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

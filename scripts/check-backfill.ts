/**
 * Confere o lançamento da OS antiga.
 *
 * O que está sendo testado é que uma OS lançada para o histórico NÃO se
 * comporta como uma OS de hoje: não entra na fila da oficina, não baixa peça,
 * não cai na gaveta do caixa e não inventa faturamento no mês em que o serviço
 * foi feito. E que a data que vai para o papel é a do papel, não a de hoje.
 *
 * Rode com: npm run check:backfill
 */
import { dataBrasileira, instanteDaOSAntiga, problemasDaOSAntiga, registroDaOSAntiga, separarMarcaEModelo, type OSAntiga } from "../src/backfill";
import { historySortKey, motorcycleHistory } from "../src/history";
import { revenueEntries } from "../src/finance";
import type { MotorcycleRecord, OrderRecord, SaleRecord } from "../src/types";

const HOJE = new Date(2026, 8, 8); // 08/09/2026

const daGonzaga: OSAntiga = {
  data: "2026-09-03", placa: "ECF9G16", moto: "Honda CB 600F Hornet", cliente: "Gonzaga Motos",
  servico: "Verificar barulho na parte de trás da moto", valor: 180,
  parceiroId: "PAR-1", parceiroNome: "Gonzaga Motos", osDoParceiro: "001684",
};
const registro = registroDaOSAntiga(daGonzaga) as OrderRecord;
const comoOS: OrderRecord = { ...registro, id: "OS-0031", mechanic: "", mechanicIds: [], tone: "green" } as OrderRecord;

// Uma OS de verdade, encerrada hoje, para provar que o filtro separa as duas.
const daOficina: OrderRecord = {
  id: "OS-0032", customer: "Rayane", bike: "Honda CG 160", plate: "ECF9G16", mechanic: "João",
  mechanicIds: ["F1"], time: "08/09/2026, 09:10", status: "Entrega", tone: "green",
  items: [], total: 200, closed: true, closedAt: "08/09/2026", paymentMethod: "Dinheiro",
};

const moto: MotorcycleRecord = { id: "MOT-1", plate: "ECF9G16", brand: "Honda", model: "CB 600F Hornet" } as MotorcycleRecord;
const historico = motorcycleHistory(moto, [comoOS, daOficina]);

const casos: Array<[string, unknown, unknown]> = [
  // --- Marca e modelo, digitados de uma vez como estão no papel ---
  ["separa a marca conhecida do modelo",
    JSON.stringify(separarMarcaEModelo("Honda CB 600F Hornet", ["Honda", "Yamaha"])),
    JSON.stringify({ marca: "Honda", modelo: "CB 600F Hornet" })],
  // Sem esta trava, "CB 600F Hornet" viraria marca "CB" — e a moto ficaria
  // cadastrada numa marca que não existe, sumindo do filtro por marca.
  ["marca desconhecida não é inventada",
    JSON.stringify(separarMarcaEModelo("CB 600F Hornet", ["Honda", "Yamaha"])),
    JSON.stringify({ marca: "", modelo: "CB 600F Hornet" })],
  ["ignora maiúscula e minúscula",
    separarMarcaEModelo("HONDA Biz 125", ["Honda"]).marca, "Honda"],
  ["espaço a mais não atrapalha",
    separarMarcaEModelo("  Yamaha   Factor 150 ", ["Yamaha"]).modelo, "Factor 150"],
  ["texto vazio não vira nada",
    JSON.stringify(separarMarcaEModelo("", ["Honda"])), JSON.stringify({ marca: "", modelo: "" })],
  ["só a marca, sem modelo",
    JSON.stringify(separarMarcaEModelo("Honda", ["Honda"])), JSON.stringify({ marca: "Honda", modelo: "" })],

  // --- A data ---
  ["a data do papel vira data brasileira", dataBrasileira("2026-09-03"), "03/09/2026"],
  ["data vazia não vira nada", dataBrasileira(""), ""],
  ["data pela metade não vira nada", dataBrasileira("2026-09"), ""],
  // O histórico ordena por dd/mm/aaaa: data sem ano não ordena, e era assim
  // que a OS aberta na tela vinha sendo gravada.
  ["a data lançada ordena no histórico", historySortKey(registro.time ?? ""), "2026-09-03"],
  ["o instante fica ao meio-dia, longe da virada do fuso",
    instanteDaOSAntiga("2026-09-03").slice(11, 16) !== "", true],

  // --- O que impede de gravar ---
  ["sem data, reclama", problemasDaOSAntiga({ ...daGonzaga, data: "" }, HOJE).length, 1],
  ["sem placa, reclama", problemasDaOSAntiga({ ...daGonzaga, placa: "" }, HOJE).length, 1],
  ["sem descrição do serviço, reclama", problemasDaOSAntiga({ ...daGonzaga, servico: "" }, HOJE).length, 1],
  ["valor negativo, reclama", problemasDaOSAntiga({ ...daGonzaga, valor: -1 }, HOJE).length, 1],
  // Data no futuro é erro de digitação, e jogaria a OS para o topo do
  // histórico, empurrando para baixo o serviço que foi feito de verdade.
  ["data no futuro, reclama", problemasDaOSAntiga({ ...daGonzaga, data: "2026-12-01" }, HOJE).length, 1],
  ["o próprio dia de hoje é aceito", problemasDaOSAntiga({ ...daGonzaga, data: "2026-09-08" }, HOJE).length, 0],
  ["valor zero é aceito: nem toda OS antiga tem valor anotado",
    problemasDaOSAntiga({ ...daGonzaga, valor: 0 }, HOJE).length, 0],
  ["tudo preenchido não reclama de nada", problemasDaOSAntiga(daGonzaga, HOJE).length, 0],
  ["e reclama de tudo de uma vez, não de um por vez",
    problemasDaOSAntiga({ data: "", placa: "", servico: "", valor: -5 }, HOJE).length, 4],

  // --- Como a OS nasce ---
  ["nasce encerrada", registro.closed, true],
  ["não fica na fila da oficina", registro.status, "Entrega"],
  ["a data de abertura é a do papel", registro.time, "03/09/2026"],
  ["e a de encerramento também", registro.closedAt, "03/09/2026"],
  ["não leva item nenhum", (registro.items ?? []).length, 0],
  ["e não baixa peça do estoque", (registro.deductedItems ?? []).length, 0],
  ["fica marcada como lançamento de histórico", registro.backfilled, true],
  ["guarda o número da OS do parceiro", registro.partnerOrderId, "001684"],
  ["guarda quem mandou a moto", registro.partnerName, "Gonzaga Motos"],
  ["a origem diz de onde veio", registro.origin, "Encaminhado por Gonzaga Motos"],
  ["o valor fica gravado, para o histórico dizer quanto já se gastou", registro.total, 180],
  ["sem cliente informado, não inventa nome",
    registroDaOSAntiga({ ...daGonzaga, cliente: "" }).customer, "Cliente não identificado"],
  ["sem parceiro, não grava número de parceiro",
    "partnerOrderId" in registroDaOSAntiga({ ...daGonzaga, osDoParceiro: "" }), false],

  // --- O dinheiro NÃO se mexe ---
  // Esta é a conferência que mais importa: a OS antiga nasce `closed`, e o
  // faturamento soma toda OS encerrada. Sem o filtro, lançar o histórico
  // inventaria receita que a oficina já contou de outro jeito.
  ["a OS antiga fica fora do faturamento",
    revenueEntries([] as SaleRecord[], [comoOS]).length, 0],
  ["a OS de verdade continua entrando",
    revenueEntries([] as SaleRecord[], [daOficina]).length, 1],
  ["e as duas juntas somam só a de verdade",
    revenueEntries([] as SaleRecord[], [comoOS, daOficina]).reduce((soma, e) => soma + e.settled, 0), 200],

  // --- Mas o histórico da moto mostra as duas ---
  ["o histórico da moto traz as duas visitas", historico.visits, 2],
  ["a mais recente vem primeiro", historico.entries[0]?.id, "OS-0032"],
  ["e a antiga aparece com a data dela", historico.entries[1]?.date, "03/09/2026"],
  ["o que foi feito aparece na linha",
    historico.entries[1]?.services, "Verificar barulho na parte de trás da moto"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nA OS antiga entra no histórico sem mexer no dinheiro." : `\n${falhas} caso(s) errados.`);
if (falhas) process.exit(1);

/**
 * Confere a busca de moto na OS de empresa parceira.
 *
 * O que este script protege: os dois defeitos que a oficina encontrou usando o
 * sistema. Com a placa gravada "FLA-2C34", digitar "FLA2" não achava a moto que
 * estava na frota; e uma moto que já existia no sistema, cadastrada para um
 * cliente, não aparecia de jeito nenhum — o caminho que sobrava era cadastrar a
 * mesma placa outra vez e partir o histórico da moto em dois.
 *
 * Rode com: npm run check:fleet
 */
import { avisoDeMotoDeFora, buscarMotos, estaNaFrota, motoBate, type MotoBuscavel } from "../src/fleet";

const json = (value: unknown) => JSON.stringify(value);
const FLASH = "PART-FLASH";
const OUTRA = "PART-OUTRA";

const motos: MotoBuscavel[] = [
  // Frota da Flash: sem dono individual, quem responde é a parceira.
  { id: "MOTO-FLA2C34", plate: "FLA-2C34", brand: "Honda", model: "Biz", year: "2026", partnerId: FLASH },
  { id: "MOTO-FLA9Z88", plate: "FLA-9Z88", brand: "Honda", model: "Pop 110i", year: "2024", partnerId: FLASH },
  // A moto do cliente, que já rodou na oficina antes de virar da parceira.
  { id: "MOTO-TES1D23", plate: "TES-1D23", brand: "Honda", model: "CG 160 Fan", year: "2023", ownerId: "CLI-001", ownerName: "CLIENTE DE TESTE" },
  // De outra parceira: também é "de fora" para a Flash.
  { id: "MOTO-ZZZ4444", plate: "ZZZ-4444", brand: "Yamaha", model: "Factor", year: "2022", partnerId: OUTRA },
  // Com acento no modelo e no dono, para a comparação não depender de acento.
  { id: "MOTO-ACE1A11", plate: "ACE-1A11", brand: "Honda", model: "Biz Ação", year: "2021", ownerId: "CLI-005", ownerName: "MÁRCIA GONÇALVES" },
];

const daFlash = motos[0]!;
const doCliente = motos[2]!;
const daOutra = motos[3]!;

const semBusca = buscarMotos(motos, FLASH, "");
const porPlacaCurta = buscarMotos(motos, FLASH, "FLA2");
const porPlacaDeFora = buscarMotos(motos, FLASH, "TES1");
const porTresLetras = buscarMotos(motos, FLASH, "FLA");
const porModelo = buscarMotos(motos, FLASH, "biz");

const casos: Array<[string, unknown, unknown]> = [
  // --- A placa com hífen ---
  // O defeito exato que a oficina viu: a moto estava na frota, na lista logo
  // abaixo, e digitar a placa sem o hífen não achava.
  ["FLA2 acha a moto FLA-2C34", motoBate(daFlash, "FLA2"), true],
  ["a placa inteira sem hífen acha", motoBate(daFlash, "FLA2C34"), true],
  ["a placa inteira com hífen acha", motoBate(daFlash, "fla-2c34"), true],
  ["com espaço no meio também acha", motoBate(daFlash, "FLA 2C34"), true],
  ["minúscula acha", motoBate(daFlash, "fla2"), true],
  ["placa de outra moto não acha", motoBate(daFlash, "TES1"), false],
  ["busca vazia casa com qualquer moto", motoBate(daFlash, "   "), true],

  // --- Marca, modelo e dono ---
  ["acha pelo modelo", motoBate(daFlash, "biz"), true],
  ["acha pela marca", motoBate(daFlash, "honda"), true],
  ["acha pelo ano", motoBate(daFlash, "2026"), true],
  ["acento no modelo não atrapalha", motoBate(motos[4]!, "acao"), true],
  ["acento no nome do dono não atrapalha", motoBate(motos[4]!, "marcia"), true],
  ["modelo que não existe não acha", motoBate(daFlash, "titan"), false],

  // --- De quem é a moto ---
  ["a moto da frota é da parceira", estaNaFrota(daFlash, FLASH), true],
  ["a moto do cliente não é da parceira", estaNaFrota(doCliente, FLASH), false],
  ["a moto de outra parceira não é desta", estaNaFrota(daOutra, FLASH), false],
  ["sem parceira escolhida, nada é da frota", estaNaFrota(daFlash, ""), false],

  // --- Os dois grupos ---
  ["sem busca, a frota inteira aparece", json(semBusca.daFrota.map((m) => m.id)), json(["MOTO-FLA2C34", "MOTO-FLA9Z88"])],
  // Sem texto digitado, despejar o sistema inteiro embaixo da frota
  // transformaria escolher em procurar.
  ["sem busca, nada de fora aparece", semBusca.foraDaFrota.length, 0],
  ["uma letra só ainda não varre o sistema", buscarMotos(motos, FLASH, "T").foraDaFrota.length, 0],
  ["FLA2 acha na frota", json(porPlacaCurta.daFrota.map((m) => m.id)), json(["MOTO-FLA2C34"])],
  ["e não traz nada de fora", porPlacaCurta.foraDaFrota.length, 0],
  // O segundo defeito: a moto do cliente existia e não aparecia de jeito
  // nenhum, então o caminho era cadastrar a mesma placa outra vez.
  ["TES1 acha a moto do cliente fora da frota", json(porPlacaDeFora.foraDaFrota.map((m) => m.id)), json(["MOTO-TES1D23"])],
  ["e a frota fica vazia nessa busca", porPlacaDeFora.daFrota.length, 0],
  ["FLA acha as duas da frota", porTresLetras.daFrota.length, 2],
  ["biz acha a da frota e a do cliente, cada uma no seu grupo",
    json([porModelo.daFrota.map((m) => m.id), porModelo.foraDaFrota.map((m) => m.id)]),
    json([["MOTO-FLA2C34"], ["MOTO-ACE1A11"]])],
  ["a moto de outra parceira entra em 'fora da frota'", buscarMotos(motos, FLASH, "ZZZ").foraDaFrota[0]?.id, "MOTO-ZZZ4444"],
  ["nenhuma moto aparece nos dois grupos",
    buscarMotos(motos, FLASH, "a").daFrota.some((m) => buscarMotos(motos, FLASH, "a").foraDaFrota.some((o) => o.id === m.id)), false],
  ["a ordem é pela placa", json(buscarMotos(motos, FLASH, "honda").foraDaFrota.map((m) => m.plate)), json(["ACE-1A11", "TES-1D23"])],

  // --- O aviso de quem é a moto ---
  ["a moto da frota não gera aviso", avisoDeMotoDeFora(daFlash, FLASH, "FLASH ENTREGAS"), ""],
  ["a moto do cliente diz de quem é", avisoDeMotoDeFora(doCliente, FLASH, "FLASH ENTREGAS"), "Esta moto é de CLIENTE DE TESTE, não da frota da FLASH ENTREGAS."],
  ["a moto de outra parceira diz que é de outra", avisoDeMotoDeFora(daOutra, FLASH, "FLASH ENTREGAS"), "Esta moto é de outra empresa parceira, não da FLASH ENTREGAS."],
  ["moto sem dono nenhum só diz que não está na frota",
    avisoDeMotoDeFora({ id: "X", plate: "SEM-0001" }, FLASH, "FLASH ENTREGAS"), "Esta moto ainda não está na frota da FLASH ENTREGAS."],
  ["sem moto escolhida não há aviso", avisoDeMotoDeFora(null, FLASH, "FLASH ENTREGAS"), ""],
  ["sem parceira escolhida não há aviso", avisoDeMotoDeFora(doCliente, "", "FLASH ENTREGAS"), ""],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nA busca de moto da parceira está certa." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

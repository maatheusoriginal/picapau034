/**
 * Confere o catálogo de marca, modelo e versão de moto.
 *
 * O cadastro pedia o modelo em texto livre, e a mesma moto entrava como
 * "CG 160 Fan", "cg160 fan" e "CG FAN 160" — o histórico da moto e a busca por
 * modelo paravam de funcionar.
 *
 * Rode com: npm run check:motorcycle-catalog
 */
import { catalogBrands, fullModelName, modelsOf, motorcycleCatalog, splitModelName, versionsOf } from "../src/motorcycle-catalog";
import { defaultSystemLists } from "../src/types";

const json = (v: unknown) => JSON.stringify(v);
const marcas = catalogBrands();

const casos: Array<[string, unknown, unknown]> = [
  // O catálogo
  ["tem as marcas que a oficina atende", marcas.length >= 10, true],
  ["as marcas vêm em ordem alfabética", json(marcas), json([...marcas].sort((a, b) => a.localeCompare(b, "pt-BR")))],
  ["Honda está no catálogo", marcas.includes("Honda"), true],
  ["toda marca tem pelo menos um modelo", marcas.every((marca) => modelsOf(marca).length > 0), true],
  ["nenhum modelo aparece duas vezes na mesma marca", marcas.every((marca) => new Set(modelsOf(marca)).size === modelsOf(marca).length), true],
  ["nenhuma versão aparece duas vezes no mesmo modelo", Object.values(motorcycleCatalog).every((modelos) => modelos.every((m) => new Set(m.versions).size === m.versions.length)), true],

  // As marcas do catálogo precisam existir na lista que o cadastro oferece,
  // senão a pessoa escolhe uma marca e não aparece modelo nenhum.
  ["toda marca do catálogo está na lista do cadastro", marcas.every((marca) => defaultSystemLists.motorcycleBrands.includes(marca)), true],

  // Modelos e versões
  ["Honda tem CG 160", modelsOf("Honda").includes("CG 160"), true],
  ["CG 160 tem a versão Fan", versionsOf("Honda", "CG 160").includes("Fan"), true],
  ["Yamaha tem Factor", modelsOf("Yamaha").includes("Factor"), true],
  ["marca desconhecida não quebra, devolve lista vazia", modelsOf("Marca Inventada").length, 0],
  ["modelo desconhecido não quebra", versionsOf("Honda", "Modelo Inventado").length, 0],
  ["versão de marca desconhecida não quebra", versionsOf("Marca Inventada", "CG 160").length, 0],

  // Como o modelo fica gravado
  ["modelo e versão viram um nome só", fullModelName("CG 160", "Fan"), "CG 160 Fan"],
  ["sem versão, fica só o modelo", fullModelName("CG 160", ""), "CG 160"],
  ["sem modelo, fica só a versão digitada", fullModelName("", "Custom"), "Custom"],
  ["espaços em volta não entram no nome", fullModelName("  CG 160 ", " Fan "), "CG 160 Fan"],
  ["versão já embutida no modelo não é repetida", fullModelName("CG 160 Fan", "Fan"), "CG 160 Fan"],
  ["modelo e versão vazios dão texto vazio", fullModelName("", ""), ""],

  // Abrir uma moto cadastrada antes disto: o texto gravado volta separado
  ["separa modelo e versão de um nome gravado", json(splitModelName("Honda", "CG 160 Fan")), json({ model: "CG 160", version: "Fan" })],
  ["nome sem versão volta só como modelo", json(splitModelName("Honda", "CG 160")), json({ model: "CG 160", version: "" })],
  ["o modelo mais longo ganha: CB 500F não vira CB versão 500F", splitModelName("Honda", "CB 500F").model, "CB"],
  ["versão fora do catálogo volta como digitada", json(splitModelName("Honda", "CG 160 Turbo")), json({ model: "CG 160", version: "Turbo" })],
  ["modelo fora do catálogo volta vazio para virar texto livre", json(splitModelName("Honda", "Moto Importada X")), json({ model: "", version: "" })],
  ["texto vazio volta vazio", json(splitModelName("Honda", "")), json({ model: "", version: "" })],
  ["ida e volta do nome não perde nada", (() => { const p = splitModelName("Yamaha", "Factor 150i ED"); return fullModelName(p.model, p.version); })(), "Factor 150i ED"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO catálogo de motos fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

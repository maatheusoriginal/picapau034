/**
 * A lista de peças em ordem alfabética.
 *
 * O banco devolve na ordem do código interno (PRD-1, PRD-2...), que é a ordem
 * de cadastro — nenhuma ordem, do ponto de vista de quem procura. Quem está no
 * balcão com o cliente na frente procura pelo NOME.
 *
 * Rode com: npm run check:product-order
 */
import { sortProducts } from "../src/inventory";

const nomes = (lista: Array<{ name: string; code?: string }>) => sortProducts(lista).map((p) => p.name).join(" | ");

const casos: Array<[string, unknown, unknown]> = [
  ["a ordem de cadastro vira ordem de nome",
    nomes([{ name: "VELA NGK" }, { name: "AMORTECEDOR" }, { name: "PASTILHA DE FREIO" }]),
    "AMORTECEDOR | PASTILHA DE FREIO | VELA NGK"],

  // Acento não joga a peça para o fim da lista: "Óleo" fica junto de "Oleo",
  // que é como metade do cadastro foi digitada.
  ["acento não manda a peça para o fim",
    nomes([{ name: "PNEU" }, { name: "ÓLEO 20W50" }, { name: "OLEO 10W30" }]),
    "OLEO 10W30 | ÓLEO 20W50 | PNEU"],

  // Maiúscula e minúscula convivem no cadastro antigo.
  ["maiúscula e minúscula ficam juntas",
    nomes([{ name: "kit relação" }, { name: "KIT EMBREAGEM" }]),
    "KIT EMBREAGEM | kit relação"],

  /*
    Número dentro do nome ordena como número.

    Sem isso "CG 160" viria antes de "CG 50", porque "1" vem antes de "5" letra
    a letra — e a prateleira inteira de uma marca fica fora de ordem.
  */
  ["número no nome ordena como número",
    nomes([{ name: "FILTRO 100" }, { name: "FILTRO 20" }, { name: "FILTRO 3" }]),
    "FILTRO 3 | FILTRO 20 | FILTRO 100"],

  // Duas peças de mesmo nome não podem trocar de lugar a cada atualização da
  // tela: o desempate pelo código deixa a lista parada.
  ["mesmo nome desempata pelo código, sempre igual",
    sortProducts([{ name: "OLEO", code: "PRD-9" }, { name: "OLEO", code: "PRD-2" }]).map((p) => p.code).join(" | "),
    "PRD-2 | PRD-9"],

  ["peça sem nome não derruba a ordenação", nomes([{ name: "ZINCO" }, { name: "" }]), " | ZINCO"],
  ["lista vazia continua vazia", sortProducts([]).length, 0],

  // Ordenar não pode MEXER na lista que veio: o React compara referência para
  // decidir o que redesenhar, e alterar no lugar esconde atualização de saldo.
  ["a lista original não é alterada", (() => {
    const original = [{ name: "VELA" }, { name: "ARO" }];
    sortProducts(original);
    return original.map((p) => p.name).join(" | ");
  })(), "VELA | ARO"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nA lista de peças sai em ordem de nome." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

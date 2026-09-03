/**
 * Confere as contas de preço que aparecem no cadastro de produto.
 *
 * Rode com: npm run check:pricing
 */
import { addToList, quickAddProblem } from "../src/quick-list";
import { breakEvenPrice, marginOnPrice, maxDiscountPercent, priceWarning, unitProfit } from "../src/pricing";

const lista = ["MOTUL", "Yamalube"];
const criado = addToList(lista, " cobreq ");
const repetido = addToList(lista, "motul");
const vazio = addToList(lista, "   ");

const casos: Array<[string, unknown, unknown]> = [
  // --- criar categoria/marca na hora ---
  ["cria em maiúsculo e sem espaço sobrando", criado.value, "COBREQ"],
  ["entra no fim da lista", criado.list.join(","), "MOTUL,Yamalube,COBREQ"],
  ["a lista original não é mexida", lista.join(","), "MOTUL,Yamalube"],
  // Sem isto a lista encheria de "MOTUL", "Motul" e "motul " — o problema que
  // a própria lista veio resolver.
  ["nome repetido não vira item novo", repetido.status, "existia"],
  ["e seleciona o que já existe, com a grafia dele", repetido.value, "MOTUL"],
  ["espaço no meio vira um só", addToList([], "kit   relacao").value, "KIT RELACAO"],
  ["nome vazio não cria nada", vazio.status, "vazio"],
  ["e não mexe na lista", vazio.list.length, 2],

  ["avisa quando está vazio", quickAddProblem(lista, " "), "Digite o nome antes de criar."],
  ["avisa quando é uma letra só", quickAddProblem(lista, "M"), "O nome precisa de pelo menos 2 letras."],
  ["avisa quando já existe", quickAddProblem(lista, "motul"), '"MOTUL" já está na lista.'],
  ["nome bom não tem problema", quickAddProblem(lista, "Cobreq"), ""],

  // --- as contas de preço ---
  ["lucro por unidade", unitProfit(25, 40), 15],
  ["lucro negativo aparece negativo", unitProfit(40, 25), -15],
  // "+60%" no campo é sobre o CUSTO. Sobre a venda isso é 37,5% — e é essa a
  // porcentagem que se compara com a do cartão e a do concorrente.
  ["margem sobre a venda não é a margem sobre o custo", marginOnPrice(25, 40), 37.5],
  ["margem sobre a venda de um preço dobrado", marginOnPrice(25, 50), 50],
  ["preço zerado não divide por zero", marginOnPrice(25, 0), 0],
  ["custo zero é margem cheia", marginOnPrice(0, 40), 100],

  ["desconto máximo é o lucro inteiro", maxDiscountPercent(25, 40), 37.5],
  ["vendendo no custo não cabe desconto", maxDiscountPercent(40, 40), 0],
  ["preço abaixo do custo não cabe desconto", maxDiscountPercent(50, 40), 0],
  ["sem custo cadastrado, desconto não é limitado aqui", maxDiscountPercent(0, 40), 100],
  ["o ponto de empate é o custo", breakEvenPrice(25), 25],

  // O valor é montado com toLocaleString, que separa "R$" do número com um
  // espaço NÃO-SEPARÁVEL. Escrever um espaço comum aqui reprovaria um texto
  // que está certo na tela.
  ["avisa preço abaixo do custo", priceWarning(30, 20), `Preço abaixo do custo: cada venda perde ${(10).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`],
  ["avisa preço igual ao custo", priceWarning(30, 30), "Preço igual ao custo: a venda não deixa lucro nenhum."],
  ["avisa margem apertada", priceWarning(95, 100), "Margem abaixo de 10% sobre a venda: confira se compensa."],
  ["preço saudável não avisa nada", priceWarning(25, 40), ""],
  ["sem preço, cobra o preço", priceWarning(25, 0), "Informe o preço de venda."],
  ["sem custo cadastrado não inventa aviso", priceWarning(0, 40), ""],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nAs contas de preço e a criação rápida fecham." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

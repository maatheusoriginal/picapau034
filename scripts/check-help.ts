/**
 * Confere a central de ajuda.
 *
 * O botão "Precisa de ajuda?" abria um aviso e mais nada. Ajuda que não
 * responde nada é pior do que não ter: a pessoa clica, não acha, e não clica de
 * novo. Esta conferência cobra que todo assunto esteja completo e aponte para
 * uma aba que existe de verdade.
 *
 * Rode com: npm run check:help
 */
import { helpTopic, helpTopics, searchHelp } from "../src/help-topics";

// As abas do sistema. Um assunto que aponta para uma aba inexistente manda a
// pessoa para lugar nenhum — que é exatamente o que a ajuda deveria evitar.
const ABAS = [
  "Visão geral", "Ordens de serviço", "Orçamentos", "PDV Balcão", "Serviço rápido",
  "Vendas do balcão", "Produtos e estoque", "Compras e entradas", "Fornecedores",
  "Clientes", "Motocicletas", "Funcionários", "Financeiro", "Contas a receber",
  "Contas a pagar", "Relatórios", "Usuários e acessos", "Configurações", "Administração",
];

const semTitulo = helpTopics.filter((topic) => !topic.title.trim());
const semResumo = helpTopics.filter((topic) => !topic.summary.trim());
const semPassos = helpTopics.filter((topic) => topic.steps.length < 3);
const destinoInvalido = helpTopics.filter((topic) => !ABAS.includes(topic.destination));
const passoIncompleto = helpTopics.flatMap((topic) => topic.steps.filter((step) => !step.title.trim() || step.detail.trim().length < 20));
const idsRepetidos = helpTopics.map((topic) => topic.id).filter((id, indice, todos) => todos.indexOf(id) !== indice);

const casos: Array<[string, unknown, unknown]> = [
  ["a ajuda tem assunto", helpTopics.length >= 5, true],
  ["todo assunto tem título", semTitulo.length, 0],
  ["todo assunto tem resumo", semResumo.length, 0],
  ["todo assunto tem pelo menos 3 passos", semPassos.map((t) => t.id).join(","), ""],
  ["todo passo tem título e explicação de verdade", passoIncompleto.length, 0],
  ["todo assunto aponta para uma aba que existe", destinoInvalido.map((t) => t.destination).join(","), ""],
  ["nenhum id repetido", idsRepetidos.join(","), ""],

  ["acha o assunto pelo id", helpTopic("os")?.title, "Abrir e fechar uma OS"],
  ["id inexistente não quebra", helpTopic("nao-existe"), null],

  ["busca curta mostra tudo", searchHelp("a").length, helpTopics.length],
  ["busca vazia mostra tudo", searchHelp("").length, helpTopics.length],
  ["acha pelo texto do passo", searchHelp("sangria").map((t) => t.id).join(","), "caixa"],
  ["acha sem depender de maiúscula", searchHelp("PLACA").length > 0, true],
  ["busca sem resultado devolve lista vazia", searchHelp("carburador de trator").length, 0],
  // Os assuntos que o dono citou: OS, preço e o resto do dia a dia.
  ["tem assunto de preço", Boolean(helpTopic("preco")), true],
  ["tem assunto de estoque", Boolean(helpTopic("estoque")), true],
  ["tem assunto de caixa", Boolean(helpTopic("caixa")), true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nA central de ajuda fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

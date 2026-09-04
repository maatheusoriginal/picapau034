/**
 * Confere o mapa das Configurações.
 *
 * A tela tinha oito abas em pílulas: para achar onde se muda a margem padrão
 * era preciso abrir uma por uma, e quem não sabia o nome da aba não achava
 * nunca. Esta conferência cobra que toda seção esteja descrita, que nenhuma
 * fique sem busca, e que as palavras que a oficina usa levem à seção certa.
 *
 * Rode com: npm run check:settings-map
 */
import { readFileSync } from "node:fs";
import { searchSettings, settingsSection, settingsSections, type SettingsSectionId } from "../src/settings-map";

const semTitulo = settingsSections.filter((secao) => !secao.title.trim());
const semResumo = settingsSections.filter((secao) => secao.summary.trim().length < 20);
const semPalavras = settingsSections.filter((secao) => secao.keywords.length < 4);
const idsRepetidos = settingsSections.map((s) => s.id).filter((id, i, todos) => todos.indexOf(id) !== i);

// As abas que a tela realmente tem. Uma seção a mais ou a menos aqui é uma
// seção que some do menu ou um item de menu que não abre nada.
const tela = readFileSync("src/components/SettingsWorkspace.tsx", "utf8");
const abasDaTela = Array.from(new Set(Array.from(tela.matchAll(/activeTab === "([a-z]+)"/g)).map((m) => m[1]))).sort();
const abasDoMapa = settingsSections.map((s) => s.id).sort();

// Palavra que a oficina usa -> seção que resolve. É o que faz a busca valer:
// ninguém adivinha que a margem mora em "Estoque e reposição".
const buscasReais: Array<[string, SettingsSectionId]> = [
  ["margem", "stock"],
  // Palavra por palavra: quem digita "taxa cartão" quer a taxa DO cartão, e
  // exigir a frase inteira na mesma ordem faria a busca falhar justamente com
  // quem sabe o que quer.
  ["taxa cartao", "payments"],
  // "de", "do" e "da" são o jeito de falar, não o que se procura: exigir que
  // apareçam reprovaria "taxa do cartão" por causa do "do".
  ["taxa do cartão", "payments"],
  ["como calcula o preço", "stock"],
  ["preco venda", "stock"],
  ["markup", "stock"],
  ["maquininha", "payments"],
  ["taxa do cartão", "payments"],
  ["impressora", "print"],
  ["cupom", "print"],
  ["frota", "partners"],
  ["faturado", "partners"],
  ["troca de óleo", "services"],
  ["cnpj", "general"],
  ["marca de moto", "lists"],
];

const casos: Array<[string, unknown, unknown]> = [
  ["toda seção tem título", semTitulo.length, 0],
  ["toda seção explica o que resolve", semResumo.map((s) => s.id).join(","), ""],
  ["toda seção tem as palavras da oficina", semPalavras.map((s) => s.id).join(","), ""],
  ["nenhum id repetido", idsRepetidos.join(","), ""],
  // Seção no mapa que a tela não tem vira item de menu que não abre nada; aba
  // na tela que não está no mapa vira seção que a busca nunca acha.
  ["o mapa e a tela têm as mesmas seções", abasDoMapa.join(","), abasDaTela.join(",")],

  ["acha a seção pelo id", settingsSection("stock")?.title, "Estoque e reposição"],
  ["id inexistente não quebra", settingsSection("nao-existe"), null],
  ["busca curta mostra tudo", searchSettings("a").length, settingsSections.length],
  ["busca vazia mostra tudo", searchSettings("").length, settingsSections.length],
  // Ninguém digita "combustível" com acento no meio do atendimento.
  ["a busca ignora acento", searchSettings("combustivel").map((s) => s.id).join(","), "lists"],
  ["e acha com acento também", searchSettings("combustível").map((s) => s.id).join(","), "lists"],
  ["busca sem resultado devolve lista vazia", searchSettings("carburador de trator").length, 0],
];

for (const [palavra, esperada] of buscasReais) {
  const achadas = searchSettings(palavra).map((s) => s.id);
  casos.push([`"${palavra}" leva para ${esperada}`, achadas.includes(esperada), true]);
}

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO mapa das Configurações fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

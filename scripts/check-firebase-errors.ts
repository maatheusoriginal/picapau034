/**
 * Confere as mensagens de erro do Firebase.
 *
 * O que está sendo testado é que a tripa NÃO vaza: o erro de permissão do
 * Firestore carrega o uid e o e-mail de quem está logado, e isso ia para uma
 * tarja de formulário — que acaba num print no grupo do WhatsApp.
 *
 * E que os dois motivos de recusa sejam distinguidos: permissão que ninguém
 * deu (quem resolve é o administrador) e regra do Firestore desatualizada
 * (quem resolve é quem publica). Sem separar, o dono passa a tarde mexendo nas
 * permissões de alguém que já tinha todas.
 *
 * Rode com: npm run check:firebase-errors
 */
import { codigoDoErro, ehRecusaDePermissao, mensagemDoErro } from "../src/firebase-errors";

// O erro real, como o SDK entrega — com o uid e o e-mail dentro.
const recusaReal = Object.assign(
  new Error('{"error":"Missing or insufficient permissions.","authInfo":{"userId":'
    + '"fknR9hs3uXgKBR3LVQ7c7WGk3Qe2","email":"rayane@picapau.com","emailVerified":false},'
    + '"operationType":"write","path":"categories/CAT1788368551603"}'),
  { code: "permission-denied" },
);
// A mesma recusa sem o campo `code`: alguns caminhos entregam só a mensagem.
const recusaSemCodigo = new Error("Missing or insufficient permissions.");
// A mesma recusa vinda do backend, com a linha da regra junto — outro texto,
// mesmo problema para quem está olhando a tela.
const recusaDoBackend = new Error("Firestore Error: PERMISSION_DENIED: evaluation error at L210:32 for 'create' @ L210");
const semRede = Object.assign(new Error("blah"), { code: "unavailable" });
const desconhecido = Object.assign(new Error('{"tripa":"interna"}'), { code: "firestore/coisa-nova" });
const nosso = new Error("Informe um valor maior que zero.");

const semPermissao = mensagemDoErro(recusaReal, { acao: "criar a categoria", temPermissao: false });
const regraVelha = mensagemDoErro(recusaReal, { acao: "criar a categoria", temPermissao: true });
const semSaber = mensagemDoErro(recusaReal, { acao: "criar a categoria" });
const todas = [semPermissao, regraVelha, semSaber,
  mensagemDoErro(desconhecido), mensagemDoErro(semRede), mensagemDoErro(recusaSemCodigo)];

const casos: Array<[string, unknown, unknown]> = [
  // --- Nada de tripa na tela ---
  ["o uid não aparece em mensagem nenhuma", todas.some((m) => m.includes("fknR9hs3uXgKBR3LVQ7c7WGk3Qe2")), false],
  ["o e-mail também não", todas.some((m) => m.includes("rayane@picapau.com")), false],
  ["nem o JSON cru", todas.some((m) => m.includes("{") || m.includes("authInfo")), false],
  ["nem o caminho do documento", todas.some((m) => m.includes("categories/CAT")), false],
  ["e erro desconhecido não despeja a mensagem",
    mensagemDoErro(desconhecido).includes("tripa"), false],
  ["mas diz o código, para dar para procurar",
    mensagemDoErro(desconhecido).includes("firestore/coisa-nova"), true],

  // --- Os dois motivos de recusa ---
  // Um manda falar com o administrador; o outro, publicar as regras. Trocar os
  // dois faz o dono mexer nas permissões de quem já tinha todas.
  ["sem a permissão, aponta para Usuários e acessos", semPermissao.includes("Usuários e acessos"), true],
  ["e cita o que estava sendo feito", semPermissao.includes("criar a categoria"), true],
  ["e não fala em publicar regra", semPermissao.includes("deploy"), false],
  ["com a permissão, aponta para as regras publicadas", regraVelha.includes("firebase deploy --only firestore:rules"), true],
  ["e diz que a permissão está marcada", regraVelha.includes("marcada no seu perfil"), true],
  ["sem saber, cita as duas frentes",
    semSaber.includes("Usuários e acessos") && semSaber.includes("Firebase"), true],

  // --- Reconhecer a recusa ---
  ["reconhece pelo código", ehRecusaDePermissao(recusaReal), true],
  ["reconhece pela mensagem, quando não vem código", ehRecusaDePermissao(recusaSemCodigo), true],
  ["reconhece a recusa que vem do backend, com outro texto", ehRecusaDePermissao(recusaDoBackend), true],
  ["e a linha da regra não vaza para a tela",
    mensagemDoErro(recusaDoBackend, { acao: "criar a marca", temPermissao: true }).includes("L210"), false],
  ["não confunde falta de rede com falta de permissão", ehRecusaDePermissao(semRede), false],
  ["lê o código quando existe", codigoDoErro(semRede), "unavailable"],
  ["e devolve vazio quando não existe", codigoDoErro(new Error("x")), ""],

  // --- Os outros códigos ---
  ["sem rede fala de internet", mensagemDoErro(semRede).includes("internet"), true],
  ["sessão expirada manda entrar de novo",
    mensagemDoErro(Object.assign(new Error("x"), { code: "unauthenticated" })).includes("Entre novamente"), true],
  ["registro apagado no meio do caminho",
    mensagemDoErro(Object.assign(new Error("x"), { code: "not-found" }), { acao: "salvar a peça" }),
    "Não foi possível salvar a peça: o registro não existe mais."],

  // --- Erro escrito por nós ---
  // Nossas mensagens já são frases em português: repetir "não foi possível"
  // por cima delas esconderia o que a tela quis dizer.
  ["mensagem nossa passa como está", mensagemDoErro(nosso), "Informe um valor maior que zero."],
  ["erro sem nada dentro vira frase genérica",
    mensagemDoErro({}, { acao: "criar a marca" }), "Não foi possível criar a marca. Tente de novo."],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nOs erros do Firebase saem em português e sem tripa." : `\n${falhas} caso(s) errados.`);

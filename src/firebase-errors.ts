/**
 * O que o Firebase diz, escrito em português e sem vazar tripa.
 *
 * O erro de permissão do Firestore chega assim, e isto ia PARA A TELA:
 *
 *   {"error":"Missing or insufficient permissions.","authInfo":{"userId":
 *   "fknR9hs3uXgKBR3LVQ7c7WGk3Qe2","email":"rayane@picapau.com", ...
 *
 * Duas coisas erradas de uma vez. A pessoa não entende o que aconteceu nem o
 * que fazer, e o sistema publica o uid e o e-mail de quem está logado numa
 * tarja de formulário — que é o tipo de coisa que acaba num print no grupo do
 * WhatsApp.
 *
 * A parte útil é distinguir os DOIS motivos de uma recusa, que pedem coisas
 * opostas de quem lê:
 *
 * - A pessoa não tem a permissão → quem resolve é o administrador, na tela de
 *   Usuários e acessos.
 * - A pessoa TEM a permissão marcada e o banco recusou assim mesmo → quem
 *   resolve é quem publica as regras do Firestore. Regra editada no código não
 *   vale nada até ser publicada no Firebase, e enquanto isso o sistema deixa
 *   clicar no que o banco vai negar.
 *
 * Sem essa distinção, as duas situações aparecem como "sem permissão" e o dono
 * passa a tarde mexendo nas permissões de alguém que já tinha todas.
 */

/** O código do erro, quando ele tem um. */
export function codigoDoErro(erro: unknown): string {
  if (typeof erro === "object" && erro && "code" in erro) {
    return String((erro as { code?: unknown }).code ?? "");
  }
  return "";
}

/** É recusa de permissão do Firestore? */
export function ehRecusaDePermissao(erro: unknown): boolean {
  if (codigoDoErro(erro).includes("permission-denied")) return true;
  // Nem todo caminho carrega o código, e o texto vem de dois jeitos: a recusa
  // do SDK ("Missing or insufficient permissions") e a do backend
  // ("PERMISSION_DENIED: evaluation error at L210..."). As duas são a mesma
  // coisa para quem está olhando a tela.
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");
  return /missing or insufficient permissions/i.test(texto) || /permission[_ ]denied/i.test(texto);
}

export type ContextoDoErro = {
  /** O que estava sendo feito, para a frase citar: "criar a categoria". */
  acao?: string;
  /**
   * O perfil de quem está logado tem a permissão que a ação exige?
   *
   * `true` com recusa do banco é o sintoma de regra desatualizada; `false` é
   * permissão que ninguém deu. `undefined` quando a tela não sabe dizer.
   */
  temPermissao?: boolean;
};

/**
 * A mensagem que vai para a tela.
 *
 * Nunca devolve a mensagem crua de um erro do Firebase: quando o código não é
 * conhecido, sai uma frase genérica com o código entre parênteses, que serve
 * para procurar sem expor o conteúdo do erro.
 */
export function mensagemDoErro(erro: unknown, contexto: ContextoDoErro = {}): string {
  const acao = contexto.acao?.trim();
  const oQue = acao ? ` ${acao}` : "";

  if (ehRecusaDePermissao(erro)) {
    if (contexto.temPermissao === false) {
      return `Seu perfil não tem permissão para${oQue || " isso"}. Peça a um administrador em Usuários e acessos.`;
    }
    if (contexto.temPermissao === true) {
      return `O banco recusou${oQue || " a operação"}, mesmo com a permissão marcada no seu perfil. `
        + "Isso costuma ser regra do Firestore desatualizada: publique de novo com "
        + '"firebase deploy --only firestore:rules".';
    }
    return `Sem permissão para${oQue || " isso"}. Confira o seu perfil em Usuários e acessos e as regras publicadas no Firebase.`;
  }

  const codigo = codigoDoErro(erro);
  if (codigo.includes("unauthenticated")) return "Sua sessão expirou. Entre novamente para continuar.";
  if (codigo.includes("network-request-failed") || codigo.includes("unavailable")) {
    return "Sem conexão com o Firebase. Confira a internet e tente de novo.";
  }
  if (codigo.includes("not-found")) return `Não foi possível${oQue || " concluir"}: o registro não existe mais.`;
  if (codigo.includes("already-exists")) return `Não foi possível${oQue || " concluir"}: já existe um registro com esse código.`;
  if (codigo.includes("deadline-exceeded")) return "O Firebase demorou demais para responder. Tente de novo.";
  if (codigo.includes("resource-exhausted")) return "O limite do Firebase foi atingido. Tente mais tarde.";

  // Erro nosso, escrito para ser lido: pode ir para a tela como está. O do
  // Firebase, não — sai o código, que serve para procurar, sem o conteúdo.
  if (codigo) return `Não foi possível${oQue || " concluir a operação"} (${codigo}).`;
  if (erro instanceof Error && erro.message && !/[{}]/.test(erro.message)) return erro.message;
  return `Não foi possível${oQue || " concluir a operação"}. Tente de novo.`;
}

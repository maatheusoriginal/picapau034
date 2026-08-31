/**
 * O mínimo de HTTP que os handlers administrativos precisam.
 *
 * Eles eram tipados com `Request`/`Response` do Express, o que os prendia ao
 * servidor Express — e na Vercel não existe servidor Express: cada rota vira
 * uma função isolada, que recebe objetos parecidos, mas não iguais. Era por
 * isso que /api/admin/users respondia 404 no ar e criar usuário não funcionava.
 *
 * Descrevendo só o que os handlers usam de fato (cabeçalhos, corpo, status e
 * json), o mesmo código serve aos dois: o Express passa objetos que atendem a
 * esta forma, e a Vercel também. Sem adaptador, sem cast, sem duplicar handler.
 */

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): unknown;
};

/**
 * Lê um cabeçalho pelo nome.
 *
 * Existe porque `request.header("...")` é método do Express e não da Vercel.
 * Um cabeçalho repetido chega como lista; aqui vale o primeiro, que é o que
 * qualquer cliente normal manda.
 */
export function header(request: ApiRequest, name: string): string {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

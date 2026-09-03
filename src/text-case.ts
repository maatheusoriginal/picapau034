/**
 * Cadastro em maiúsculo.
 *
 * A oficina cadastra o mesmo produto três vezes escrito de três jeitos —
 * "Óleo 20W50", "oleo 20w50", "ÓLEO 20W50" — e aí a busca do balcão não acha,
 * o relatório conta como três produtos e o estoque nunca fecha. Padronizar em
 * maiúsculo na hora da digitação resolve na origem: o que entra já entra igual.
 *
 * Vale para o que é NOME de cadastro. Fica de fora o que maiúsculo estragaria:
 * e-mail (usado para entrar no sistema), senha e endereço de internet.
 */

/**
 * Passa o texto para maiúsculo respeitando o português.
 *
 * `toLocaleUpperCase("pt-BR")` é o que mantém "ção" virando "ÇÃO" com o cedilha
 * e o til nos lugares certos em qualquer navegador.
 */
export function emMaiusculo(valor: string): string {
  return (valor ?? "").toLocaleUpperCase("pt-BR");
}

/** Campos que NÃO podem ir para maiúsculo, e por quê. */
export const CAMPOS_SEM_MAIUSCULO = ["e-mail", "senha", "site"] as const;

/**
 * O texto já está no formato de cadastro?
 *
 * Serve para conferir dado que veio de fora (planilha importada, backup antigo)
 * sem depender da tela.
 */
export function estaEmMaiusculo(valor: string): boolean {
  return emMaiusculo(valor) === (valor ?? "");
}

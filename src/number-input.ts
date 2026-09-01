/**
 * Regras do campo de número.
 *
 * O defeito: `onChange={(e) => setValor(parseFloat(e.target.value) || 0)}`.
 * Apagar o conteúdo faz `parseFloat("")` virar NaN, o `|| 0` devolve zero na
 * mesma tecla, e o campo volta a mostrar "0" antes de a pessoa terminar de
 * digitar. O que ela digita em seguida entra depois do zero — "020" —, e a
 * única saída é selecionar tudo e substituir.
 *
 * A correção é separar o que está escrito do valor que vale: enquanto se
 * digita, o campo pode ficar vazio ou com um número pela metade ("1,", "-").
 * Só ao sair do campo o texto é normalizado.
 */

/** O que o campo aceita ter escrito enquanto a pessoa digita. */
export function isPartialNumber(text: string): boolean {
  if (text === "") return true;
  // Um sinal sozinho, ou um número terminado em separador decimal, são
  // estados normais no meio da digitação.
  return /^-?\d*([.,]\d*)?$/.test(text);
}

/** Lê o número escrito. Devolve null quando ainda não há número nenhum. */
export function parseTyped(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (clean === "" || clean === "-" || clean === "." || clean === "-.") return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/**
 * Como o número aparece escrito no campo.
 *
 * Sem isto o campo mostraria "020" depois de a pessoa digitar 20 sobre o zero
 * que estava lá — que é exatamente a reclamação.
 */
export function formatTyped(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(value);
}

/**
 * O que fica no campo quando a pessoa sai dele.
 *
 * Campo vazio vira o padrão da tela (o mesmo número que o `|| N` antigo
 * usava), e não um zero silencioso onde a tela esperava outra coisa.
 */
export function settleOnBlur(text: string, fallback: number): number {
  const typed = parseTyped(text);
  return typed === null ? fallback : typed;
}

/** Mantém o valor dentro do mínimo e do máximo declarados no campo. */
export function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

/**
 * O texto que o campo mostra para um valor.
 *
 * `blankValue` deixa o campo vazio para um número específico — normalmente o
 * zero, para o placeholder ("0,00") continuar aparecendo. Alguns formulários
 * já faziam isto à mão com `value={custo === 0 ? "" : custo}`, o que resolvia
 * só a aparência: o estado continuava sendo número, e apagar devolvia zero na
 * mesma tecla.
 */
export function displayValue(value: number, blankValue?: number): string {
  return value === blankValue ? "" : formatTyped(value);
}

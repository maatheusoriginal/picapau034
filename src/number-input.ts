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

/**
 * O valor colado, quando vem já formatado.
 *
 * `isPartialNumber` recusa "2.500,00" — e com razão, porque no meio da
 * digitação dois separadores não existem. Só que ele também recusa o que a
 * pessoa COLA: quem copia "R$ 2.500,00" do WhatsApp do fornecedor e cola no
 * campo de valor vê o campo continuar vazio, sem nenhum aviso, e o
 * lançamento sair errado ou nem sair.
 *
 * Devolve o texto normalizado, ou "" quando não parece um valor formatado —
 * e aí o campo continua recusando, como antes.
 */
export function normalizarColado(text: string): string {
  const limpo = text.replace(/[R$\s\u00a0]/g, "");
  if (!limpo) return "";
  // Brasileiro: ponto separando milhar, vírgula nos centavos.
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpo)) return limpo.replace(/\./g, "");
  // Americano, que aparece em planilha exportada: vírgula no milhar.
  if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(limpo)) return limpo.replace(/,/g, "");
  return "";
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
 *
 * Com `casas`, o número sai no formato do balcão: vírgula decimal e as casas
 * sempre preenchidas ("2,68", "0,00", "51,27"). Dinheiro e porcentagem escritos
 * sem as casas obrigam quem confere a adivinhar se "5" é cinco reais ou cinco
 * centavos, e uma coluna de valores com quantidade de dígitos variável não dá
 * para somar de cabeça.
 */
export function formatTyped(value: number | null | undefined, casas?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (casas === undefined) return String(value);
  return arredondar(value, casas).toFixed(casas).replace(".", ",");
}

/**
 * Arredonda de verdade, para o centavo não sumir.
 *
 * `(2.675).toFixed(2)` devolve "2,67". Não é bug do JavaScript: o double mais
 * próximo de 2,675 é um pouquinho MENOR que 2,675, então arredondar para baixo
 * está certo do ponto de vista da máquina — e errado do ponto de vista de quem
 * põe o preço na peça. Um centavo por peça, em toda entrada de nota, vira
 * diferença no fechamento que ninguém consegue explicar.
 *
 * A saída é deslocar a vírgula pelo TEXTO ("2.675" → "2.675e2" → 267.5), onde
 * o meio-termo existe de verdade e o arredondamento acontece como no papel.
 * Número em notação científica (muito grande ou muito pequeno) não passa por
 * esse caminho: aí o toFixed direto já é o melhor que dá.
 */
export function arredondar(value: number, casas: number): number {
  if (!Number.isFinite(value)) return value;
  const absoluto = Math.abs(value);
  const texto = String(absoluto);
  if (texto.includes("e") || texto.includes("E")) return Number(value.toFixed(casas));
  const deslocado = Number(`${texto}e${casas}`);
  if (!Number.isFinite(deslocado)) return Number(value.toFixed(casas));
  const inteiro = Math.round(deslocado);
  const devolta = Number(`${inteiro}e-${casas}`);
  return value < 0 ? -devolta : devolta;
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
export function displayValue(value: number, blankValue?: number, casas?: number): string {
  return value === blankValue ? "" : formatTyped(value, casas);
}

/**
 * Lê um campo de dinheiro que guarda TEXTO, não número.
 *
 * Vários campos do sistema (mão de obra da OS, valor do serviço rápido, gasto,
 * conta a pagar) guardam o que foi digitado como string e liam com
 * `Number(texto)`. Isso funcionava só enquanto o campo mostrava "40": assim que
 * ele passa a mostrar "40,00" — que é como se escreve dinheiro em português —
 * `Number("40,00")` vira NaN e o valor some da conta.
 */
export function valorDigitado(text: string, fallback = 0): number {
  const typed = parseTyped(text ?? "");
  return typed === null ? fallback : typed;
}

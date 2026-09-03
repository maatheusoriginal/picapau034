/**
 * As contas de preço que o balcão precisa ver antes de vender.
 *
 * A tela mostrava custo, margem e preço de venda. Faltava o que decide se a
 * venda vale a pena:
 *
 * - **Margem sobre a venda.** "+60%" ali é margem sobre o CUSTO: custo 25 vira
 *   preço 40. Sobre a venda isso é 37,5%, não 60% — e é a porcentagem sobre a
 *   venda que se compara com a do concorrente e com o cartão. Ver só o número
 *   maior faz a oficina achar que ganha mais do que ganha.
 * - **Até quanto dá para dar de desconto.** O PDV deixa descontar. Sem saber o
 *   piso, o desconto "de bom moço" vende abaixo do que se pagou ao fornecedor.
 */

/** Lucro em reais por unidade. */
export function unitProfit(cost: number, price: number): number {
  return arredonda((price || 0) - (cost || 0));
}

/**
 * Margem sobre o preço de venda, em porcentagem.
 *
 * Diferente da margem sobre o custo: custo 25 e preço 40 são 60% sobre o custo
 * e 37,5% sobre a venda.
 */
export function marginOnPrice(cost: number, price: number): number {
  if (!(price > 0)) return 0;
  return arredonda(((price - (cost || 0)) / price) * 100);
}

/**
 * O maior desconto que ainda não vende no prejuízo, em porcentagem.
 *
 * É o lucro inteiro: descontar mais do que isso é pagar para trabalhar.
 */
export function maxDiscountPercent(cost: number, price: number): number {
  if (!(price > 0)) return 0;
  if (!(cost > 0)) return 100;
  if (cost >= price) return 0;
  return arredonda(((price - cost) / price) * 100);
}

/** O preço em que a venda empata: nem lucro nem prejuízo. */
export function breakEvenPrice(cost: number): number {
  return arredonda(Math.max(0, cost || 0));
}

/** O aviso a mostrar sobre o preço, ou vazio quando está tudo certo. */
export function priceWarning(cost: number, price: number): string {
  if (!(price > 0)) return "Informe o preço de venda.";
  if (!(cost > 0)) return "";
  if (price < cost) return `Preço abaixo do custo: cada venda perde ${formatoBRL(cost - price)}.`;
  if (price === cost) return "Preço igual ao custo: a venda não deixa lucro nenhum.";
  if (marginOnPrice(cost, price) < 10) return "Margem abaixo de 10% sobre a venda: confira se compensa.";
  return "";
}

const arredonda = (valor: number) => Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;
const formatoBRL = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

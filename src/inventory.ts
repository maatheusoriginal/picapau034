/**
 * Regras de estoque e precificação, em funções puras.
 *
 * Ficam fora do React e do Firebase de propósito: são contas que decidem preço
 * de venda e custo de peça, então precisam ser conferíveis com dados na mão
 * (ver scripts/check-inventory.ts).
 */

/** Preço de venda a partir do custo e do markup. Markup de 45% sobre R$ 100 = R$ 145. */
export function priceFromMarkup(cost: number, markup: number): number {
  if (!(cost > 0)) return 0;
  return round2(cost * (1 + markup / 100));
}

/** Markup que um preço representa sobre o custo. Usado quando o preço é digitado. */
export function markupFromPrice(cost: number, price: number): number {
  if (!(cost > 0)) return 0;
  return Math.round(((price - cost) / cost) * 100);
}

/**
 * Custo médio ponderado após uma entrada de estoque.
 *
 * É a média dos custos pesada pela quantidade de cada lote:
 *
 *     (estoque × custoAtual + quantidade × custoDaEntrada) / (estoque + quantidade)
 *
 * Exemplo: 10 peças a R$ 10 e entram 10 a R$ 20 → o custo passa a ser R$ 15,
 * não R$ 20. Sem isso, o lucro das 10 peças antigas apareceria menor do que foi
 * de verdade, porque elas custaram menos do que o último preço pago.
 *
 * Estoque negativo (venda a descoberto) é tratado como zero: manter o valor
 * negativo no peso inverteria a média e devolveria um custo sem sentido.
 */
export function weightedAverageCost(
  currentStock: number,
  currentCost: number,
  entryQuantity: number,
  entryCost: number,
): number {
  const stock = Math.max(0, currentStock);
  const quantity = Math.max(0, entryQuantity);
  if (quantity <= 0) return round2(currentCost);
  if (stock <= 0) return round2(entryCost);
  return round2((stock * currentCost + quantity * entryCost) / (stock + quantity));
}

/**
 * Custo de uma peça depois de uma entrada, respeitando a configuração da
 * oficina: com custo médio ligado, pondera com o que já havia; desligado, o
 * último preço pago passa a valer.
 */
export function costAfterEntry(
  useAverageCost: boolean,
  currentStock: number,
  currentCost: number,
  entryQuantity: number,
  entryCost: number,
): number {
  if (!(entryQuantity > 0)) return round2(currentCost);
  return useAverageCost
    ? weightedAverageCost(currentStock, currentCost, entryQuantity, entryCost)
    : round2(entryCost);
}

/** Converte "R$ 1.234,56" ou 1234.56 em número. Os produtos gravam o custo dos dois jeitos. */
export function toAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  // "1.234,56" (brasileiro) vira "1234.56"; "1234.56" fica como está.
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

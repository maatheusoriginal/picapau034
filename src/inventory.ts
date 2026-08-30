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

/** Peça reservada por uma OS: quanto dela está fora do estoque por causa dessa ordem. */
export type ReservedPart = { productId: string; quantity: number };

/**
 * O que precisa sair (ou voltar) do estoque para que a OS passe a ter
 * exatamente `target` reservado, sabendo que hoje ela já tem `reserved`.
 *
 * Delta positivo tira do estoque, negativo devolve. Guardar o que já foi
 * baixado é o que impede baixa dobrada quando a OS é salva duas vezes, e é o
 * que devolve a peça à prateleira quando ela sai da ordem ou quando a OS volta
 * para orçamento.
 */
export function stockDeltas(target: ReservedPart[], reserved: ReservedPart[]): ReservedPart[] {
  const totals = new Map<string, number>();
  const add = (parts: ReservedPart[], sign: number) => {
    parts.forEach((part) => {
      if (!part.productId) return;
      totals.set(part.productId, (totals.get(part.productId) ?? 0) + sign * Math.max(0, part.quantity));
    });
  };
  add(target, 1);
  add(reserved, -1);
  return [...totals.entries()]
    .filter(([, quantity]) => quantity !== 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

/** Junta itens repetidos do mesmo produto em uma linha só. */
export function mergeParts(parts: ReservedPart[]): ReservedPart[] {
  return stockDeltas(parts, []);
}

/**
 * A OS já deve ter as peças fora do estoque?
 *
 * Com "baixar somente quando a OS for iniciada" ligado, a peça só sai da
 * prateleira quando o serviço começa — durante recepção, avaliação e aprovação
 * a OS ainda é orçamento, e reservar peça de orçamento some com o estoque de
 * quem está vendendo no balcão. Desligado, a baixa acontece já na abertura.
 */
export function shouldReserveStock(status: string, deductOnlyWhenStarted: boolean, statuses: readonly string[]): boolean {
  if (!deductOnlyWhenStarted) return true;
  const started = statuses.indexOf("Em serviço");
  const current = statuses.indexOf(status);
  return started >= 0 && current >= started;
}

/**
 * Uma movimentação da peça: de onde ela veio ou para onde foi.
 *
 * `quantity` positiva é entrada, negativa é saída — o mesmo sinal que o estoque
 * enxerga.
 */
export type ProductMovement = {
  /** Documento que gerou a movimentação: entrada, venda ou OS. */
  documentId: string;
  kind: "Entrada" | "Venda do balcão" | "Serviço rápido" | "Ordem de serviço";
  date: string;
  /** ISO 8601, usado para ordenar. */
  at: string;
  detail: string;
  quantity: number;
  /** Valor unitário praticado: custo na entrada, preço na saída. */
  unitValue: number;
  total: number;
};

type MovementSources = {
  stockEntries?: Array<{
    id: string; date: string; entryAt?: string; supplierName?: string;
    items?: Array<{ productId: string; quantity: number; unitCost: number; total: number }>;
  }>;
  sales?: Array<{
    id: string; date: string; soldAt?: string; origin: string; customer?: string;
    items: Array<{ productId?: string; quantity?: number; price: number; name: string }>;
  }>;
  orders?: Array<{
    id: string; customer: string; closedAt?: string; time?: string;
    deductedItems?: Array<{ productId: string; quantity: number }>;
    items?: Array<{ productId?: string; quantity?: number; price: number }>;
  }>;
};

/**
 * Histórico de uma peça: compras que a trouxeram e vendas/OS que a consumiram.
 *
 * Só considera saídas que de fato mexeram no estoque — nas OS, o que vale é
 * `deductedItems` (o que foi realmente baixado), não a lista de itens: uma OS
 * ainda em orçamento tem peça listada sem ter tirado nada da prateleira.
 */
export function productMovements(productId: string, sources: MovementSources): ProductMovement[] {
  if (!productId) return [];
  const movements: ProductMovement[] = [];

  (sources.stockEntries ?? []).forEach((entry) => {
    (entry.items ?? [])
      .filter((item) => item.productId === productId)
      .forEach((item) => movements.push({
        documentId: entry.id,
        kind: "Entrada",
        date: entry.date,
        at: entry.entryAt ?? "",
        detail: entry.supplierName || "Compra de peças",
        quantity: item.quantity,
        unitValue: item.unitCost,
        total: item.total,
      }));
  });

  (sources.sales ?? []).forEach((sale) => {
    (sale.items ?? [])
      .filter((item) => item.productId === productId)
      .forEach((item) => {
        const quantity = item.quantity ?? 1;
        movements.push({
          documentId: sale.id,
          kind: sale.origin === "PDV" ? "Venda do balcão" : "Serviço rápido",
          date: sale.date,
          at: sale.soldAt ?? "",
          detail: sale.customer || "Consumidor final",
          quantity: -quantity,
          unitValue: quantity ? item.price / quantity : item.price,
          total: -item.price,
        });
      });
  });

  (sources.orders ?? []).forEach((order) => {
    (order.deductedItems ?? [])
      .filter((item) => item.productId === productId && item.quantity > 0)
      .forEach((item) => {
        // O preço praticado sai da lista de itens da OS, quando ela ainda o tem.
        const line = (order.items ?? []).find((candidate) => candidate.productId === productId);
        const lineQuantity = line?.quantity ?? 1;
        const unitValue = line ? (lineQuantity ? line.price / lineQuantity : line.price) : 0;
        movements.push({
          documentId: order.id,
          kind: "Ordem de serviço",
          date: order.closedAt || order.time || "",
          at: "",
          detail: order.customer,
          quantity: -item.quantity,
          unitValue,
          total: -(unitValue * item.quantity),
        });
      });
  });

  // Mais recentes primeiro. Registros antigos podem não ter o carimbo ISO, e aí
  // a data brasileira decide.
  return movements.sort((a, b) => {
    const byIso = (b.at || "").localeCompare(a.at || "");
    if (byIso !== 0) return byIso;
    return (brToSortable(b.date)).localeCompare(brToSortable(a.date));
  });
}

/** "12/03/2026" vira "20260312", que ordena como texto. */
function brToSortable(value: string): string {
  const [day, month, year] = String(value ?? "").split("/");
  return day && month && year ? `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}` : "";
}

/** Totais de entrada e saída de uma peça, para o resumo do histórico. */
export function movementTotals(movements: ProductMovement[]) {
  const inbound = movements.filter((movement) => movement.quantity > 0);
  const outbound = movements.filter((movement) => movement.quantity < 0);
  return {
    inboundQuantity: inbound.reduce((total, movement) => total + movement.quantity, 0),
    outboundQuantity: -outbound.reduce((total, movement) => total + movement.quantity, 0),
    inboundValue: inbound.reduce((total, movement) => total + movement.total, 0),
    outboundValue: -outbound.reduce((total, movement) => total + movement.total, 0),
  };
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

/**
 * O histórico geral: tudo o que passou pela oficina, em uma lista só.
 *
 * O sistema tinha os registros espalhados — OS encerrada na tela da oficina,
 * venda do balcão numa aba, serviço rápido em outra. A pergunta que a oficina
 * faz no fim do dia, e no fim do mês, é uma só: "o que passou por aqui?". Para
 * respondê-la era preciso abrir três telas e somar de cabeça.
 *
 * Aqui as três fontes viram uma linha do tempo com o mesmo formato, para o
 * dono conferir o movimento, achar um atendimento pelo nome ou pela placa e
 * abrir o que interessa.
 *
 * Só contas — sem tela e sem Firestore —, para poderem ser conferidas por
 * `npm run check:ledger`.
 */
import type { OrderRecord, SaleRecord } from "./types";
import { isoDaDataBrasileira } from "./order-events";

export type LedgerKind = "Ordem de serviço" | "PDV Balcão" | "Serviço rápido";

export type LedgerEntry = {
  /** Número do registro: da OS ou da venda. */
  id: string;
  kind: LedgerKind;
  /** ISO 8601, para ordenar e filtrar por período. Vazio quando não deu. */
  at: string;
  /** Dia e hora prontos para a tela. */
  when: string;
  person: string;
  vehicle: string;
  /** O que foi feito, em uma linha. */
  summary: string;
  total: number;
  method: string;
  operator: string;
  /**
   * OS lançada só para o histórico: não passou pelo caixa desta oficina.
   *
   * Ela APARECE na lista — é atendimento que aconteceu, e o dono quer ver —,
   * mas fica fora da soma, senão o total do período conta de novo um dinheiro
   * que já foi contado onde quer que a oficina contasse antes. É a mesma regra
   * de src/finance.ts.
   */
  backfilled: boolean;
  /** Quando existe, a linha abre a OS. */
  orderId?: string;
  /** Quando existe, a linha reimprime o documento da venda. */
  saleId?: string;
};

export type LedgerPeriod = "Hoje" | "7 dias" | "30 dias" | "Todos";
export const ledgerPeriods: LedgerPeriod[] = ["Hoje", "7 dias", "30 dias", "Todos"];
export const ledgerKinds: LedgerKind[] = ["Ordem de serviço", "PDV Balcão", "Serviço rápido"];

const texto = (valor: unknown) => String(valor ?? "").trim();

const carimbo = (iso: string, fallback: string): string => {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return fallback;
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const resumoDosItens = (items: OrderRecord["items"], alternativa: string): string => {
  const nomes = (items ?? []).map((item) => texto(item.name)).filter(Boolean);
  return nomes.length ? nomes.join(", ") : alternativa;
};

/**
 * A OS encerrada vira linha do histórico.
 *
 * Só a ENCERRADA: a que ainda está na bancada aparece na tela da oficina e
 * pode mudar de valor até a entrega. Somar isso aqui mentiria sobre o
 * movimento do dia.
 */
function daOrdem(order: OrderRecord): LedgerEntry {
  const iso = texto(order.closedAtISO) || isoDaDataBrasileira(texto(order.closedAt)) || isoDaDataBrasileira(texto(order.time));
  return {
    id: order.id,
    kind: "Ordem de serviço",
    at: iso,
    when: carimbo(iso, texto(order.closedAt) || texto(order.time) || "Sem data"),
    person: texto(order.partnerName) || texto(order.customer) || "Cliente não identificado",
    vehicle: [texto(order.bike), texto(order.plate)].filter(Boolean).join(" · "),
    summary: resumoDosItens(order.items, texto(order.solution) || texto(order.problem) || "Sem serviço descrito"),
    total: Number(order.total) || 0,
    method: texto(order.paymentMethod) || "Não informado",
    operator: texto(order.mechanic),
    backfilled: order.backfilled === true,
    orderId: order.id,
  };
}

function daVenda(sale: SaleRecord): LedgerEntry {
  const iso = texto(sale.soldAt) || isoDaDataBrasileira(texto(sale.date));
  return {
    id: sale.id,
    kind: sale.origin === "Serviço rápido" ? "Serviço rápido" : "PDV Balcão",
    at: iso,
    when: carimbo(iso, texto(sale.date) || "Sem data"),
    person: texto(sale.customer) || "Consumidor",
    vehicle: texto(sale.vehicle),
    summary: resumoDosItens(sale.items, "Venda sem itens detalhados"),
    total: Number(sale.total) || 0,
    method: texto(sale.paymentMethod) || "Não informado",
    operator: texto(sale.operatorName) || texto(sale.mechanicName),
    backfilled: false,
    saleId: sale.id,
  };
}

/** Tudo o que passou, do mais recente para o mais antigo. */
export function generalLedger(orders: OrderRecord[], sales: SaleRecord[]): LedgerEntry[] {
  const linhas = [
    ...orders.filter((order) => order.closed === true).map(daOrdem),
    ...sales.map(daVenda),
  ];
  // Sem data válida vai para o fim: é registro incompleto, não registro
  // recente. Ordem estável entre os que não têm data, para a lista não dançar
  // a cada carregamento do Firestore.
  return linhas
    .map((linha, posicao) => ({ linha, posicao, chave: Date.parse(linha.at) }))
    .sort((um, outro) => {
      const umTem = !Number.isNaN(um.chave);
      const outroTem = !Number.isNaN(outro.chave);
      if (umTem && outroTem) return outro.chave - um.chave || um.posicao - outro.posicao;
      if (umTem) return -1;
      if (outroTem) return 1;
      return um.posicao - outro.posicao;
    })
    .map((item) => item.linha);
}

/** O primeiro instante do período, ou vazio para "Todos". */
export function periodStart(period: LedgerPeriod, reference: Date = new Date()): string {
  if (period === "Todos") return "";
  const inicio = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (period === "7 dias") inicio.setDate(inicio.getDate() - 6);
  if (period === "30 dias") inicio.setDate(inicio.getDate() - 29);
  return inicio.toISOString();
}

export type LedgerFilter = {
  period?: LedgerPeriod;
  kind?: LedgerKind | "Todos";
  query?: string;
  reference?: Date;
};

/**
 * O recorte que está na tela.
 *
 * A busca varre número, pessoa, moto/placa e o que foi feito — que é como a
 * oficina procura: "aquela Biz prata", "a OS da Maria", "VEN-0031".
 */
export function filterLedger(entries: LedgerEntry[], filtro: LedgerFilter = {}): LedgerEntry[] {
  const desde = periodStart(filtro.period ?? "Todos", filtro.reference);
  const procurado = texto(filtro.query).toLocaleLowerCase("pt-BR");
  return entries.filter((linha) => {
    if (filtro.kind && filtro.kind !== "Todos" && linha.kind !== filtro.kind) return false;
    // Registro sem data válida some de qualquer recorte por período: dizer que
    // ele é "de hoje" seria inventar uma data que ninguém gravou.
    if (desde && !(linha.at && linha.at >= desde)) return false;
    if (!procurado) return true;
    return `${linha.id} ${linha.person} ${linha.vehicle} ${linha.summary} ${linha.method}`
      .toLocaleLowerCase("pt-BR")
      .includes(procurado);
  });
}

export type LedgerTotals = {
  count: number;
  /** Dinheiro do período. OS lançada só para histórico fica de fora. */
  total: number;
  orders: number;
  counter: number;
  quick: number;
  /** Quantas linhas são de OS antiga, lançada só para o histórico. */
  backfilled: number;
};

export function ledgerTotals(entries: LedgerEntry[]): LedgerTotals {
  const contar = (kind: LedgerKind) => entries
    .filter((linha) => linha.kind === kind && !linha.backfilled)
    .reduce((soma, linha) => soma + linha.total, 0);
  return {
    count: entries.length,
    total: entries.filter((linha) => !linha.backfilled).reduce((soma, linha) => soma + linha.total, 0),
    orders: contar("Ordem de serviço"),
    counter: contar("PDV Balcão"),
    quick: contar("Serviço rápido"),
    backfilled: entries.filter((linha) => linha.backfilled).length,
  };
}

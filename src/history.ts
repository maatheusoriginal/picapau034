/**
 * O histórico de atendimento de um cliente.
 *
 * A pergunta que a oficina faz o tempo todo com a moto no portão é sempre a
 * mesma: "o que já foi feito nessa moto, e quando?". Sem isso o mecânico
 * refaz serviço que ainda está na garantia, o balcão não lembra que a relação
 * foi trocada mês passado, e ninguém sabe dizer se o cliente é bom pagador.
 *
 * O histórico sai das ordens de serviço que já existem — não é cadastro novo
 * para alguém manter. Aqui só se lê e se organiza.
 */
import type { ClientRecord, MotorcycleRecord, OrderRecord } from "./types";
import { normalizePlate } from "./plate";

export type HistoryEntry = {
  id: string;
  /** Data que aparece na linha: o encerramento quando houve, senão a abertura. */
  date: string;
  /** Chave de ordenação. String vazia quando a data não deu para entender. */
  sortKey: string;
  plate: string;
  bike: string;
  /** O que foi feito, já pronto para a tela. */
  services: string;
  total: number;
  status: string;
  closed: boolean;
};

export type HistorySummary = {
  entries: HistoryEntry[];
  visits: number;
  totalSpent: number;
  lastVisit: string;
};

/**
 * Converte "28/06/2026" (e "28/06/2026 14:30") na chave ISO que ordena.
 *
 * O sistema grava data em formato brasileiro. Ordenar isso como texto coloca
 * 02/01 depois de 28/06, e o histórico apareceria embaralhado — que é pior do
 * que não ter histórico, porque parece certo.
 */
export function historySortKey(date: string): string {
  const limpa = (date || "").trim();
  const brasileira = limpa.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brasileira) return `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}`;
  const iso = limpa.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

/** O que foi feito na OS, em uma linha. */
export function historyServices(order: OrderRecord): string {
  const itens = (order.items ?? [])
    .map((item) => (item.name || "").trim())
    .filter(Boolean);
  if (itens.length) return itens.join(", ");
  const resumo = (order.service || order.solution || order.problem || "").trim();
  return resumo || "Sem serviço descrito";
}

/**
 * As OS de um cliente, da mais recente para a mais antiga.
 *
 * Junta pelo `clientId` e também pelas placas das motos dele: OS antiga, aberta
 * antes de o cadastro existir, guarda a placa e não o id — e é justamente essa
 * que o balcão quer ver.
 */
export function clientHistory(
  client: Pick<ClientRecord, "id"> | null | undefined,
  orders: OrderRecord[],
  motorcycles: MotorcycleRecord[],
): HistorySummary {
  if (!client) return { entries: [], visits: 0, totalSpent: 0, lastVisit: "" };
  const placasDele = new Set(
    motorcycles.filter((moto) => moto.ownerId === client.id).map((moto) => normalizePlate(moto.plate)).filter(Boolean),
  );
  const dele = orders.filter((order) =>
    (order.clientId && order.clientId === client.id)
    || (Boolean(order.plate) && placasDele.has(normalizePlate(order.plate))));
  return summarize(dele);
}

/** As OS de uma moto, da mais recente para a mais antiga. */
export function motorcycleHistory(
  motorcycle: Pick<MotorcycleRecord, "id" | "plate"> | null | undefined,
  orders: OrderRecord[],
): HistorySummary {
  if (!motorcycle) return { entries: [], visits: 0, totalSpent: 0, lastVisit: "" };
  const placa = normalizePlate(motorcycle.plate);
  const dela = orders.filter((order) =>
    (order.motorcycleId && order.motorcycleId === motorcycle.id)
    || (Boolean(placa) && normalizePlate(order.plate) === placa));
  return summarize(dela);
}

function summarize(orders: OrderRecord[]): HistorySummary {
  const entries: HistoryEntry[] = orders.map((order) => {
    const date = (order.closedAt || order.time || "").trim();
    return {
      id: order.id,
      date: date || "Sem data",
      sortKey: historySortKey(date),
      plate: order.plate || "",
      bike: order.bike || "",
      services: historyServices(order),
      total: Number(order.total) || 0,
      status: order.status || "",
      closed: order.closed === true,
    };
  });
  // Sem data vai para o fim: é registro incompleto, não registro recente.
  entries.sort((um, outro) => {
    if (um.sortKey && outro.sortKey) return outro.sortKey.localeCompare(um.sortKey);
    if (um.sortKey) return -1;
    if (outro.sortKey) return 1;
    return 0;
  });
  // Só OS encerrada conta como dinheiro que entrou: a que ainda está na bancada
  // pode mudar de valor até a entrega, e somar isso mente sobre o cliente.
  const totalSpent = entries.filter((entry) => entry.closed).reduce((soma, entry) => soma + entry.total, 0);
  const ultima = entries.find((entry) => entry.sortKey);
  return { entries, visits: entries.length, totalSpent, lastVisit: ultima?.date ?? "" };
}

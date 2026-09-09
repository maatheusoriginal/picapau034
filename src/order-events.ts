/**
 * O histórico de uma ordem de serviço: o que aconteceu com ela, e quando.
 *
 * A OS mostra o estado de AGORA — a situação atual, os itens atuais, o
 * mecânico atual. Some a pergunta que a oficina faz quando o cliente liga:
 * "desde quando essa moto está aí?", "quando é que ela entrou em serviço?",
 * "quem lançou essa peça?". Sem isso a resposta é a memória de quem estava no
 * balcão, e ela some junto com a pessoa.
 *
 * Cada mudança vira uma linha carimbada. É registro, não cadastro: ninguém
 * digita nada aqui, o sistema anota sozinho ao gravar.
 *
 * Aqui só ficam as contas — sem tela e sem Firestore —, para poderem ser
 * conferidas por `npm run check:order-events`.
 */
import type { OrderEvent, OrderRecord, ServiceOrderItem } from "./types";

export type { OrderEvent };

/**
 * O teto de linhas guardadas na OS.
 *
 * O histórico mora dentro do documento da OS, e documento do Firestore tem
 * limite de tamanho. Uma OS de rotina faz cinco ou seis linhas; duzentas só
 * acontece se alguma tela entrar em laço. O teto existe para que esse dia não
 * derrube a OS inteira — as mais ANTIGAS é que caem, porque a abertura já está
 * guardada em `time` e o que interessa numa OS grande é o que houve por último.
 */
export const MAX_ORDER_EVENTS = 200;

const texto = (valor: unknown) => String(valor ?? "").trim();

/** A hora do dia, como a oficina lê: "14:32". */
export function eventTime(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Dia e hora, para a linha que precisa dos dois: "09/09/2026, 14:32". */
export function eventStamp(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Uma linha nova, carimbada agora (ou no instante informado). */
export function orderEvent(what: string, who?: string, at: string = new Date().toISOString()): OrderEvent {
  const linha: OrderEvent = { at, what: texto(what) };
  const autor = texto(who);
  if (autor) linha.who = autor;
  return linha;
}

/** Junta as linhas novas às que já existem, respeitando o teto. */
export function appendEvents(existing: OrderEvent[] | undefined, novos: OrderEvent[]): OrderEvent[] {
  const todos = [...(existing ?? []), ...novos];
  return todos.length > MAX_ORDER_EVENTS ? todos.slice(todos.length - MAX_ORDER_EVENTS) : todos;
}

const nomesDosItens = (items: ServiceOrderItem[] | undefined) =>
  (items ?? []).map((item) => `${item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ""}${texto(item.name)}`).filter((nome) => nome !== "");

/**
 * O que mudou entre a OS que estava gravada e a que está sendo gravada.
 *
 * Compara só o que a oficina quer ver depois. Campo mexido e desmexido no
 * mesmo salvamento não gera linha, porque a comparação é com o valor final —
 * anotar "mudou para X" quando X é o que já estava seria ruído.
 */
export function changeEvents(
  before: Partial<OrderRecord>,
  after: Partial<OrderRecord>,
  who?: string,
  at: string = new Date().toISOString(),
): OrderEvent[] {
  const linhas: OrderEvent[] = [];
  const anotar = (frase: string) => linhas.push(orderEvent(frase, who, at));

  if (after.status !== undefined && texto(after.status) !== texto(before.status)) {
    anotar(texto(before.status)
      ? `Situação: ${texto(before.status)} → ${texto(after.status)}`
      : `Situação: ${texto(after.status)}`);
  }

  if (after.items !== undefined) {
    const antes = nomesDosItens(before.items);
    const depois = nomesDosItens(after.items);
    // Comparação por CONTAGEM, e não por conjunto: pegar a mesma peça duas
    // vezes soma na linha que já existe (ver src/take-part.ts), então "2x
    // retentor" onde havia "1x retentor" é entrada nova, não repetição.
    const contar = (lista: string[]) => lista.reduce<Record<string, number>>((mapa, nome) => ({ ...mapa, [nome]: (mapa[nome] ?? 0) + 1 }), {});
    const mapaAntes = contar(antes);
    const mapaDepois = contar(depois);
    const incluidos = depois.filter((nome) => { if ((mapaAntes[nome] ?? 0) > 0) { mapaAntes[nome] -= 1; return false; } return true; });
    const retirados = antes.filter((nome) => { if ((mapaDepois[nome] ?? 0) > 0) { mapaDepois[nome] -= 1; return false; } return true; });
    if (incluidos.length) anotar(`Incluído: ${incluidos.join(", ")}`);
    if (retirados.length) anotar(`Retirado: ${retirados.join(", ")}`);
  }

  if (after.mechanic !== undefined && texto(after.mechanic) !== texto(before.mechanic) && texto(after.mechanic)) {
    anotar(`Mecânico: ${texto(after.mechanic)}`);
  }

  if (after.delivery !== undefined && texto(after.delivery) !== texto(before.delivery) && texto(after.delivery)) {
    anotar(`Previsão de entrega: ${texto(after.delivery)}`);
  }

  if (after.solution !== undefined && texto(after.solution) !== texto(before.solution) && texto(after.solution)) {
    anotar("Serviço executado descrito");
  }

  return linhas;
}

/**
 * A linha do tempo pronta para a tela, da mais antiga para a mais nova.
 *
 * OS aberta antes de este histórico existir não tem linha nenhuma gravada, e
 * mostrar um quadro vazio faria parecer que nada aconteceu. Nesses casos a
 * abertura e o encerramento são reconstruídos do que a OS sempre guardou:
 * `time` e `closedAtISO`/`closedAt`.
 */
export function orderTimeline(order: Partial<OrderRecord>): OrderEvent[] {
  const gravados = order.events ?? [];
  const linhas = [...gravados];

  const jaTemAbertura = gravados.some((linha) => linha.what.startsWith("Ordem de serviço aberta"));
  if (!jaTemAbertura && texto(order.time)) {
    linhas.unshift({ at: isoDaDataBrasileira(texto(order.time)), what: `Ordem de serviço aberta · ${texto(order.time)}` });
  }

  const jaTemFecho = gravados.some((linha) => linha.what.startsWith("Encerrada"));
  if (!jaTemFecho && order.closed) {
    const quando = texto(order.closedAtISO) || isoDaDataBrasileira(texto(order.closedAt));
    linhas.push({ at: quando, what: `Encerrada${texto(order.paymentMethod) ? ` · ${texto(order.paymentMethod)}` : ""}` });
  }

  // Ordem estável: linha sem data válida fica onde está, em vez de ser jogada
  // para uma ponta qualquer.
  return linhas
    .map((linha, posicao) => ({ linha, posicao, chave: Date.parse(linha.at) }))
    .sort((um, outro) => {
      if (Number.isNaN(um.chave) || Number.isNaN(outro.chave)) return um.posicao - outro.posicao;
      return um.chave - outro.chave || um.posicao - outro.posicao;
    })
    .map((item) => item.linha);
}

/**
 * "09/09/2026, 14:32" (ou "09/09/2026") no ISO que ordena.
 *
 * Só para reconstruir a linha do tempo de OS antiga. O que é gravado daqui
 * para frente já nasce em ISO.
 */
export function isoDaDataBrasileira(valor: string): string {
  const casa = texto(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/);
  if (!casa) return "";
  const [, dia, mes, ano, hora, minuto] = casa;
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora ?? 0), Number(minuto ?? 0));
  return Number.isNaN(data.getTime()) ? "" : data.toISOString();
}

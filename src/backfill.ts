/**
 * A OS que já aconteceu.
 *
 * A oficina tem uma pilha de OS em papel de motos que já passaram por lá. Elas
 * não valem nada enquanto estiverem na pilha: a pergunta que se faz com a moto
 * no portão — "o que já foi feito nessa aqui?" — continua sem resposta, e o
 * mecânico refaz serviço que ainda está na garantia.
 *
 * Lançar essas OS é diferente de abrir uma OS nova, e a diferença não é
 * cosmética:
 *
 * - A data é a do papel, não a de hoje. Sem isso o histórico mente sobre
 *   quando o serviço foi feito, que é justamente o que se quer saber.
 * - Ela nasce encerrada. Uma OS antiga que entra como "Em avaliação" aparece na
 *   fila da oficina como se a moto estivesse lá agora.
 * - A baixa da peça é ESCOLHIDA, e não automática. Existem os dois casos, e
 *   eles são opostos: se a saída da peça já foi registrada na época, dar baixa
 *   de novo hoje faz o saldo mentir para menos; se a moto saiu da oficina sem
 *   OS nenhuma — que é o caso do "esqueci de abrir" —, a peça sumiu da
 *   prateleira e o sistema nunca soube, então o saldo já está mentindo para
 *   mais e é a baixa que conserta. Quem sabe qual dos dois é quem estava lá.
 * - Ela não entra no caixa nem no relatório financeiro. O dinheiro já foi
 *   contado onde quer que a oficina contasse antes; somar de novo inventaria
 *   faturamento que não existiu. Por isso o registro sai marcado com
 *   `backfilled`, e é essa marca que o financeiro usa para ignorá-la.
 *
 * O valor continua gravado, porque no histórico ele responde a outra pergunta:
 * quanto o cliente já gastou nessa moto.
 */
import type { OrderRecord, ServiceOrderItem } from "./types";
import { mergeParts } from "./inventory";

export type OSAntiga = {
  /** Data do atendimento, como vem do <input type="date">: aaaa-mm-dd. */
  data: string;
  placa: string;
  moto: string;
  cliente: string;
  /** O que foi feito, em texto livre — é o que o histórico mostra na linha. */
  servico: string;
  valor: number;
  /** Empresa parceira que mandou a moto, quando foi o caso. */
  parceiroId?: string;
  parceiroNome?: string;
  /** Número da OS no sistema do parceiro (a folha que veio junto com a moto). */
  osDoParceiro?: string;
  clienteId?: string;
  motoId?: string;
  /** Peças e mão de obra do papel, quando a oficina quiser detalhar. */
  itens?: ServiceOrderItem[];
  /**
   * Tirar estas peças do estoque agora.
   *
   * Vale para a moto que saiu sem OS: a peça deixou a prateleira e o sistema
   * nunca soube. Se a saída já tiver sido registrada na época, isto fica
   * desligado, senão a peça é descontada duas vezes.
   */
  baixarEstoque?: boolean;
};

/**
 * Separa "Honda CB 600F Hornet" em marca e modelo.
 *
 * Quem lança a OS antiga digita a moto de uma vez, como está escrito no papel.
 * Guardar tudo em `model` deixaria a marca de fora do cadastro, e é por ela
 * que a moto é procurada e filtrada depois. A separação só acontece quando a
 * primeira palavra é uma marca que a oficina realmente tem cadastrada — sem
 * isso, "CB 600F" viraria marca "CB".
 */
export function separarMarcaEModelo(texto: string, marcas: string[]): { marca: string; modelo: string } {
  const limpo = String(texto ?? "").trim().replace(/\s+/g, " ");
  if (!limpo) return { marca: "", modelo: "" };
  const primeira = limpo.split(" ")[0];
  const conhecida = marcas.find((marca) => marca.trim().toLocaleLowerCase("pt-BR") === primeira.toLocaleLowerCase("pt-BR"));
  if (!conhecida) return { marca: "", modelo: limpo };
  return { marca: conhecida, modelo: limpo.slice(primeira.length).trim() };
}

/** "2026-09-03" vira "03/09/2026". Devolve "" quando a data não serve. */
export function dataBrasileira(iso: string): string {
  const partes = String(iso ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return "";
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/** Meio-dia da data informada: hora neutra, longe da virada do fuso. */
export function instanteDaOSAntiga(iso: string): string {
  const partes = String(iso ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return "";
  return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]), 12, 0, 0).toISOString();
}

/**
 * O que impede de gravar, em português e tudo de uma vez.
 *
 * Devolver a lista inteira em vez do primeiro problema é de propósito: quem
 * está lançando trinta OS em sequência não quer descobrir um erro por vez.
 */
export function problemasDaOSAntiga(dados: Partial<OSAntiga>, hoje: Date = new Date()): string[] {
  const problemas: string[] = [];
  const data = dataBrasileira(dados.data ?? "");
  if (!data) problemas.push("Informe a data em que o serviço foi feito.");
  else {
    const instante = new Date(instanteDaOSAntiga(dados.data ?? ""));
    const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);
    // OS antiga com data no futuro é erro de digitação, e ela iria para o topo
    // do histórico empurrando para baixo o serviço que foi feito de verdade.
    if (instante > limite) problemas.push("A data do serviço não pode ser no futuro.");
  }
  if (!String(dados.placa ?? "").trim()) problemas.push("Informe a placa da moto: é ela que segura o histórico.");
  if (!String(dados.servico ?? "").trim()) problemas.push("Descreva o que foi feito na moto.");
  const valor = Number(dados.valor ?? 0);
  if (!Number.isFinite(valor) || valor < 0) problemas.push("O valor não pode ser negativo.");
  return problemas;
}

/**
 * O registro pronto para gravar.
 *
 * Nasce encerrada, com a data do papel nos dois campos que o histórico lê
 * (`time` e `closedAt`), sem item nenhum e sem baixa de estoque.
 */
/**
 * As peças do lançamento, juntas por produto, no formato do estoque.
 *
 * Mão de obra fica de fora — ela não tem prateleira. Peça digitada à mão, sem
 * produto do cadastro, também: o estoque não sabe de qual saldo descontar, e
 * inventar um seria pior do que não descontar.
 */
export function pecasDaOSAntiga(dados: OSAntiga): Array<{ productId: string; quantity: number }> {
  if (!dados.baixarEstoque) return [];
  return mergeParts((dados.itens ?? [])
    .filter((item) => item.type !== "Mão de obra" && !!item.productId)
    .map((item) => ({ productId: item.productId!, quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1 })));
}

export function registroDaOSAntiga(dados: OSAntiga): Partial<OrderRecord> {
  const data = dataBrasileira(dados.data);
  const servico = String(dados.servico ?? "").trim();
  const itens = (dados.itens ?? []).map((item) => ({ ...item }));
  return {
    customer: String(dados.cliente ?? "").trim() || "Cliente não identificado",
    bike: String(dados.moto ?? "").trim() || "Motocicleta",
    plate: String(dados.placa ?? "").trim(),
    mechanic: "",
    mechanicIds: [],
    time: data,
    status: "Finalizada",
    tone: "green",
    items: itens,
    // O texto do papel vira `service` E `problem`: o primeiro é o que o
    // histórico mostra na linha, o segundo é o que aparece ao abrir a OS.
    service: servico,
    problem: servico,
    total: Number(dados.valor ?? 0),
    closed: true,
    closedAt: data,
    closedAtISO: instanteDaOSAntiga(dados.data),
    // Sem esta marca a OS entraria no faturamento do período em que foi feita,
    // inventando receita que a oficina já contou de outro jeito.
    backfilled: true,
    // O que sai do estoque por causa deste lançamento. Lista vazia quando a
    // oficina disse que a peça já tinha sido baixada na época.
    deductedItems: dados.baixarEstoque ? pecasDaOSAntiga(dados) : [],
    origin: dados.parceiroNome ? `Encaminhado por ${dados.parceiroNome}` : "Cliente direto",
    ...(dados.clienteId ? { clientId: dados.clienteId } : {}),
    ...(dados.motoId ? { motorcycleId: dados.motoId } : {}),
    ...(dados.parceiroId ? { partnerId: dados.parceiroId } : {}),
    ...(dados.parceiroNome ? { partnerName: dados.parceiroNome } : {}),
    ...(String(dados.osDoParceiro ?? "").trim() ? { partnerOrderId: String(dados.osDoParceiro).trim() } : {}),
  };
}

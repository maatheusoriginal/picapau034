import { paymentsOf } from "./finance";
import { logoForFormat, logoWidthMm } from "./logo";
import type { OrderRecord, SaleRecord, ServiceOrderItem, SettingsConfig } from "./types";

/**
 * Monta os documentos que saem do sistema: a OS impressa, o cupom da venda e a
 * mensagem de WhatsApp.
 *
 * São funções puras que devolvem texto — quem manda para a impressora ou abre o
 * WhatsApp é `app/printing.ts`. Separar assim é o que permite conferir o
 * conteúdo com dados na mão (ver scripts/check-documents.ts), já que num
 * documento impresso um erro de escape ou um placeholder não substituído só
 * aparece no papel, na frente do cliente.
 */

/** Escapa texto para ir dentro do HTML impresso. Nome de cliente com "&" ou "<" quebraria o documento. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Substitui {marcadores} pelo valor correspondente. Marcador sem valor vira
 * texto vazio em vez de aparecer literalmente como "{cliente}" na mensagem
 * enviada ao cliente.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
}

/**
 * Número no formato que o WhatsApp aceita: só dígitos, com o código do Brasil.
 * Devolve "" quando não sobra número suficiente para um telefone válido.
 */
export function whatsappNumber(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

/** Link de conversa do WhatsApp já com a mensagem. Sem telefone, abre o app para escolher o contato. */
export function whatsappUrl(phone: string, message: string): string {
  const number = whatsappNumber(phone);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export type PrintFormat = "Cupom 80mm" | "A4" | string;

/**
 * O corte entre as vias.
 *
 * A guilhotina da impressora térmica corta no fim de cada PÁGINA, então cada
 * via precisa terminar numa quebra de página — inclusive a última, senão a via
 * do cliente sai grudada no papel e alguém rasga na mão. `break-after` é o
 * nome novo da propriedade e `page-break-after` o antigo: os dois vão juntos
 * porque impressora se configura uma vez e fica anos assim, e não dá para
 * saber em que navegador o balcão vai estar.
 *
 * O `.feed` é o espaço em branco no fim de cada via. A lâmina fica alguns
 * milímetros ACIMA da cabeça de impressão, então sem essa sobra o corte passa
 * por cima da última linha — que é justamente a assinatura do cliente.
 */
const CUT = `.via { break-after: page; page-break-after: always; }
       .via .feed { height: 14mm; }`;

/** O cupom térmico é estreito e sem margem; o A4 é uma folha comum. */
function documentStyle(format: PrintFormat): string {
  const thermal = !String(format).toLowerCase().includes("a4");
  const paperWidth = String(format).includes("58") ? 58 : 80;
  // O papel de 58mm cabe menos texto por linha: o nome do cliente e a placa
  // continuam grandes, o resto encolhe um ponto para não quebrar em duas
  // linhas a cada item.
  const base = paperWidth === 58 ? 13 : 14;
  return thermal
    ? `@page { size: ${paperWidth}mm auto; margin: 4mm; }
       body { width: ${paperWidth - 8}mm; margin: 0; font-family: "Courier New", monospace; font-size: ${base}px; line-height: 1.35; color: #000; }
       h1 { font-size: ${base + 5}px; margin: 0 0 2px; }
       .label { font-size: ${base - 2}px; }
       .fact b, .plate { font-size: ${base + 4}px; }
       .total { font-size: ${base + 4}px; }
       .copy { font-size: ${base + 1}px; }
       .note { font-size: ${base - 2}px; }
       ${CUT}`
    : `@page { size: A4; margin: 14mm; }
       body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.4; color: #000; }
       h1 { font-size: 22px; margin: 0 0 4px; }
       .label { font-size: 11px; }
       .fact b, .plate { font-size: 19px; }
       .total { font-size: 19px; }
       .copy { font-size: 15px; }
       .note { font-size: 12px; }
       ${CUT}`;
}

function documentShell(title: string, format: PrintFormat, body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    ${documentStyle(format)}
    .head { text-align: center; margin-bottom: 8px; }
    .head small { display: block; }
    .print-logo { display: block; width: auto; height: auto; max-height: 32mm; object-fit: contain; margin: 0 auto 3mm; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .rule { border-top: 1px dashed #000; margin: 6px 0; }
    /* Os tamanhos de letra ficam TODOS em documentStyle, que vem antes daqui.
       Repetir font-size nesta parte anularia o do formato, porque as duas
       regras têm o mesmo peso e a de baixo ganha. */
    .label { text-transform: uppercase; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    td.qty { width: 34px; }
    td.val { text-align: right; white-space: nowrap; }
    .total { font-weight: bold; }
    .sign { margin-top: 22px; border-top: 1px solid #000; padding-top: 3px; text-align: center; }
    .note { margin-top: 8px; line-height: 1.35; }
    .copy { text-align: center; font-weight: bold; margin-bottom: 4px; }
    /* O que o balcão procura no papel de longe: nome do cliente, moto e placa.
       Ficavam do tamanho do resto e sumiam no meio da lista de itens. */
    .facts { margin: 5px 0; }
    .fact { margin-bottom: 5px; }
    .fact b { display: block; font-weight: bold; line-height: 1.2; }
    .plate { display: inline-block; margin-top: 2px; padding: 1px 7px; border: 2px solid #000; border-radius: 3px; font-weight: bold; letter-spacing: .1em; }
  </style></head><body>${body}</body></html>`;
}

function workshopHead(settings: Partial<SettingsConfig> | null): string {
  const format = settings?.printFormat ?? "Cupom 80mm";
  const logo = logoForFormat(settings, format);
  const image = logo ? `<img class="print-logo" src="${escapeHtml(logo)}" alt="Logomarca da oficina" style="max-width:${logoWidthMm(settings?.logoWidthMm, format)}mm">` : "";
  const lines = [settings?.cnpj && `CNPJ ${settings.cnpj}`, settings?.phone, settings?.address]
    .filter(Boolean)
    .map((line) => `<small>${escapeHtml(line)}</small>`)
    .join("");
  return `<div class="head">${image}<h1>${escapeHtml(settings?.workshopName || "Oficina")}</h1>${lines}</div>`;
}

function itemRows(items: ServiceOrderItem[]): string {
  if (!items.length) return `<tr><td colspan="3">Nenhum item lançado.</td></tr>`;
  return items.map((item) => {
    const quantity = item.quantity ?? 1;
    return `<tr><td class="qty">${quantity}x</td><td>${escapeHtml(item.name)}</td><td class="val">${money(item.price)}</td></tr>`;
  }).join("");
}

/** As vias impressas da OS. Sem "três vias" configurado, sai só a do cliente. */
export function orderCopyLabels(threeCopies: boolean): string[] {
  return threeCopies ? ["Via do mecânico", "Via do caixa", "Via do cliente"] : ["Via do cliente"];
}

export type OrderPrintInput = {
  order: OrderRecord;
  settings: Partial<SettingsConfig> | null;
  mechanics: string;
};

/** Documento da ordem de serviço, pronto para a impressora. */
export function buildOrderDocument({ order, settings, mechanics }: OrderPrintInput): string {
  const items = order.items ?? [];
  const total = order.total ?? items.reduce((sum, item) => sum + item.price, 0);
  const warranty = settings?.defaultWarrantyDays;
  const notes = settings?.defaultOsNotes;

  const via = (label: string) => `<div class="via">
    <div class="copy">${escapeHtml(label)}</div>
    ${workshopHead(settings)}
    <div class="rule"></div>
    <div class="row"><strong>${escapeHtml(order.id)}</strong><span>${escapeHtml(order.time)}</span></div>
    <div class="row"><span class="label">Situação</span><span>${escapeHtml(order.status)}</span></div>
    <div class="rule"></div>
    <div class="facts">
      <div class="fact"><span class="label">Cliente</span><b>${escapeHtml(order.customer)}</b></div>
      ${order.partnerOrderId ? `<div class="fact"><span class="label">OS ${escapeHtml(order.partnerName || "do parceiro")}</span><b>${escapeHtml(order.partnerOrderId)}</b></div>` : ""}
      <div class="fact"><span class="label">Motocicleta</span><b>${escapeHtml(order.bike)}</b>${order.plate ? `<span class="plate">${escapeHtml(order.plate)}</span>` : ""}</div>
      ${order.mileage ? `<div class="fact"><span class="label">Quilometragem</span><b>${escapeHtml(order.mileage)}</b></div>` : ""}
      ${mechanics ? `<div class="fact"><span class="label">Mecânico</span><b>${escapeHtml(mechanics)}</b></div>` : ""}
      ${order.delivery ? `<div class="fact"><span class="label">Previsão de entrega</span><b>${escapeHtml(order.delivery)}</b></div>` : ""}
    </div>
    ${order.problem ? `<div class="rule"></div><div><span class="label">Problema relatado</span><br>${escapeHtml(order.problem)}</div>` : ""}
    <div class="rule"></div>
    <table>${itemRows(items)}</table>
    <div class="rule"></div>
    <div class="row total"><span>Total</span><span>${money(total)}</span></div>
    ${warranty ? `<div class="note">Garantia de ${warranty} dias sobre os serviços executados.</div>` : ""}
    ${notes ? `<div class="note">${escapeHtml(notes)}</div>` : ""}
    <div class="sign">Assinatura do cliente</div>
    <div class="feed"></div>
  </div>`;

  const copies = orderCopyLabels(settings?.printThreeCopies !== false).map(via).join("");
  return documentShell(`OS ${order.id}`, settings?.printFormat ?? "Cupom 80mm", copies);
}

/** Cupom não fiscal da venda do balcão ou do serviço rápido. */
export function buildSaleDocument(sale: SaleRecord, settings: Partial<SettingsConfig> | null): string {
  const body = `<div class="via">
    ${workshopHead(settings)}
    <div class="rule"></div>
    <div class="row"><strong>${escapeHtml(sale.id)}</strong><span>${escapeHtml(sale.date)}</span></div>
    <div class="row"><span class="label">Origem</span><span>${escapeHtml(sale.origin)}</span></div>
    ${sale.customer || sale.mechanicName ? `<div class="facts">
      ${sale.customer ? `<div class="fact"><span class="label">Cliente</span><b>${escapeHtml(sale.customer)}</b></div>` : ""}
      ${sale.mechanicName ? `<div class="fact"><span class="label">Mecânico</span><b>${escapeHtml(sale.mechanicName)}</b></div>` : ""}
    </div>` : ""}
    <div class="rule"></div>
    <table>${itemRows(sale.items)}</table>
    <div class="rule"></div>
    ${sale.discount ? `<div class="row"><span class="label">Subtotal</span><span>${money(sale.subtotal ?? sale.total + sale.discount)}</span></div>
    <div class="row"><span class="label">Desconto</span><span>- ${money(sale.discount)}</span></div>` : ""}
    <div class="row total"><span>Total</span><span>${money(sale.total)}</span></div>
    ${(() => {
      const parts = paymentsOf(sale).filter((part) => part.amount > 0);
      // Cupom com o pagamento dividido linha a linha: o cliente confere o que
      // pagou em cada forma, e a oficina tem o comprovante do que ficou fiado.
      if (parts.length > 1) {
        return parts.map((part) => `<div class="row"><span class="label">${escapeHtml(part.method)}</span><span>${money(part.amount)}</span></div>`).join("");
      }
      return `<div class="row"><span class="label">Pagamento</span><span>${escapeHtml(sale.paymentMethod)}</span></div>`;
    })()}
    ${sale.machineName ? `<div class="row"><span class="label">Maquininha</span><span>${escapeHtml(sale.machineName)}</span></div>` : ""}
    <div class="note">Documento sem valor fiscal.</div>
    <div class="feed"></div>
  </div>`;
  return documentShell(`Cupom ${sale.id}`, settings?.printFormat ?? "Cupom 80mm", body);
}

/** Mensagem de WhatsApp da OS, a partir do modelo configurado pela oficina. */
export function buildOrderWhatsappMessage(order: OrderRecord, settings: Partial<SettingsConfig> | null): string {
  const template = settings?.defaultWhatsappMessage
    || "Olá {cliente}! Sua moto {moto} (Placa {placa}) está na {oficina}. Total: {total}.";
  return fillTemplate(template, {
    cliente: order.customer,
    moto: order.bike,
    placa: order.plate,
    os: order.id,
    status: order.status,
    total: money(order.total ?? 0),
    oficina: settings?.workshopName || "oficina",
    previsao: order.delivery ?? "",
  });
}

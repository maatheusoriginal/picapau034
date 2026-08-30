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

/** O cupom térmico é estreito e sem margem; o A4 é uma folha comum. */
function documentStyle(format: PrintFormat): string {
  const thermal = !String(format).toLowerCase().includes("a4");
  return thermal
    ? `@page { size: 80mm auto; margin: 4mm; }
       body { width: 72mm; margin: 0; font-family: "Courier New", monospace; font-size: 11px; color: #000; }
       h1 { font-size: 13px; margin: 0 0 2px; }
       .via { page-break-after: always; }
       .via:last-child { page-break-after: auto; }`
    : `@page { size: A4; margin: 14mm; }
       body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; }
       h1 { font-size: 18px; margin: 0 0 4px; }
       .via { page-break-after: always; }
       .via:last-child { page-break-after: auto; }`;
}

function documentShell(title: string, format: PrintFormat, body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    ${documentStyle(format)}
    .head { text-align: center; margin-bottom: 8px; }
    .head small { display: block; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .rule { border-top: 1px dashed #000; margin: 6px 0; }
    .label { text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    td.qty { width: 28px; }
    td.val { text-align: right; white-space: nowrap; }
    .total { font-weight: bold; font-size: 13px; }
    .sign { margin-top: 22px; border-top: 1px solid #000; padding-top: 3px; text-align: center; }
    .note { margin-top: 8px; font-size: 9px; line-height: 1.35; }
    .copy { text-align: center; font-weight: bold; margin-bottom: 4px; }
  </style></head><body>${body}</body></html>`;
}

function workshopHead(settings: Partial<SettingsConfig> | null): string {
  const lines = [settings?.cnpj && `CNPJ ${settings.cnpj}`, settings?.phone, settings?.address]
    .filter(Boolean)
    .map((line) => `<small>${escapeHtml(line)}</small>`)
    .join("");
  return `<div class="head"><h1>${escapeHtml(settings?.workshopName || "Oficina")}</h1>${lines}</div>`;
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
    <div><span class="label">Cliente</span><br>${escapeHtml(order.customer)}</div>
    <div><span class="label">Motocicleta</span><br>${escapeHtml(order.bike)}${order.plate ? ` · ${escapeHtml(order.plate)}` : ""}</div>
    ${order.mileage ? `<div><span class="label">Quilometragem</span><br>${escapeHtml(order.mileage)}</div>` : ""}
    ${mechanics ? `<div><span class="label">Mecânico</span><br>${escapeHtml(mechanics)}</div>` : ""}
    ${order.delivery ? `<div><span class="label">Previsão</span><br>${escapeHtml(order.delivery)}</div>` : ""}
    ${order.problem ? `<div class="rule"></div><div><span class="label">Problema relatado</span><br>${escapeHtml(order.problem)}</div>` : ""}
    <div class="rule"></div>
    <table>${itemRows(items)}</table>
    <div class="rule"></div>
    <div class="row total"><span>Total</span><span>${money(total)}</span></div>
    ${warranty ? `<div class="note">Garantia de ${warranty} dias sobre os serviços executados.</div>` : ""}
    ${notes ? `<div class="note">${escapeHtml(notes)}</div>` : ""}
    <div class="sign">Assinatura do cliente</div>
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
    ${sale.customer ? `<div class="row"><span class="label">Cliente</span><span>${escapeHtml(sale.customer)}</span></div>` : ""}
    ${sale.mechanicName ? `<div class="row"><span class="label">Mecânico</span><span>${escapeHtml(sale.mechanicName)}</span></div>` : ""}
    <div class="rule"></div>
    <table>${itemRows(sale.items)}</table>
    <div class="rule"></div>
    ${sale.discount ? `<div class="row"><span class="label">Subtotal</span><span>${money(sale.subtotal ?? sale.total + sale.discount)}</span></div>
    <div class="row"><span class="label">Desconto</span><span>- ${money(sale.discount)}</span></div>` : ""}
    <div class="row total"><span>Total</span><span>${money(sale.total)}</span></div>
    <div class="row"><span class="label">Pagamento</span><span>${escapeHtml(sale.paymentMethod)}</span></div>
    ${sale.machineName ? `<div class="row"><span class="label">Maquininha</span><span>${escapeHtml(sale.machineName)}</span></div>` : ""}
    <div class="note">Documento sem valor fiscal.</div>
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

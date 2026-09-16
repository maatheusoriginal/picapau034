/**
 * A ordem de serviço em A4, para o cliente.
 *
 * O cupom térmico continua existindo e não muda: ele é o papel da oficina, das
 * três vias e da guilhotina. Este aqui é outro documento, com outra função —
 * é o que a oficina manda pelo WhatsApp, e que o cliente abre no celular,
 * guarda, mostra para outra pessoa ou leva para a seguradora.
 *
 * Aqui mora só o CONTEÚDO: o que entra, o que fica de fora e como cada valor é
 * escrito. O desenho no papel fica em app/order-pdf-file.ts, que é a única
 * parte que conhece a biblioteca de PDF. A separação é o que permite conferir
 * as regras deste documento por `npm run check:order-pdf`, sem navegador.
 *
 * DUAS REGRAS MANDAM AQUI:
 *
 * 1. O TOTAL DO PDF É O TOTAL DA OS. Não existe conta nova: os valores saem de
 *    `partnerTotals`, a mesma função que a tela da OS usa para mostrar o total.
 *    Uma segunda regra de cálculo divergiria um dia, e o dia em que divergir é
 *    o dia em que o cliente recebe um papel com valor diferente do que pagou.
 *
 * 2. O CLIENTE NÃO VÊ NÚMERO INTERNO. Custo de aquisição, margem, lucro e
 *    comissão existem no sistema e NÃO entram neste documento em hipótese
 *    alguma. O modelo só lê nome, quantidade e preço de venda; a conferência
 *    prova isso lendo o documento inteiro atrás dos números de custo.
 */
import { partnerTotals } from "./partner";
import type { ClientRecord, MotorcycleRecord, OrderRecord, ServiceOrderItem, SettingsConfig } from "./types";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const texto = (valor: unknown) => String(valor ?? "").trim();

/** Um par rótulo/valor. Valor vazio não vira campo: some do documento. */
export type PdfField = { label: string; value: string };

export type PdfTableRow = {
  description: string;
  quantity: string;
  unit: string;
  total: string;
};

export type PdfTable = {
  title: string;
  rows: PdfTableRow[];
  subtotalLabel: string;
  subtotal: string;
};

export type PdfTextBlock = { title: string; text: string };

export type OrderPdfModel = {
  /** Nome no topo e as linhas de contato, já filtradas. */
  workshop: { name: string; lines: string[]; logo: string };
  title: string;
  /** Número, datas, situação. */
  headline: PdfField[];
  customer: PdfField[];
  motorcycle: PdfField[];
  /** Serviços e peças. Tabela sem linha nenhuma não entra. */
  tables: PdfTable[];
  /** Somas parciais e desconto. */
  totals: PdfField[];
  grandTotal: PdfField;
  texts: PdfTextBlock[];
  footer: string;
};

const campos = (pares: Array<[string, unknown]>): PdfField[] =>
  pares.map(([label, value]) => ({ label, value: texto(value) })).filter((campo) => campo.value !== "");

/**
 * O valor unitário da linha.
 *
 * `price` no sistema é o TOTAL da linha (unitário × quantidade) — está escrito
 * assim no tipo e é assim que a OS soma. O cliente quer conferir o unitário,
 * então ele sai da divisão, que é a mesma conta feita ao contrário.
 */
export function unitPrice(item: ServiceOrderItem): number {
  const quantidade = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  return Math.round((Number(item.price || 0) / quantidade) * 100) / 100;
}

function linha(item: ServiceOrderItem): PdfTableRow {
  const quantidade = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  return {
    description: texto(item.name) || "Item sem descrição",
    // Inteiro sai sem casas ("2"), fracionado mantém as casas ("0,5" litro).
    quantity: Number.isInteger(quantidade) ? String(quantidade) : quantidade.toLocaleString("pt-BR"),
    unit: money(unitPrice(item)),
    total: money(Number(item.price || 0)),
  };
}

/** A quilometragem como a oficina escreve: com o ponto do milhar. */
export function mileageText(order: Pick<OrderRecord, "mileage">, motorcycle?: MotorcycleRecord | null): string {
  const daOs = texto(order.mileage);
  const bruto = daOs || (motorcycle?.mileage ? String(motorcycle.mileage) : "");
  if (!bruto) return "";
  const numero = Number(bruto.replace(/\D/g, ""));
  return Number.isFinite(numero) && numero > 0 ? `${numero.toLocaleString("pt-BR")} km` : bruto;
}

export type OrderPdfInput = {
  order: OrderRecord;
  client?: ClientRecord | null;
  motorcycle?: MotorcycleRecord | null;
  settings: Partial<SettingsConfig> | null;
  /** Nomes dos mecânicos já resolvidos pela tela. */
  mechanics?: string;
  /** Desconto de mão de obra da parceira, em porcentagem. */
  laborDiscountPercent?: number;
};

export function buildOrderPdfModel({ order, client, motorcycle, settings, mechanics, laborDiscountPercent = 0 }: OrderPdfInput): OrderPdfModel {
  const items = order.items ?? [];
  const totais = partnerTotals(items, laborDiscountPercent);
  const servicos = items.filter((item) => item.type === "Mão de obra");
  const pecas = items.filter((item) => item.type !== "Mão de obra");

  /*
    OS antiga, de antes de o sistema detalhar itens, guarda só o total. Mostrar
    "Total: R$ 0,00" num papel que vai para o cliente seria pior do que não ter
    tabela nenhuma, então o total gravado é o que manda quando não há item.
  */
  const semItens = items.length === 0;
  const totalDaOS = semItens ? Number(order.total || 0) : totais.total;

  const tabelas: PdfTable[] = [];
  if (servicos.length) {
    tabelas.push({
      title: "Serviços e mão de obra",
      rows: servicos.map(linha),
      subtotalLabel: "Subtotal de serviços",
      subtotal: money(totais.labor),
    });
  }
  if (pecas.length) {
    tabelas.push({
      title: "Peças e produtos",
      rows: pecas.map(linha),
      subtotalLabel: "Subtotal de peças",
      subtotal: money(totais.parts),
    });
  }

  const totals = semItens ? [] : campos([
    ["Total de peças", money(totais.parts)],
    ["Total de serviços e mão de obra", money(totais.labor)],
    // Desconto só aparece quando existe. O sistema não tem acréscimo, e
    // inventar uma linha de acréscimo zerada seria inventar campo.
    ...(totais.discount > 0 ? [["Desconto", `- ${money(totais.discount)}`] as [string, unknown]] : []),
  ]);

  const quemPaga = texto(order.partnerName) || texto(client?.name) || texto(order.customer);

  return {
    workshop: {
      name: texto(settings?.workshopName) || "Oficina",
      lines: [
        texto(settings?.cnpj) ? `CNPJ ${texto(settings?.cnpj)}` : "",
        [texto(settings?.phone), texto(settings?.secondaryPhone)].filter(Boolean).join(" · "),
        texto(settings?.address),
      ].filter(Boolean),
      // A logomarca só entra se a oficina mandou usá-la no A4.
      logo: settings?.logoOnA4 === false ? "" : texto(settings?.logoDataUrl),
    },
    title: `ORDEM DE SERVIÇO Nº ${texto(order.id)}`,
    headline: campos([
      ["Data de abertura", order.time],
      ["Data de fechamento", order.closedAt],
      ["Situação", order.closed ? "Encerrada e entregue" : order.status],
      ["Previsão de entrega", order.delivery],
      ["Prioridade", order.priority],
      ["Mecânico responsável", texto(mechanics) || texto(order.mechanic)],
      // O número do papel da parceira: é por ele que a concessionária e a
      // oficina se acham quando conversam sobre a mesma moto.
      [`OS ${texto(order.partnerName) || "do parceiro"}`, order.partnerOrderId],
    ]),
    customer: campos([
      ["Nome", quemPaga],
      ["Telefone", client?.phone],
      ["CPF / CNPJ", client?.document],
      ["Endereço", client?.address],
      ["E-mail", client?.email],
    ]),
    motorcycle: campos([
      ["Marca", motorcycle?.brand],
      ["Modelo", texto(motorcycle?.model) || texto(order.bike)],
      ["Ano/Modelo", motorcycle?.year],
      ["Placa", texto(order.plate) || texto(motorcycle?.plate)],
      ["Cor", motorcycle?.color],
      ["Cilindrada", motorcycle?.engineSize],
      ["Chassi", motorcycle?.chassis],
      ["Quilometragem", mileageText(order, motorcycle)],
      ["Combustível na entrada", order.fuelLevel],
    ]),
    tables: tabelas,
    totals,
    grandTotal: { label: "TOTAL DA ORDEM DE SERVIÇO", value: money(totalDaOS) },
    texts: [
      { title: "Problema relatado pelo cliente", text: texto(order.problem) },
      { title: "Diagnóstico e serviço executado", text: texto(order.solution) },
      { title: "Observações", text: texto(order.notes) },
      {
        title: "Garantia",
        text: settings?.defaultWarrantyDays
          ? `Garantia de ${settings.defaultWarrantyDays} dias sobre os serviços executados.`
          : "",
      },
      { title: "Informações da oficina", text: texto(settings?.defaultOsNotes) },
    ].filter((bloco) => bloco.text !== ""),
    footer: `${texto(settings?.workshopName) || "Oficina"} · Documento sem valor fiscal`,
  };
}

/**
 * O nome do arquivo que chega no WhatsApp.
 *
 * Com o número da OS e a placa, porque no celular do cliente ele vai ficar
 * perdido no meio de dezenas de outros — "documento.pdf" não ajuda ninguém.
 */
export function orderPdfFileName(order: Pick<OrderRecord, "id" | "plate">): string {
  const partes = [texto(order.id), texto(order.plate).replace(/[^A-Za-z0-9]/g, "")].filter(Boolean);
  const nome = partes.join("-").replace(/[^A-Za-z0-9._-]/g, "") || "ordem-de-servico";
  return `${nome}.pdf`;
}

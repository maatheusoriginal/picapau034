import { markupFromPrice, priceFromMarkup, toAmount } from "./inventory";
import type { ProductRecord, SettingsConfig } from "./types";

/**
 * Leitura da planilha de estoque.
 *
 * A oficina que já tem as peças em planilha não deveria precisar digitar tudo
 * de novo. Isto lê o CSV do modelo, aponta os problemas linha a linha ANTES de
 * gravar, e diz o que vai ser criado e o que vai ser atualizado.
 *
 * Funções puras: quem grava é a tela. Assim dá para conferir o comportamento
 * com planilhas de exemplo (ver scripts/check-import.ts) — inclusive os casos
 * chatos, que são a regra em planilha de verdade: vírgula decimal, ponto de
 * milhar, aspas, acento, linha em branco no fim, cabeçalho fora de ordem.
 */

/**
 * Transforma os bytes do arquivo em texto.
 *
 * O Excel em português salva "CSV (separado por ponto e vírgula)" em ANSI, não
 * em UTF-8 — e aí "Óleo" chega como "Óleo" ou "?leo". Tenta UTF-8 primeiro,
 * no modo que reclama de byte inválido, e só cai para windows-1252 quando o
 * arquivo realmente não é UTF-8.
 */
export function decodeSheetBytes(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Uma célula pode vir entre aspas e conter o próprio separador ou quebra de linha. */
export function parseCsv(text: string): string[][] {
  // O Excel salva com BOM; deixá-lo estraga o primeiro nome de coluna.
  const content = String(text ?? "").replace(/^﻿/, "");
  if (!content.trim()) return [];

  // Separador: o Excel brasileiro usa ";" e o Sheets em inglês usa ",".
  // Decide pelo que aparece mais na primeira linha fora das aspas.
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const outside = firstLine.replace(/"[^"]*"/g, "");
  const separator = (outside.split(";").length >= outside.split(",").length) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    if (quoted) {
      if (char === '"') {
        // Aspas duplas seguidas são uma aspa literal dentro do texto.
        if (content[index + 1] === '"') { cell += '"'; index += 1; } else { quoted = false; }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === separator) { row.push(cell); cell = ""; continue; }
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (char === "\r") continue;
    cell += char;
  }
  row.push(cell);
  rows.push(row);

  // Linhas totalmente vazias — o fim do arquivo quase sempre tem uma.
  return rows.filter((line) => line.some((value) => value.trim() !== ""));
}

/** Tira acento e caixa para casar o cabeçalho mesmo escrito de outro jeito. */
function normalizeHeader(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Nomes aceitos para cada coluna. A ordem das colunas na planilha não importa. */
const COLUMNS: Record<string, string[]> = {
  name: ["nome", "produto", "descricao", "peca"],
  barcode: ["codigodebarras", "codigobarras", "ean", "barras"],
  partNumber: ["codigodapecaopcional", "codigodapeca", "referencia", "partnumber", "sku"],
  stock: ["quantidade", "estoque", "qtd"],
  category: ["categoria", "grupo"],
  brand: ["marca", "fabricante"],
  unit: ["unidade", "un"],
  cost: ["precodecusto", "custo"],
  price: ["precodevenda", "preco", "venda"],
  minimum: ["estoqueminimo", "minimo"],
  compatibility: ["compatibilidade", "aplicacao"],
  location: ["localizacao", "local", "prateleira"],
  supplier: ["fornecedor"],
};

export type StockImportRow = {
  /** Número da linha na planilha, contando o cabeçalho — é o que a pessoa vê no Excel. */
  line: number;
  name: string;
  barcode: string;
  partNumber: string;
  stock: number;
  category: string;
  brand: string;
  unit: string;
  cost: number;
  price: number;
  minimum: number;
  compatibility: string;
  location: string;
  supplier: string;
};

export type ImportIssue = { line: number; name: string; message: string };

/**
 * Lê a planilha inteira. Devolve as linhas válidas e os problemas, em vez de
 * parar no primeiro erro: quem está importando quer corrigir tudo de uma vez.
 */
export function parseStockSheet(text: string): { rows: StockImportRow[]; issues: ImportIssue[]; missingColumns: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], issues: [{ line: 0, name: "", message: "A planilha está vazia." }], missingColumns: [] };

  const header = (table[0] ?? []).map(normalizeHeader);
  const indexOf = (key: string) => header.findIndex((column) => COLUMNS[key]!.includes(column));

  const positions = Object.fromEntries(Object.keys(COLUMNS).map((key) => [key, indexOf(key)])) as Record<string, number>;
  const missingColumns = ["name", "stock"].filter((key) => positions[key]! < 0);
  if (missingColumns.length) {
    // Diz qual coluna falta, não as duas: quem esqueceu só a quantidade não
    // precisa sair procurando a coluna Nome que já está lá.
    const labels = missingColumns.map((key) => (key === "name" ? "Nome" : "Quantidade")).join(" e ");
    return {
      rows: [],
      issues: [{ line: 1, name: "", message: `Falta a coluna ${labels} na planilha. Baixe o modelo e confira o cabeçalho.` }],
      missingColumns,
    };
  }

  const rows: StockImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();

  table.slice(1).forEach((cells, index) => {
    const line = index + 2; // +1 pelo cabeçalho, +1 porque planilha começa em 1
    const at = (key: string) => (positions[key]! >= 0 ? (cells[positions[key]!] ?? "").trim() : "");
    const name = at("name");
    if (!name) {
      issues.push({ line, name: "", message: "Linha sem nome do produto." });
      return;
    }

    // A linha de exemplo do modelo mostra o formato das colunas; importá-la
    // colocaria uma peça que não existe no estoque de quem esqueceu de apagar.
    if (normalizeHeader(name).startsWith("exemplo")) return;

    const stockText = at("stock");
    const stock = toAmount(stockText);
    if (stockText && !Number.isFinite(Number(stockText.replace(",", ".")))) {
      issues.push({ line, name, message: `Quantidade "${stockText}" não é um número.` });
      return;
    }
    if (stock < 0) {
      issues.push({ line, name, message: "Quantidade negativa." });
      return;
    }

    const price = toAmount(at("price"));
    const cost = toAmount(at("cost"));
    if (price > 0 && cost > price) {
      issues.push({ line, name, message: `Preço de venda (${price}) menor que o custo (${cost}).` });
    }

    // Duplicata dentro da própria planilha: casa por código de barras, e por
    // nome quando não há código.
    const key = (at("barcode") || name).toLowerCase();
    const previous = seen.get(key);
    if (previous) {
      issues.push({ line, name, message: `Repetido — já aparece na linha ${previous}.` });
      return;
    }
    seen.set(key, line);

    rows.push({
      line,
      name,
      barcode: at("barcode"),
      partNumber: at("partNumber"),
      stock,
      category: at("category"),
      brand: at("brand"),
      unit: at("unit"),
      cost,
      price,
      minimum: toAmount(at("minimum")),
      compatibility: at("compatibility"),
      location: at("location"),
      supplier: at("supplier"),
    });
  });

  return { rows, issues, missingColumns: [] };
}

export type ImportPlan = {
  /** Peças que não existem ainda. */
  create: StockImportRow[];
  /** Peças já cadastradas, com o produto correspondente. */
  update: Array<{ row: StockImportRow; product: ProductRecord }>;
  issues: ImportIssue[];
};

/**
 * Decide o que é peça nova e o que é atualização.
 *
 * Casa primeiro por código de barras — que é único de verdade — e só depois por
 * nome. Casar só por nome criaria duplicata para "Óleo 20W50" e "óleo 20w50".
 */
export function planStockImport(
  rows: StockImportRow[],
  products: ProductRecord[],
  issues: ImportIssue[] = [],
): ImportPlan {
  const byBarcode = new Map<string, ProductRecord>();
  const byName = new Map<string, ProductRecord>();
  products.forEach((product) => {
    if (product.barcode) byBarcode.set(product.barcode.trim().toLowerCase(), product);
    if (product.name) byName.set(product.name.trim().toLowerCase(), product);
  });

  const create: StockImportRow[] = [];
  const update: Array<{ row: StockImportRow; product: ProductRecord }> = [];

  rows.forEach((row) => {
    const product = (row.barcode && byBarcode.get(row.barcode.trim().toLowerCase()))
      || byName.get(row.name.trim().toLowerCase());
    if (product) update.push({ row, product });
    else create.push(row);
  });

  return { create, update, issues };
}

/** Formata o valor como o cadastro de produto grava o custo e o preço: texto em reais. */
export function toStoredAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * O que vai para o Firestore em uma peça nova.
 *
 * Grava custo e preço como texto em reais porque é assim que o cadastro de
 * produto grava e é assim que a tabela de estoque imprime. E completa o que a
 * planilha não trouxe com o padrão configurado na oficina, em vez de deixar a
 * peça sem unidade e com estoque mínimo zero.
 */
export function newProductPayload(row: StockImportRow, settings?: Partial<SettingsConfig> | null): Record<string, unknown> {
  const cost = row.cost;
  // Sem preço na planilha mas com custo: aplica o markup sugerido, que é
  // exatamente o que a oficina faria à mão peça por peça.
  const suggested = settings?.pricingMode === "markup" ? toAmount(settings?.suggestedMarkup) : 0;
  const price = row.price > 0 ? row.price : priceFromMarkup(cost, suggested);
  const minimum = row.minimum > 0 ? row.minimum : toAmount(settings?.defaultMinStock);
  return {
    code: "",
    barcode: row.barcode,
    partNumber: row.partNumber,
    name: row.name,
    category: row.category || "Peças",
    brand: row.brand,
    unit: row.unit || settings?.defaultUnit || "UN",
    location: row.location,
    cost: toStoredAmount(cost),
    markup: markupFromPrice(cost, price),
    price: toStoredAmount(price),
    stock: row.stock,
    minimum,
    maximum: 0,
    alertLowStock: true,
    compatibility: row.compatibility,
    supplierId: "",
    supplierName: row.supplier,
    notes: "",
    active: true,
    status: stockStatus(row.stock, minimum),
  };
}

/**
 * O que muda em uma peça que já existe.
 *
 * Só o que veio preenchido na planilha. Quem exportou o estoque só com nome e
 * quantidade para fazer a contagem não deveria voltar com preço, categoria e
 * fornecedor apagados.
 *
 * A quantidade substitui a do sistema em vez de somar: a planilha é uma
 * contagem, não uma entrada de mercadoria. Assim, importar a mesma planilha
 * duas vezes por engano não dobra o estoque.
 */
export function updatedProductPayload(row: StockImportRow, product: ProductRecord): Record<string, unknown> {
  const data: Record<string, unknown> = { stock: row.stock };
  const cost = row.cost > 0 ? row.cost : toAmount(product.cost);
  const price = row.price > 0 ? row.price : toAmount(product.price);
  if (row.barcode) data.barcode = row.barcode;
  if (row.partNumber) data.partNumber = row.partNumber;
  if (row.category) data.category = row.category;
  if (row.brand) data.brand = row.brand;
  if (row.unit) data.unit = row.unit;
  if (row.location) data.location = row.location;
  if (row.compatibility) data.compatibility = row.compatibility;
  if (row.supplier) data.supplierName = row.supplier;
  if (row.minimum > 0) data.minimum = row.minimum;
  if (row.cost > 0) data.cost = toStoredAmount(cost);
  if (row.price > 0) data.price = toStoredAmount(price);
  if (row.cost > 0 || row.price > 0) data.markup = markupFromPrice(cost, price);
  data.status = stockStatus(row.stock, row.minimum > 0 ? row.minimum : toAmount(product.minimum));
  return data;
}

/** Mesma regra do cadastro de produto, para a lista de estoque marcar igual. */
function stockStatus(stock: number, minimum: number): string {
  if (stock > minimum) return "Em estoque";
  return stock === 0 ? "Esgotado" : "Estoque baixo";
}

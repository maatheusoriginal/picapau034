/**
 * Gera o PDF de verdade e lê o que saiu dentro dele.
 *
 * A conferência de src/order-pdf.ts prova o MODELO: o que deveria entrar no
 * papel. Esta aqui gera o arquivo com a mesma função que a oficina usa ao
 * clicar em "Baixar PDF", abre o arquivo e lê o texto que foi realmente
 * escrito. É a diferença entre "o modelo diz que o total é R$ 315,00" e "o
 * arquivo que chega no WhatsApp do cliente tem R$ 315,00 escrito nele".
 *
 * Também é aqui que se confere o tamanho da folha e a quantidade de páginas:
 * OS de rotina precisa caber em uma página, senão o cliente recebe duas folhas
 * para ler uma troca de óleo.
 *
 * Rode com: npm run check:order-pdf-render
 */
import { inflateSync } from "node:zlib";
import { buildOrderPdfModel } from "../src/order-pdf";
import { renderOrderPdf } from "../app/order-pdf-file";
import type { ClientRecord, MotorcycleRecord, OrderRecord, SettingsConfig } from "../src/types";

const settings: Partial<SettingsConfig> = {
  workshopName: "PICA PAU MOTOS", cnpj: "12.345.678/0001-90",
  phone: "(34) 3333-3333", address: "AV. RONDON PACHECO, 1200",
  defaultWarrantyDays: 90,
};
const cliente: ClientRecord = {
  id: "CLI-1", name: "JOAO DA SILVA", phone: "(34) 98888-1111", document: "123.456.789-00",
  detail: "", meta: "", condition: "", motorcycleIds: [],
};
const moto: MotorcycleRecord = {
  id: "MOTO-1", ownerId: "CLI-1", plate: "ABC-1D23", brand: "HONDA", model: "CG 160 FAN",
  year: "2020/2021", color: "PRETA", mileage: 41200,
};

/** A OS de rotina da oficina: um serviço, duas peças, textos curtos. */
const osTipica: OrderRecord = {
  id: "OS-0041", customer: "JOAO DA SILVA", bike: "CG 160 FAN", plate: "ABC-1D23",
  mechanic: "RONALDO", mechanicIds: [], time: "16/09/2026, 09:15", status: "Entrega", tone: "green",
  clientId: "CLI-1", motorcycleId: "MOTO-1",
  problem: "BARULHO NA CORRENTE E TROCA DE OLEO.",
  solution: "KIT RELACAO SUBSTITUIDO E OLEO TROCADO.",
  items: [
    { id: "L1", type: "Mão de obra", name: "TROCA DO KIT RELACAO", price: 90 },
    { id: "P1", type: "Peça", productId: "PRD-1", name: "KIT RELACAO", price: 180, quantity: 1, cost: 110 },
    { id: "P2", type: "Peça", productId: "PRD-2", name: "OLEO 20W50", price: 90, quantity: 2, cost: 26 },
  ],
  total: 360,
};

/**
 * Lê o texto escrito no PDF.
 *
 * jsPDF grava o conteúdo comprimido, então cada fluxo é descomprimido e os
 * pedaços entre parênteses — que é como o PDF guarda texto — são juntados.
 */
function textoDoPdf(pdf: Buffer): string {
  const bruto = pdf.toString("latin1");
  const pedacos: string[] = [];
  const fluxos = bruto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);
  for (const fluxo of fluxos) {
    let conteudo = fluxo[1];
    try {
      conteudo = inflateSync(Buffer.from(fluxo[1], "latin1")).toString("latin1");
    } catch {
      // Fluxo que não é texto comprimido (uma imagem, por exemplo) fica como
      // está: o que interessa é achar os parênteses, e eles não aparecem lá.
    }
    for (const achado of conteudo.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
      pedacos.push(achado[1].replace(/\\([()\\])/g, "$1"));
    }
  }
  return pedacos.join(" | ");
}

async function main() {
  const modelo = buildOrderPdfModel({ order: osTipica, client: cliente, motorcycle: moto, settings, mechanics: "RONALDO" });
  const doc = await renderOrderPdf(modelo);
  const pdf = Buffer.from(doc.output("arraybuffer"));
  const texto = textoDoPdf(pdf);
  const paginas = doc.getNumberOfPages();
  const folha = doc.internal.pageSize;

  const casos: Array<[string, unknown, unknown]> = [
    // A folha é A4 em pé. Errar isto é o cliente receber um papel que não
    // entra na impressora dele.
    ["a folha é A4 em pé, 210mm de largura", Math.round(folha.getWidth()), 210],
    ["e 297mm de altura", Math.round(folha.getHeight()), 297],
    // OS de rotina em UMA página: o cliente não pode receber duas folhas para
    // ler uma troca de óleo.
    ["a OS de rotina cabe em uma página", paginas, 1],
    ["e o arquivo é leve o bastante para o WhatsApp", pdf.length < 60 * 1024, true],
    ["é PDF de verdade, e não foto da tela", pdf.subarray(0, 5).toString(), "%PDF-"],

    // O que o cliente precisa achar no papel.
    ["o número da OS está escrito no arquivo", texto.includes("OS-0041"), true],
    ["o nome da oficina também", texto.includes("PICA PAU MOTOS"), true],
    ["o CNPJ", texto.includes("12.345.678/0001-90"), true],
    ["o cliente", texto.includes("JOAO DA SILVA"), true],
    ["a placa", texto.includes("ABC-1D23"), true],
    ["a moto", texto.includes("CG 160 FAN"), true],
    ["o serviço executado", texto.includes("TROCA DO KIT RELACAO"), true],
    ["a peça", texto.includes("KIT RELACAO"), true],
    ["o problema relatado", texto.includes("BARULHO NA CORRENTE"), true],
    ["a garantia", texto.includes("90 dias"), true],

    /*
      Os VALORES, que são a razão de o papel existir.

      O óleo custou 90 no total por 2 unidades, então o unitário é 45. Se o
      documento mostrasse 90 como unitário, o cliente somaria 90+90 e acharia
      que está sendo cobrado a mais — é exatamente a conta que ele faz.
    */
    ["o unitário da peça com 2 unidades", texto.includes("45,00"), true],
    ["o total da linha", texto.includes("90,00"), true],
    ["o total de peças", texto.includes("270,00"), true],
    ["e o TOTAL da OS, que é o número que ele procura", texto.includes("360,00"), true],
    ["com o rótulo em destaque", texto.includes("TOTAL DA ORDEM DE SERVICO") || texto.includes("TOTAL DA ORDEM DE SERVIÇO"), true],

    /*
      E o que NÃO pode estar no arquivo.

      O custo das peças desta OS é 110 e 26. Se vazasse, vazaria escrito em
      dinheiro, porque é assim que o documento escreve valor. A busca é no
      texto extraído do PDF gerado — não no modelo —, então pega inclusive um
      vazamento que alguém introduzisse direto no desenho.
    */
    ["o custo da peça não está no arquivo", texto.includes("110,00"), false],
    ["nem o da outra", texto.includes("26,00"), false],
    ["a palavra custo não foi impressa", /\bcusto/i.test(texto), false],
    ["nem margem", /\bmargem|\bmarkup/i.test(texto), false],
    ["nem lucro", /\blucro/i.test(texto), false],
    // A oficina pediu para NÃO ter assinatura neste documento.
    ["e não há campo de assinatura", /assinatura/i.test(texto), false],
  ];

  let falhas = 0;
  for (const [nome, obtido, esperado] of casos) {
    const ok = obtido === esperado;
    if (!ok) falhas += 1;
    console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
  }
  console.log(falhas === 0
    ? `\nO PDF sai certo: ${paginas} página, ${Math.round(pdf.length / 1024)} kB.`
    : `\n${falhas} caso(s) errados.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((erro) => { console.error(erro); process.exit(1); });

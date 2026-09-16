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
import type { ClientRecord, MotorcycleRecord, OrderRecord, ServiceOrderItem, SettingsConfig } from "../src/types";

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

/*
  A OS COMO A OFICINA PREENCHE DE VERDADE.

  A de cima é a troca de óleo: dois itens, cadastro pela metade, textos curtos.
  Ela sempre coube em uma folha — e foi por isso que o documento passou a ficar
  com DUAS páginas sem ninguém perceber. Com o cliente tendo endereço e e-mail,
  a moto tendo chassi e cilindrada, e o problema e o diagnóstico escritos por
  extenso, o conteúdo passava de 340 mm numa folha que oferece 263 mm.

  Este é o caso que o dono da oficina reclamou, então é o caso que fica escrito.
*/
const settingsCheio: Partial<SettingsConfig> = {
  ...settings,
  secondaryPhone: "(34) 99999-0000",
  address: "AV. RONDON PACHECO, 1200 - CENTRO - UBERLANDIA/MG",
  defaultOsNotes: "PECAS SUBSTITUIDAS FICAM A DISPOSICAO DO CLIENTE POR 30 DIAS.",
};
const clienteCheio: ClientRecord = {
  ...cliente, name: "JOAO CARLOS DE OLIVEIRA SILVA",
  address: "RUA DAS ACACIAS, 450, APTO 12 - BAIRRO SANTA MONICA - UBERLANDIA/MG",
  email: "joao.oliveira@exemplo.com.br",
};
const motoCheia: MotorcycleRecord = { ...moto, chassis: "9C2KC1670LR123456", engineSize: "160" };

const pecasDe = (quantas: number): ServiceOrderItem[] => {
  const nomes = ["KIT RELACAO COM CORRENTE", "OLEO MOTOR 20W50 SEMISSINTETICO", "PASTILHA DE FREIO DIANTEIRA", "VELA DE IGNICAO NGK", "FILTRO DE AR", "ROLAMENTO DE RODA TRASEIRA", "CABO DE EMBREAGEM", "LAMPADA FAROL H4", "PNEU TRASEIRO 90/90-18", "CAMARA DE AR ARO 18", "RELE DE PARTIDA", "BATERIA 12V 5AH"];
  return Array.from({ length: quantas }, (_, i) => ({ id: `PC${i}`, type: "Peça" as const, productId: `PRD-${i}`, name: nomes[i % nomes.length], price: 90 + i * 7, quantity: 1, cost: 40 + i * 3 }));
};
const servicosDe = (quantos: number): ServiceOrderItem[] => {
  const nomes = ["TROCA DO KIT RELACAO", "TROCA DE OLEO E FILTRO", "REVISAO DOS FREIOS", "LIMPEZA DE CARBURADOR"];
  return Array.from({ length: quantos }, (_, i) => ({ id: `MO${i}`, type: "Mão de obra" as const, name: nomes[i % nomes.length], price: 60 + i * 10 }));
};

const osCheia = (itens: ServiceOrderItem[]): OrderRecord => ({
  ...osTipica, id: "OS-001650", customer: clienteCheio.name,
  closedAt: "16/09/2026, 17:40", delivery: "16/09/2026", priority: "Normal",
  fuelLevel: "1/2 TANQUE", mileage: "41200",
  problem: "MOTO FALHANDO EM ALTA ROTACAO, BARULHO NA CORRENTE, FREIO DIANTEIRO RASPANDO E FAROL QUEIMADO. CLIENTE RELATA QUE COMECOU DEPOIS DE PEGAR CHUVA FORTE NA SEMANA PASSADA.",
  solution: "SUBSTITUIDO KIT RELACAO COMPLETO, TROCADO OLEO E FILTRO, PASTILHAS DIANTEIRAS SUBSTITUIDAS, CARBURADOR LIMPO E REGULADO, LAMPADA DO FAROL TROCADA. TESTE DE RODAGEM REALIZADO SEM FALHAS.",
  notes: "CLIENTE PEDIU PARA AVISAR NO WHATSAPP ANTES DE ENTREGAR. PROXIMA REVISAO EM 3000 KM.",
  items: itens,
});

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

  /*
    UMA FOLHA SÓ, com a OS cheia.

    Cabe numa página é metade do que interessa: o documento também cabe se
    alguém resolver esconder o endereço, o chassi ou o diagnóstico. Então cada
    informação que a folha ganhou de aperto é procurada dentro do arquivo
    gerado, uma por uma.
  */
  const cheia = await renderOrderPdf(buildOrderPdfModel({
    order: osCheia([...servicosDe(4), ...pecasDe(14)]),
    client: clienteCheio, motorcycle: motoCheia, settings: settingsCheio, mechanics: "RONALDO + CARLOS",
  }));
  const textoCheia = textoDoPdf(Buffer.from(cheia.output("arraybuffer")));
  casos.push(
    ["a OS cheia, com 18 itens e cadastro completo, cabe em uma folha", cheia.getNumberOfPages(), 1],
    ["e nada foi escondido para caber: o endereço continua lá", textoCheia.includes("RUA DAS ACACIAS"), true],
    ["o e-mail", textoCheia.includes("joao.oliveira@exemplo.com.br"), true],
    ["o chassi", textoCheia.includes("9C2KC1670LR123456"), true],
    ["a quilometragem", textoCheia.includes("41.200 km"), true],
    ["o combustível na entrada", textoCheia.includes("1/2 TANQUE"), true],
    ["a data de fechamento", textoCheia.includes("17:40"), true],
    ["o problema relatado, por extenso", textoCheia.includes("PEGAR CHUVA FORTE NA SEMANA PASSADA"), true],
    ["o diagnóstico, por extenso", textoCheia.includes("TESTE DE RODAGEM REALIZADO SEM FALHAS"), true],
    ["as observações", textoCheia.includes("PROXIMA REVISAO EM 3000 KM"), true],
    ["a primeira peça da lista", textoCheia.includes("KIT RELACAO COM CORRENTE"), true],
    ["e a última, que é a que sumiria se a folha cortasse", textoCheia.includes("BATERIA 12V 5AH"), true],
    ["o custo continua fora do arquivo", /\bcusto|\bmargem|\blucro/i.test(textoCheia), false],
  );

  /*
    E o piso: OS gigante NÃO vira uma folha ilegível.

    O ajuste de escala poderia, em tese, espremer 40 itens numa página em letra
    de bula. Isso caberia e não serviria para nada. Abaixo do piso o documento
    aceita a segunda folha — este caso existe para provar que o piso segura.
  */
  const gigante = await renderOrderPdf(buildOrderPdfModel({
    order: osCheia([...servicosDe(4), ...pecasDe(36)]),
    client: clienteCheio, motorcycle: motoCheia, settings: settingsCheio, mechanics: "RONALDO",
  }));
  casos.push(
    ["OS de 40 itens prefere a segunda folha a ficar ilegível", gigante.getNumberOfPages() > 1, true],
    ["e aí sim a paginação aparece", textoDoPdf(Buffer.from(gigante.output("arraybuffer"))).includes("Página 1 de"), true],
    ["que a de uma folha não mostra", texto.includes("Página 1 de"), false],
  );

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

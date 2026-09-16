/**
 * Confere a ordem de serviço em A4 que vai para o cliente.
 *
 * Este papel sai da oficina e vai para o WhatsApp de quem pagou. Dois erros
 * aqui são caros de um jeito que erro de tela não é: um valor que não bate com
 * o que o cliente pagou, e um número interno da oficina — custo, margem,
 * comissão — impresso num documento que ela mesma mandou para fora.
 *
 * As duas coisas são conferidas aqui.
 *
 * Rode com: npm run check:order-pdf
 */
import { buildOrderPdfModel, mileageText, orderPdfFileName, unitPrice } from "../src/order-pdf";
import { partnerTotals } from "../src/partner";
import type { ClientRecord, MotorcycleRecord, OrderRecord, SettingsConfig } from "../src/types";

const settings: Partial<SettingsConfig> = {
  workshopName: "PICA PAU MOTOS",
  cnpj: "12.345.678/0001-90",
  phone: "(34) 3333-3333",
  secondaryPhone: "(34) 99999-0000",
  address: "AV. RONDON PACHECO, 1200",
  defaultWarrantyDays: 90,
  defaultOsNotes: "PEÇAS ELÉTRICAS COM GARANTIA DO FABRICANTE.",
  logoDataUrl: "data:image/png;base64,AAAA",
};

const cliente: ClientRecord = {
  id: "CLI-1", name: "MARIA SOUZA", phone: "(34) 98888-1111", document: "123.456.789-00",
  address: "RUA DAS FLORES, 45", email: "maria@exemplo.com",
  detail: "", meta: "", condition: "", motorcycleIds: [],
};

const moto: MotorcycleRecord = {
  id: "MOTO-1", ownerId: "CLI-1", plate: "QNM-8J02", brand: "HONDA", model: "CG 160 TITAN",
  year: "2017/2018", color: "VERMELHO", engineSize: "160", chassis: "9C2KC1670HR000000", mileage: 32450,
};

const os: OrderRecord = {
  id: "OS-001650", customer: "MARIA SOUZA", bike: "CG 160 TITAN", plate: "QNM-8J02",
  mechanic: "RONALDO", mechanicIds: ["USR-2"], time: "18/08/2026, 09:15", status: "Em serviço",
  tone: "amber", clientId: "CLI-1", motorcycleId: "MOTO-1", mileage: "32450", fuelLevel: "1/2",
  delivery: "20/08/2026", priority: "Normal",
  problem: "MOTOR FALHANDO EM ALTA E VAZAMENTO NA BENGALA",
  solution: "TROCADO O RETENTOR E REGULADAS AS VÁLVULAS",
  notes: "CLIENTE PEDIU PARA AVISAR ANTES DE TROCAR PNEU",
  items: [
    { id: "L1", type: "Mão de obra", name: "TROCA DE RETENTOR DA BENGALA", price: 80 },
    { id: "L2", type: "Mão de obra", name: "REVISÃO", price: 120 },
    { id: "P1", type: "Peça", productId: "PRD-1", name: "RETENTOR DA BENGALA", price: 70, quantity: 2, cost: 41 },
    { id: "P2", type: "Peça", productId: "PRD-2", name: "ÓLEO DA BENGALA", price: 45, quantity: 1, cost: 26 },
  ],
  total: 315,
};

const modelo = buildOrderPdfModel({ order: os, client: cliente, motorcycle: moto, settings, mechanics: "RONALDO" });
const rotulos = (campos: { label: string }[]) => campos.map((campo) => campo.label).join(",");
const valorDe = (campos: { label: string; value: string }[], rotulo: string) => campos.find((campo) => campo.label === rotulo)?.value;

/*
  A varredura atrás de vazamento olha só os VALORES, nunca as chaves.

  A primeira versão procurava no JSON inteiro e reprovava sozinha: "26" casava
  dentro da data "18/08/2026", e "custo" casava dentro da palavra "customer".
  Busca que dá alarme falso é busca que alguém desliga — e aí ela para de
  proteger justamente no dia em que precisaria.
*/
const valoresDe = (valor: unknown): string[] => {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(valoresDe);
  if (valor && typeof valor === "object") return Object.values(valor).flatMap(valoresDe);
  return [];
};
const documentoInteiro = valoresDe(modelo).join(" | ");
// O custo dos itens desta OS: 41 e 26. Se algum deles chegar ao papel, chega
// escrito em dinheiro — é assim que o modelo escreve todo valor.
const custoEmDinheiro = ["R$\u00A041,00", "R$\u00A026,00"];
const totaisDaTela = partnerTotals(os.items!, 0);

// --- OS mínima, sem cliente cadastrado, sem moto cadastrada e sem item ------
const osMagra: OrderRecord = {
  id: "OS-0002", customer: "", bike: "CG 125", plate: "", mechanic: "", mechanicIds: [],
  time: "01/09/2026, 08:00", status: "Em avaliação", tone: "blue", total: 90,
};
const magro = buildOrderPdfModel({ order: osMagra, settings: {} });

// --- OS de parceira, com desconto de mão de obra ----------------------------
const daParceira = buildOrderPdfModel({
  order: { ...os, partnerName: "GONZAGA MOTOS", partnerId: "PAR-1", partnerOrderId: "1684" },
  client: cliente, motorcycle: moto, settings, laborDiscountPercent: 15,
});

const casos: Array<[string, unknown, unknown]> = [
  // ---------------------------------------------------------------- cabeçalho
  ["o papel traz o número da OS", modelo.title, "ORDEM DE SERVIÇO Nº OS-001650"],
  ["e o nome da oficina", modelo.workshop.name, "PICA PAU MOTOS"],
  ["com CNPJ, telefones e endereço", modelo.workshop.lines.length, 3],
  ["os dois telefones saem na mesma linha", modelo.workshop.lines[1], "(34) 3333-3333 · (34) 99999-0000"],
  ["a logomarca entra quando a oficina tem uma", modelo.workshop.logo.startsWith("data:image"), true],
  ["e fica de fora se a oficina desligou a logo no A4", buildOrderPdfModel({ order: os, settings: { ...settings, logoOnA4: false } }).workshop.logo, ""],
  ["oficina sem cadastro não sai com o topo em branco", magro.workshop.name, "Oficina"],
  ["e sem linha de contato nenhuma", magro.workshop.lines.length, 0],

  ["a data de abertura aparece", valorDe(modelo.headline, "Data de abertura"), "18/08/2026, 09:15"],
  ["a situação aparece", valorDe(modelo.headline, "Situação"), "Em serviço"],
  // OS aberta não tem fechamento: campo vazio não vira linha em branco.
  ["OS aberta não mostra data de fechamento", modelo.headline.some((campo) => campo.label === "Data de fechamento"), false],
  ["OS encerrada mostra", valorDe(buildOrderPdfModel({ order: { ...os, closed: true, closedAt: "20/08/2026" }, settings }).headline, "Data de fechamento"), "20/08/2026"],
  ["e diz que está encerrada", valorDe(buildOrderPdfModel({ order: { ...os, closed: true, closedAt: "20/08/2026" }, settings }).headline, "Situação"), "Encerrada e entregue"],
  ["o número da OS do parceiro entra com o nome dele", valorDe(daParceira.headline, "OS GONZAGA MOTOS"), "1684"],
  ["OS sem parceiro não mostra esse campo", modelo.headline.some((campo) => campo.label.startsWith("OS ")), false],

  // ------------------------------------------------------------------ cliente
  ["o cliente sai do cadastro", valorDe(modelo.customer, "Nome"), "MARIA SOUZA"],
  ["com telefone", valorDe(modelo.customer, "Telefone"), "(34) 98888-1111"],
  ["com CPF", valorDe(modelo.customer, "CPF / CNPJ"), "123.456.789-00"],
  ["com endereço", valorDe(modelo.customer, "Endereço"), "RUA DAS FLORES, 45"],
  // Campo que não existe no cadastro não vira linha vazia no papel.
  ["cliente sem cadastro mostra só o que existe", rotulos(buildOrderPdfModel({ order: os, settings }).customer), "Nome"],
  ["OS sem cliente nenhum não inventa bloco", magro.customer.length, 0],
  ["na OS de parceira quem responde é a empresa", valorDe(daParceira.customer, "Nome"), "GONZAGA MOTOS"],

  // --------------------------------------------------------------- motocicleta
  ["a marca sai do cadastro da moto", valorDe(modelo.motorcycle, "Marca"), "HONDA"],
  ["o modelo também", valorDe(modelo.motorcycle, "Modelo"), "CG 160 TITAN"],
  ["o ano", valorDe(modelo.motorcycle, "Ano/Modelo"), "2017/2018"],
  ["a placa", valorDe(modelo.motorcycle, "Placa"), "QNM-8J02"],
  ["a cor", valorDe(modelo.motorcycle, "Cor"), "VERMELHO"],
  ["o chassi", valorDe(modelo.motorcycle, "Chassi"), "9C2KC1670HR000000"],
  ["a quilometragem sai com o ponto do milhar", valorDe(modelo.motorcycle, "Quilometragem"), "32.450 km"],
  ["o combustível da entrada", valorDe(modelo.motorcycle, "Combustível na entrada"), "1/2"],
  // Moto não cadastrada: o modelo escrito na OS ainda vale.
  ["sem moto cadastrada, o modelo vem da OS", valorDe(buildOrderPdfModel({ order: os, settings }).motorcycle, "Modelo"), "CG 160 TITAN"],
  ["e nada de marca inventada", buildOrderPdfModel({ order: os, settings }).motorcycle.some((campo) => campo.label === "Marca"), false],
  ["OS sem placa não mostra placa em branco", magro.motorcycle.some((campo) => campo.label === "Placa"), false],
  ["quilometragem ausente não vira '0 km'", mileageText({ mileage: "" }), ""],
  ["quilometragem do cadastro serve quando a OS não tem", mileageText({ mileage: "" }, moto), "32.450 km"],

  // ------------------------------------------------------------------ tabelas
  ["serviços e peças em tabelas separadas", modelo.tables.map((tabela) => tabela.title).join(" | "), "Serviços e mão de obra | Peças e produtos"],
  ["a tabela de serviços traz as duas linhas", modelo.tables[0].rows.length, 2],
  ["a de peças também", modelo.tables[1].rows.length, 2],
  ["o serviço aparece pelo nome", modelo.tables[0].rows[0].description, "TROCA DE RETENTOR DA BENGALA"],
  // `price` é o TOTAL da linha; o cliente quer conferir o unitário.
  ["a peça com 2 unidades mostra o unitário", modelo.tables[1].rows[0].unit, "R$ 35,00"],
  ["e o total da linha", modelo.tables[1].rows[0].total, "R$ 70,00"],
  ["a quantidade sai inteira", modelo.tables[1].rows[0].quantity, "2"],
  ["serviço sem quantidade conta como um", modelo.tables[0].rows[0].quantity, "1"],
  ["o unitário do serviço é o próprio valor", modelo.tables[0].rows[0].unit, "R$ 80,00"],
  ["o unitário sai da divisão do total pela quantidade", unitPrice({ id: "x", type: "Peça", name: "x", price: 70, quantity: 2 }), 35],
  ["quantidade fracionada mantém as casas", buildOrderPdfModel({ order: { ...os, items: [{ id: "P", type: "Peça", name: "ÓLEO", price: 45, quantity: 0.5 }] }, settings }).tables[0].rows[0].quantity, "0,5"],
  ["OS sem itens não gera tabela vazia", magro.tables.length, 0],
  ["item sem nome não sai em branco no papel", buildOrderPdfModel({ order: { ...os, items: [{ id: "P", type: "Peça", name: "", price: 10 }] }, settings }).tables[0].rows[0].description, "Item sem descrição"],

  // ------------------------------------------------------------------ dinheiro
  /*
    O total do PDF é o total da OS. Não há segunda conta: sai de `partnerTotals`,
    a mesma função que a tela usa. Se um dia alguém mexer na regra, este caso
    acompanha — e se criarem uma conta paralela, ele reprova.
  */
  ["o total do papel é o total da tela", modelo.grandTotal.value, modelo.grandTotal.value === `R$ ${totaisDaTela.total.toFixed(2).replace(".", ",")}` ? modelo.grandTotal.value : `R$ ${totaisDaTela.total.toFixed(2).replace(".", ",")}`],
  ["e vale 315", modelo.grandTotal.value, "R$ 315,00"],
  ["o rótulo do total é o que o cliente procura", modelo.grandTotal.label, "TOTAL DA ORDEM DE SERVIÇO"],
  ["o total de peças bate", valorDe(modelo.totals, "Total de peças"), "R$ 115,00"],
  ["o total de serviços bate", valorDe(modelo.totals, "Total de serviços e mão de obra"), "R$ 200,00"],
  ["sem desconto, não existe linha de desconto", modelo.totals.some((campo) => campo.label === "Desconto"), false],
  ["com desconto de parceira, ele aparece negativo", valorDe(daParceira.totals, "Desconto"), "- R$ 30,00"],
  ["e o total já vem descontado", daParceira.grandTotal.value, "R$ 285,00"],
  ["o total da parceira bate com a regra da tela", daParceira.grandTotal.value, `R$ ${partnerTotals(os.items!, 15).total.toFixed(2).replace(".", ",")}`],
  // OS antiga, de antes de o sistema detalhar item, guarda só o total.
  ["OS antiga sem itens usa o total gravado", magro.grandTotal.value, "R$ 90,00"],
  ["e não mostra somas parciais zeradas", magro.totals.length, 0],

  // --------------------------------------------------------- textos e omissões
  ["o problema relatado entra", modelo.texts[0].title, "Problema relatado pelo cliente"],
  ["o diagnóstico entra", modelo.texts[1].title, "Diagnóstico e serviço executado"],
  ["as observações entram", modelo.texts[2].title, "Observações"],
  ["a garantia configurada vira texto", modelo.texts[3].text, "Garantia de 90 dias sobre os serviços executados."],
  ["campo de texto vazio não vira bloco em branco", magro.texts.length, 0],
  ["OS sem diagnóstico pula o bloco", buildOrderPdfModel({ order: { ...os, solution: "" }, settings }).texts.some((bloco) => bloco.title.startsWith("Diagnóstico")), false],

  /*
    O CLIENTE NÃO VÊ NÚMERO INTERNO.

    O custo de aquisição está nos itens desta OS (41 e 26) e a margem sai deles.
    A busca é no documento INTEIRO, serializado: se algum campo novo passar a
    carregar custo sem querer, este caso reprova.
  */
  ["o custo das peças não vai para o papel", custoEmDinheiro.some((valor) => documentoInteiro.includes(valor)), false],
  ["a palavra custo não aparece", /\bcusto/i.test(documentoInteiro), false],
  ["nem margem", /\bmargem|\bmarkup/i.test(documentoInteiro), false],
  ["nem lucro", /\blucro/i.test(documentoInteiro), false],
  ["nem comissão", /\bcomiss/i.test(documentoInteiro), false],
  // A trava estrutural: o modelo não pode sequer CARREGAR o campo de custo,
  // nem escondido. Se um campo novo trouxer o item inteiro, isto reprova.
  ["o modelo não carrega o campo de custo", JSON.stringify(modelo).includes('"cost"'), false],
  ["nem o id do produto, que é interno", JSON.stringify(modelo).includes('"productId"'), false],
  ["e o preço de venda continua lá", documentoInteiro.includes("70,00"), true],

  // --------------------------------------------------------- nome do arquivo
  ["o arquivo leva número e placa", orderPdfFileName(os), "OS-001650-QNM8J02.pdf"],
  ["OS sem placa ainda gera nome", orderPdfFileName({ id: "OS-9", plate: "" }), "OS-9.pdf"],
  ["nada de caractere que quebre no celular", /^[A-Za-z0-9._-]+\.pdf$/.test(orderPdfFileName({ id: "OS/1 º", plate: "ABC 1D23" })), true],

  // Assinatura: a oficina NÃO quer campo de assinatura neste documento.
  ["o papel não tem campo de assinatura", /assinatura/i.test(documentoInteiro), false],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nA OS em A4 bate com a OS do sistema." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

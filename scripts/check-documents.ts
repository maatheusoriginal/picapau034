/**
 * Confere os documentos que saem do sistema: OS impressa, cupom e mensagem de
 * WhatsApp.
 *
 * Num documento impresso, um placeholder não substituído ou um nome com "&"
 * quebrando o HTML só aparece no papel, na frente do cliente. Por isso a
 * montagem é conferida aqui.
 *
 * Rode com: npm run check:documents
 */
import {
  buildOrderDocument,
  buildOrderWhatsappMessage,
  buildSaleDocument,
  escapeHtml,
  fillTemplate,
  orderCopyLabels,
  whatsappNumber,
  whatsappUrl,
} from "../src/documents";
import type { OrderRecord, SaleRecord, SettingsConfig } from "../src/types";
import { logoWidthMm, safeLogoDataUrl, MAX_LOGO_DATA_LENGTH } from "../src/logo";

const settings: Partial<SettingsConfig> = {
  workshopName: "Pica Pau Motos",
  cnpj: "12.345.678/0001-90",
  phone: "(34) 3333-3333",
  address: "Av. Rondon Pacheco, 1200",
  printFormat: "Cupom 80mm",
  printThreeCopies: true,
  defaultWarrantyDays: 90,
  defaultOsNotes: "Peças elétricas com garantia do fabricante.",
  defaultWhatsappMessage: "Olá {cliente}! Sua moto {moto} (Placa {placa}) está pronta. Total: {total}.",
};

const order: OrderRecord = {
  id: "OS-0007", customer: 'Zé "Fera" & Cia', bike: "CG 160", plate: "ABC-1234",
  mechanic: "João", mechanicIds: ["m1"], time: "12/03 14:20", status: "Entrega", tone: "green",
  total: 250, problem: "Barulho no motor",
  items: [{ id: "PRD-1", type: "Peça", name: "Óleo 20W50", price: 60, quantity: 2 }, { id: "L1", type: "Mão de obra", name: "Troca de óleo", price: 130 }],
};

const sale: SaleRecord = {
  id: "VEN-0003", origin: "PDV", total: 90, paymentMethod: "PIX", date: "12/03/2026",
  soldAt: new Date().toISOString(),
  items: [{ id: "PRD-2", type: "Peça", name: "Pastilha", price: 90, quantity: 1 }],
};

const osDoc = buildOrderDocument({ order, settings, mechanics: "João + Ana" });
const saleDoc = buildSaleDocument(sale, settings);
const saleComDesconto = buildSaleDocument({ ...sale, subtotal: 100, discount: 10, total: 90 }, settings);
const saleDividida = buildSaleDocument({ ...sale, total: 150, paymentMethod: "PIX",
  payments: [{ method: "PIX", amount: 100 }, { method: "Dinheiro", amount: 50 }] }, settings);
// Venda com quantidade, atendente e hora: é o cupom do balcão de verdade.
const saleDoBalcao = buildSaleDocument({
  ...sale, total: 118, operatorName: "RAYANE", soldAt: "2026-03-12T17:32:00.000Z",
  items: [
    { id: "PRD-2", type: "Peça", name: "Pastilha", price: 118, quantity: 2 },
  ],
}, settings);
const saleParcelada = buildSaleDocument({ ...sale, total: 300, installments: 3, paymentMethod: "Crédito" }, settings);
// Venda antiga, gravada antes de `soldAt` existir: não pode virar "Invalid Date".
const saleAntiga = buildSaleDocument({ ...sale, soldAt: "" } as never, settings);
const uma = buildOrderDocument({ order, settings: { ...settings, printThreeCopies: false }, mechanics: "" });
const a4 = buildOrderDocument({ order, settings: { ...settings, printFormat: "A4" }, mechanics: "" });
const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY4QAAAAASUVORK5CYII=";
const logoSettings = { ...settings, logoDataUrl: logo, logoWidthMm: 56 };
const logoOs = buildOrderDocument({ order, settings: logoSettings, mechanics: "João" });
const logo58 = buildSaleDocument(sale, { ...logoSettings, printFormat: "Cupom 58mm" });

const casos: Array<[string, unknown, unknown]> = [
  ["logomarca aparece em cada uma das três vias da OS", (logoOs.match(/<img class="print-logo"/g) || []).length, 3],
  ["cupom inclui a imagem embutida", buildSaleDocument(sale, logoSettings).includes(`src="${logo}"`), true],
  ["comprovante A4 também inclui a logomarca", buildSaleDocument(sale, { ...logoSettings, printFormat: "A4" }).includes(`src="${logo}"`), true],
  ["sem imagem não cria imagem quebrada", saleDoc.includes('<img class="print-logo"'), false],
  ["remover a logomarca mantém os dados da oficina", buildSaleDocument(sale, { ...logoSettings, logoDataUrl: "" }).includes("Pica Pau Motos"), true],
  ["desativar nos cupons omite a imagem", buildSaleDocument(sale, { ...logoSettings, logoOnThermal: false }).includes('<img class="print-logo"'), false],
  ["desativar nos cupons preserva a imagem no A4", buildSaleDocument(sale, { ...logoSettings, logoOnThermal: false, printFormat: "A4" }).includes('<img class="print-logo"'), true],
  ["desativar no A4 omite a imagem no A4", buildSaleDocument(sale, { ...logoSettings, logoOnA4: false, printFormat: "A4" }).includes('<img class="print-logo"'), false],
  ["a logo respeita o papel de 58mm", logo58.includes("max-width:50mm"), true],
  // Antes esta conferência lia o `size` do @page — que o Chrome descartava por
  // ser inválido. Ou seja, ela aprovava um valor que a impressora nunca via. A
  // largura que vale é a do corpo do documento: o papel menos as duas margens
  // de 4mm.
  ["papel estreito não imprime como 80mm", logo58.includes("body { width: 50mm"), true],
  ["a imagem externa não gera requisição no cupom", buildSaleDocument(sale, { ...settings, logoDataUrl: "https://example.invalid/logo.png" }).includes('<img class="print-logo"'), false],
  ["SVG ativo não entra na impressão", safeLogoDataUrl("data:image/svg+xml;base64,PHN2Zz4="), ""],
  ["atributos injetados não entram na imagem", safeLogoDataUrl(`${logo}\" onerror=\"alert(1)`), ""],
  ["imagem excessiva não ultrapassa o limite de armazenamento", safeLogoDataUrl(`data:image/png;base64,${"A".repeat(MAX_LOGO_DATA_LENGTH)}`), ""],
  ["tamanho corrompido volta ao padrão", logoWidthMm("oops"), 44],
  // Pagamento dividido no cupom
  ["cupom dividido mostra as duas formas", saleDividida.includes("PIX") && saleDividida.includes("Dinheiro"), true],
  ["com o valor de cada parte", saleDividida.includes((100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })), true],
  ["e não imprime a linha genérica de pagamento", saleDividida.includes("<span class=\"label\">Pagamento</span>"), false],
  ["cupom de pagamento único mantém a linha de sempre", saleDoc.includes("Pagamento"), true],

  // Desconto no cupom
  ["cupom sem desconto não mostra subtotal", saleDoc.includes("Subtotal"), false],
  ["cupom com desconto mostra o subtotal", saleComDesconto.includes("Subtotal"), true],
  ["e mostra o desconto abatido", saleComDesconto.includes("Desconto"), true],
  ["e o total já é o valor com desconto", saleComDesconto.includes((90).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })), true],
  // Marcadores
  ["marcador é substituído", fillTemplate("Olá {cliente}!", { cliente: "Ana" }), "Olá Ana!"],
  ["marcador sem valor não vaza para a mensagem", fillTemplate("Olá {cliente}!", {}), "Olá !"],
  ["marcador repetido é substituído nas duas vezes", fillTemplate("{a}-{a}", { a: "x" }), "x-x"],

  // Escape
  ["aspas e e-comercial viram entidades", escapeHtml('Zé "Fera" & Cia'), "Zé &quot;Fera&quot; &amp; Cia"],
  ["tag no nome não vira HTML", escapeHtml("<script>"), "&lt;script&gt;"],

  // Telefone do WhatsApp
  ["celular local ganha o código do Brasil", whatsappNumber("(34) 99999-9999"), "5534999999999"],
  ["número já com 55 não duplica", whatsappNumber("5534999999999"), "5534999999999"],
  ["número curto demais é descartado", whatsappNumber("1234"), ""],
  ["sem telefone, o link abre sem destinatário", whatsappUrl("", "oi").startsWith("https://wa.me/?text="), true],
  ["com telefone, o link vai direto para a conversa", whatsappUrl("34999999999", "oi"), "https://wa.me/5534999999999?text=oi"],

  // Vias
  ["três vias configuradas geram três rótulos", orderCopyLabels(true).length, 3],
  ["sem três vias, só a do cliente", orderCopyLabels(false).join(""), "Via do cliente"],
  ["o documento sai com as três vias", (osDoc.match(/class="via"/g) || []).length, 3],
  ["desligando três vias, sai uma só", (uma.match(/class="via"/g) || []).length, 1],

  // O corte entre as vias. A guilhotina corta no fim de cada PÁGINA, e a via
  // do cliente é a última: sem quebra nela, sai grudada e alguém rasga na mão.
  ["toda via termina em quebra de página", osDoc.includes("break-after: page"), true],
  ["e no nome antigo da propriedade também", osDoc.includes("page-break-after: always"), true],
  ["a última via não é mais exceção", osDoc.includes(".via:last-child"), false],
  // A mesma quebra pedida do outro lado. Quando o navegador engole a de
  // depois — acontece imprimindo de dentro de uma moldura, que é como o
  // sistema faz — é esta que separa as vias. Sem as duas, três vias curtas
  // cabem juntas numa folha e saem grudadas.
  ["toda via depois da primeira começa em página nova", osDoc.includes(".via + .via { break-before: page"), true],
  ["e no nome antigo da propriedade também", osDoc.includes("page-break-before: always"), true],
  // `size: 80mm auto` mistura comprimento com palavra-chave, o que o CSS não
  // permite: o Chrome descartava a declaração inteira e o cupom saía no papel
  // que a impressora mandasse. Deixar o driver decidir é o certo aqui (só ele
  // sabe o comprimento da bobina), mas escrito de um jeito que funcione.
  ["não sobrou tamanho de papel inválido", /size:\s*\d+mm\s+auto/.test(osDoc), false],
  // A lâmina fica acima da cabeça de impressão: sem a sobra, o corte come a
  // última linha, que é a assinatura do cliente.
  ["cada via reserva o espaço da lâmina", (osDoc.match(/class="feed"/g) || []).length, 3],
  ["o cupom da venda também reserva", (saleDoc.match(/class="feed"/g) || []).length, 1],

  // O tamanho da letra. O balcão reclamou que não dava para ler, e o defeito
  // era de ORDEM: o bloco comum vinha depois do bloco do formato e anulava o
  // tamanho dele, com o mesmo peso de regra.
  ["o corpo do cupom não é mais 11px", osDoc.includes("font-size: 11px"), false],
  ["nada no cupom sai com 9px", osDoc.includes("font-size: 9px"), false],
  ["o bloco comum não redefine tamanho",
    /\.label \{ text-transform: uppercase; letter-spacing/.test(osDoc), true],

  // O que o balcão procura de longe no papel.
  ["cliente, moto e placa saem em destaque", (osDoc.match(/class="fact"/g) || []).length >= 6, true],
  ["a placa sai emoldurada", osDoc.includes('class="plate"'), true],
  // A moto chega da concessionária com a folha DELES: é por aquele número que
  // o mecânico e o parceiro conversam, então ele tem de sair no papel.
  ["o número da OS do parceiro sai no papel",
    buildOrderDocument({ order: { ...order, partnerName: "Gonzaga Motos", partnerOrderId: "001684" },
      settings, mechanics: "João" }).includes("001684"), true],
  ["e diz de quem é esse número",
    buildOrderDocument({ order: { ...order, partnerName: "Gonzaga Motos", partnerOrderId: "001684" },
      settings, mechanics: "João" }).includes("OS Gonzaga Motos"), true],
  ["OS sem parceiro não imprime linha vazia", osDoc.includes("do parceiro"), false],
  ["o cupom da venda destaca o cliente",
    buildSaleDocument({ ...sale, customer: "Rayane Ferreira" }, settings).includes('class="fact"'), true],
  // Venda de balcão em geral não tem cliente: o bloco não pode sair vazio,
  // gastando papel e uma linha em branco no cupom.
  ["venda sem cliente não imprime o bloco vazio", saleDoc.includes('class="facts"'), false],

  // Conteúdo da OS
  ["o número da OS aparece", osDoc.includes("OS-0007"), true],
  ["o nome do cliente é escapado no documento", osDoc.includes("Zé &quot;Fera&quot; &amp; Cia"), true],
  ["o nome cru NÃO aparece", osDoc.includes('Zé "Fera" & Cia'), false],
  // Atenção: toLocaleString separa "R$" do valor com espaço não separável
  // (U+00A0), não com espaço comum. Procurar por "R$ 250,00" digitado à mão
  // não encontra nada.
  ["o total sai formatado em reais", osDoc.includes(`R$\u00A0250,00`), true],
  ["a garantia configurada aparece", osDoc.includes("90 dias"), true],
  ["as observações padrão aparecem", osDoc.includes("garantia do fabricante"), true],
  ["a quantidade da peça aparece", osDoc.includes("2x"), true],

  // Formato
  ["cupom usa a largura do papel de 80mm", osDoc.includes("body { width: 72mm"), true],
  ["A4 usa página A4", a4.includes("size: A4"), true],
  ["A4 não usa a largura do cupom", a4.includes("72mm"), false],

  // Cupom da venda
  ["o cupom traz o número da venda", saleDoc.includes("VEN-0003"), true],

  /*
    O cupom do balcão.

    Com quantidade maior que um só saía o total da linha, e o cliente ficava
    dividindo de cabeça para saber quanto custou a peça — que é justamente a
    conta que ele quer conferir antes de pagar.
  */
  ["com quantidade, o cupom mostra o unitário", saleDoBalcao.includes("2 × R$\u00A059,00"), true],
  ["e continua mostrando o total da linha", saleDoBalcao.includes("R$\u00A0118,00"), true],
  ["quantidade 1 não polui a linha com unitário", saleDoc.includes("class=\"unit\""), false],
  ["o cupom conta os itens", saleDoBalcao.includes("2 itens"), true],
  ["um item só não vira 'itens'", saleDoc.includes("1 item<"), true],
  // A hora separa duas vendas do mesmo cliente no mesmo dia — na troca, na
  // garantia e na conferência do caixa.
  ["o cupom traz a hora da venda", /\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/.test(saleDoBalcao), true],
  ["venda antiga sem hora não vira 'Invalid Date'", saleAntiga.includes("Invalid Date"), false],
  ["e cai na data que ela tem", saleAntiga.includes("12/03/2026"), true],
  ["o cupom diz quem atendeu", saleDoBalcao.includes("RAYANE"), true],
  ["venda sem atendente não imprime linha vazia", saleDoc.includes("Atendente"), false],
  ["o total sai emoldurado, e não perdido no meio das linhas", saleDoc.includes('class="grand-total"'), true],
  ["o parcelamento aparece com o valor da parcela", saleParcelada.includes("3x de R$\u00A0100,00"), true],
  ["venda à vista não fala em parcela", saleDoc.includes("Parcelas"), false],
  ["o cupom pede para guardar, por causa da troca e da garantia", saleDoc.includes("Guarde este cupom"), true],
  ["o cupom avisa que não tem valor fiscal", saleDoc.includes("sem valor fiscal"), true],
  ["o cupom traz a forma de pagamento", saleDoc.includes("PIX"), true],

  // Mensagem de WhatsApp
  ["a mensagem usa o modelo configurado", buildOrderWhatsappMessage(order, settings).startsWith("Olá Zé"), true],
  ["a mensagem inclui a placa", buildOrderWhatsappMessage(order, settings).includes("ABC-1234"), true],
  ["nenhum marcador sobra na mensagem", /\{\w+\}/.test(buildOrderWhatsappMessage(order, settings)), false],
  ["sem modelo configurado ainda sai mensagem", buildOrderWhatsappMessage(order, {}).length > 0, true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nTodos os documentos batem." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

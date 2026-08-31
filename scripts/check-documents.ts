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
const uma = buildOrderDocument({ order, settings: { ...settings, printThreeCopies: false }, mechanics: "" });
const a4 = buildOrderDocument({ order, settings: { ...settings, printFormat: "A4" }, mechanics: "" });

const casos: Array<[string, unknown, unknown]> = [
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
  ["cupom usa largura de 80mm", osDoc.includes("80mm"), true],
  ["A4 usa página A4", a4.includes("size: A4"), true],
  ["A4 não usa a largura do cupom", a4.includes("80mm"), false],

  // Cupom da venda
  ["o cupom traz o número da venda", saleDoc.includes("VEN-0003"), true],
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

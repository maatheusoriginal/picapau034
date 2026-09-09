/**
 * Confere o faturamento por empresa parceira.
 *
 * A oficina atende frotas: a moto entra, a peça sai do estoque e o serviço é
 * feito no dia, mas o dinheiro só vem na fatura do mês seguinte. Tratar isso
 * como venda à vista mentiria duas vezes — diria que entrou dinheiro que não
 * entrou, e o caixa do dia fecharia com quebra.
 *
 * Rode com: npm run check:partner
 */
import { billingDescription, billingReference, isPartnerBilled, motorcycleLabel, nextBillingDate, partnerOf, partnerTotals, receivableForOrder, PARTNER_PAYMENT_METHOD } from "../src/partner";
import { drawerTotal, isCreditPayment, paymentsOf, settledTotal } from "../src/finance";
import type { PartnerConfig, ServiceOrderItem } from "../src/types";

const itens: ServiceOrderItem[] = [
  { id: "L1", type: "Mão de obra", name: "Revisão completa", price: 200 },
  { id: "P1", type: "Peça", name: "Óleo 4T", price: 40, productId: "PRD-001", quantity: 1 },
  { id: "P2", type: "Peça", name: "Filtro", price: 60, productId: "PRD-002", quantity: 1 },
];
const parceiras: PartnerConfig[] = [
  { id: "PART-001", name: "Flash Entregas", phone: "", laborDiscount: 15, billingCycle: "Mensal", active: true },
  { id: "PART-002", name: "Moto Log", phone: "", laborDiscount: 0, billingCycle: "Mensal", active: true },
];
const totais = partnerTotals(itens, 15);
const osFaturada = { payer: "partner" as const, partnerId: "PART-001" };
const osDireta = { payer: "owner" as const, partnerId: "" };

// Uma OS faturada na parceira, do jeito que fica gravada.
const pagamentosDaOs = paymentsOf({ total: 290, paymentMethod: PARTNER_PAYMENT_METHOD });

// As duas OS inteiras, para conferir para quem vai a cobrança no encerramento.
const osDoGonzaga = {
  id: "OS-0007", bike: "Honda CG 160", customer: "MOTOBOY QUE TROUXE",
  clientId: "CLI-MOTOBOY", payer: "partner" as const,
  partnerId: "PAR-1", partnerName: "Gonzaga Motos",
};
const osDoDono = {
  id: "OS-0008", bike: "Yamaha Factor 150", customer: "João",
  clientId: "CLI-9", payer: "owner" as const, partnerId: "", partnerName: "",
};

const casos: Array<[string, unknown, unknown]> = [
  // Quem paga
  ["OS com parceira e pagador parceira é faturada", isPartnerBilled(osFaturada), true],
  ["OS do dono da moto não é faturada", isPartnerBilled(osDireta), false],
  ["parceira sem id não faz OS faturada", isPartnerBilled({ payer: "partner", partnerId: "" }), false],
  ["acha a parceira da OS", partnerOf(osFaturada, parceiras)?.name, "Flash Entregas"],
  ["OS direta não tem parceira", partnerOf(osDireta, parceiras), null],

  // O desconto vale só na mão de obra: peça tem preço fixo, dar desconto nela
  // seria vender abaixo do que a oficina pagou ao fornecedor.
  ["mão de obra somada", totais.labor, 200],
  ["peças somadas", totais.parts, 100],
  ["desconto de 15% só sobre a mão de obra", totais.discount, 30],
  ["total da fatura", totais.total, 270],
  ["parceira sem desconto paga tudo", partnerTotals(itens, 0).total, 300],
  ["desconto de 100% zera a mão de obra mas mantém as peças", partnerTotals(itens, 100).total, 100],
  ["desconto negativo não vira acréscimo", partnerTotals(itens, -20).total, 300],
  ["desconto acima de 100 não inverte a conta", partnerTotals(itens, 250).total, 100],
  ["OS só de peça não recebe desconto nenhum", partnerTotals([itens[1]!, itens[2]!], 15).total, 100],
  ["OS vazia não gera fatura", partnerTotals([], 15).total, 0],
  ["centavos do desconto arredondam em duas casas", partnerTotals([{ id: "L", type: "Mão de obra", name: "x", price: 33.33 }], 15).discount, 5],

  // O vencimento: dia 1 do mês seguinte.
  ["serviço em março vence em 1º de abril", nextBillingDate(new Date(2026, 2, 10)), "01/04/2026"],
  ["serviço no último dia do mês ainda é do mês dele", nextBillingDate(new Date(2026, 1, 28)), "01/03/2026"],
  ["serviço em dezembro vence em janeiro do ano seguinte", nextBillingDate(new Date(2026, 11, 20)), "01/01/2027"],
  ["serviço no dia 1º vence no dia 1º do mês seguinte", nextBillingDate(new Date(2026, 4, 1)), "01/06/2026"],
  ["a competência é o mês do serviço", billingReference(new Date(2026, 2, 10)), "03/2026"],
  ["a descrição diz a competência e a OS", billingDescription("OS-0007", "Honda CG 160", new Date(2026, 2, 10)), "Fatura 03/2026 · Ordem de serviço OS-0007 · Honda CG 160"],

  // O dinheiro NÃO entra no dia: é a parte que evita o caixa fechar com quebra.
  ["faturado na parceira conta como a prazo", isCreditPayment(PARTNER_PAYMENT_METHOD), true],

  /*
    "Quando eu clico em receber, a conta já vai para o Gonzaga?"

    Vai — e é este bloco que responde. O caminho inteiro: a OS nasce com
    `payer: "partner"` ao escolher a parceira, o encerramento já abre com
    "Faturado no parceiro", essa forma conta como A PRAZO (acima), e por isso
    o encerramento gera conta a receber em vez de dinheiro no caixa. A conta
    sai no nome da EMPRESA e presa ao id DELA — não do motoboy que trouxe a
    moto — e vence no dia 1º do mês seguinte.
  */
  ["a cobrança da parceira sai no nome da empresa", receivableForOrder(osDoGonzaga, {}, new Date(2026, 2, 10)).person, "Gonzaga Motos"],
  ["e presa ao id da empresa, não ao do motoboy", receivableForOrder(osDoGonzaga, { clientId: "CLI-MOTOBOY" }, new Date(2026, 2, 10)).personId, "PAR-1"],
  ["com vencimento na fatura do mês seguinte", receivableForOrder(osDoGonzaga, {}, new Date(2026, 2, 10)).dueDate, "01/04/2026"],
  ["e separada do resto em Contas a receber", receivableForOrder(osDoGonzaga, {}, new Date(2026, 2, 10)).origin, "Fatura de parceiro"],
  ["a descrição diz de qual competência é", receivableForOrder(osDoGonzaga, {}, new Date(2026, 2, 10)).description.startsWith("Fatura 03/2026"), true],
  ["parceira sem nome gravado ainda gera conta com dono", receivableForOrder({ ...osDoGonzaga, partnerName: "" }, {}, new Date(2026, 2, 10)).person, "Empresa parceira"],

  // A OS comum não pode cair na fatura da parceira por engano.
  ["OS do dono da moto vai no nome dele", receivableForOrder(osDoDono, {}, new Date(2026, 2, 10)).person, "João"],
  ["e sem vencimento imposto", receivableForOrder(osDoDono, {}, new Date(2026, 2, 10)).dueDate, undefined],
  ["e presa ao cliente", receivableForOrder(osDoDono, { clientId: "CLI-9" }, new Date(2026, 2, 10)).personId, "CLI-9"],
  // Cliente identificado só na hora de receber (OS aberta sem cadastro).
  ["nome informado no encerramento vale mais que o da OS", receivableForOrder(osDoDono, { customerName: "  MARIA  " }, new Date(2026, 2, 10)).person, "MARIA"],
  ["pagamento dividido avisa que é só um pedaço", receivableForOrder(osDoDono, { partial: true }, new Date(2026, 2, 10)).description.endsWith("· parte a prazo"), true],
  ["pagamento inteiro a prazo não diz 'parte'", receivableForOrder(osDoDono, {}, new Date(2026, 2, 10)).description.includes("parte a prazo"), false],
  ["não entra na gaveta do caixa", drawerTotal(pagamentosDaOs), 0],
  ["não conta como faturamento recebido", settledTotal(pagamentosDaOs), 0],
  ["dinheiro continua entrando na gaveta", drawerTotal(paymentsOf({ total: 290, paymentMethod: "Dinheiro" })), 290],

  // Escolher a moto
  ["a moto aparece com modelo, placa e dono", motorcycleLabel({ plate: "ABC-1D23", model: "Honda CG 160", ownerName: "Flash Entregas" }), "Honda CG 160 · ABC-1D23 · Flash Entregas"],
  ["moto sem dono não mostra separador solto", motorcycleLabel({ plate: "ABC-1D23", model: "Honda CG 160" }), "Honda CG 160 · ABC-1D23"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO faturamento da parceira fecha." : `\n${falhas} conta(s) erradas.`);
process.exit(falhas === 0 ? 0 : 1);

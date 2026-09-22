import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppDialog } from "../../app/page";
import { AttendanceReview, type AttendanceSummaryProps } from "../../src/components/AttendanceSummary";

globalThis.fetch = async () => { throw new Error("A verificação de renderização não deve acessar a rede."); };
const noop = () => {};
const props: React.ComponentProps<typeof AppDialog> = { dialog: "osChoice", canOperate: true, canCreateCategory: true, canCreatePartBrand: true, canCheckoutOrders: true, canSeeFinance: true, step: 1, setStep: noop, close: noop, finish: noop, changeDialog: noop, onAddExpense: noop, users: [], partners: [], quickServices: [], categories: [], suppliers: [], paymentMachines: [], paymentMethods: [], products: [], clients: [], motorcycles: [], orders: [], expenses: [], notify: noop, selectedRecordId: "", osPrefix: "OS", canManageCustomers: true, cart: [], setCart: noop, discount: 0, setDiscount: noop, sales: [], stockEntries: [], stockAdjustments: [], accounts: [], cashSessions: [], movements: [], lists: null, settings: null, currentUser: null };
for (const [dialog, step, text] of [["osChoice",1,"Como vamos atender?"],["os",1,"Ir para serviço"],["os",2,"Conferir atendimento"],["os",3,"Abrir ordem de serviço"],["quick",1,"Confirmar"],["osPast",1,"Lançar OS que já aconteceu"]] as const) {
  const html = renderToStaticMarkup(<AppDialog {...props} dialog={dialog} step={step}/>);
  assert.ok(html.includes(text), `${dialog}/${step}: conteúdo esperado`);
  assert.ok(html.includes('role="dialog"') && html.includes('aria-modal="true"'));
  if (dialog === "os") {
    assert.equal((html.match(/<div hidden="" class="intake-step-panel"/g) || []).length, 2, "Somente uma etapa exposta");
    assert.ok(html.includes('aria-current="step"'));
    assert.ok(html.includes('class="dialog-footer intake-footer"'));
  }
  console.log(`OK renderização ${dialog} · etapa ${step}`);
}
/*
  O histórico dentro da OS, renderizado de verdade.

  A linha do tempo é o tipo de bloco que compila, passa no typecheck e não
  aparece na tela — foi o que já aconteceu aqui com painel recolhido e camada
  por cima. Então ele é renderizado e lido, e não só conferido em função pura.
*/
const osComHistorico = {
  id: "OS-0007", customer: "ANA COSTA", bike: "HONDA CG 160", plate: "ABC-1D23",
  mechanic: "RONALDO", mechanicIds: [], time: "09/09/2026, 08:15", status: "Em serviço",
  tone: "amber", total: 165, delivery: "11/09/2026", priority: "Normal", origin: "Cliente direto",
  events: [
    { at: "2026-09-09T11:15:00.000Z", what: "Ordem de serviço aberta · 09/09/2026, 08:15", who: "RAYANE" },
    { at: "2026-09-09T13:40:00.000Z", what: "Situação: Em avaliação → Em serviço", who: "RONALDO" },
    { at: "2026-09-09T14:05:00.000Z", what: "Incluído: RETENTOR", who: "RONALDO" },
  ],
};
const osAntigaSemHistorico = { ...osComHistorico, id: "OS-0001", events: undefined };

for (const [ordem, esperado] of [
  [osComHistorico, ["Histórico desta OS", "Situação: Em avaliação → Em serviço", "Incluído: RETENTOR", "RAYANE", "3 registro(s)"]],
  // OS de antes deste histórico não pode aparecer vazia.
  [osAntigaSemHistorico, ["Histórico desta OS", "Ordem de serviço aberta · 09/09/2026, 08:15", "1 registro(s)"]],
] as const) {
  const marcado = renderToStaticMarkup(<AppDialog {...props} dialog="order" orders={[ordem as never]} selectedRecordId={ordem.id}/>);
  assert.ok(marcado.includes('class="order-section order-timeline"'), `${ordem.id}: o bloco do histórico precisa existir na tela`);
  for (const texto of esperado) assert.ok(marcado.includes(texto), `${ordem.id}: falta "${texto}"`);
  console.log(`OK histórico da OS na tela · ${ordem.id}`);
}

/*
  Os campos de cliente e moto dentro da OS, renderizados de verdade.

  A moto chega no guincho e a OS abre sem nome; o nome aparece por telefone uma
  hora depois. Se este bloco não estiver NA TELA, não adianta o resto funcionar
  — e bloco que compila e não aparece já aconteceu aqui antes.
*/
const osSemNome = {
  id: "OS-0042", customer: "Cliente não identificado", customerPending: true,
  bike: "", plate: "", mechanic: "", mechanicIds: [], time: "16/09/2026, 09:00",
  status: "Em avaliação", tone: "amber", total: 0,
};
const marcadoSemNome = renderToStaticMarkup(<AppDialog {...props} dialog="order" orders={[osSemNome as never]} selectedRecordId="OS-0042"/>);
for (const texto of ["Cliente e motocicleta", "Nome de quem responde pela moto", "Problema relatado", "aberta sem identificar o cliente"]) {
  assert.ok(marcadoSemNome.includes(texto), `edição da OS: falta "${texto}"`);
}
// OS com nome não fica com o aviso de "sem identificar" na tela.
const comNome = renderToStaticMarkup(<AppDialog {...props} dialog="order" orders={[{ ...osSemNome, id: "OS-0043", customer: "MARIA SOUZA", customerPending: false } as never]} selectedRecordId="OS-0043"/>);
assert.ok(comNome.includes("Cliente e motocicleta"), "a OS identificada também edita cliente e moto");
assert.ok(!comNome.includes("aberta sem identificar o cliente"), "OS com nome não pode mostrar o aviso de cliente pendente");
console.log("OK cliente e moto editáveis dentro da OS");

const summary: AttendanceSummaryProps = { customer: "ANA COSTA", phone: "(34) 99999-1234", bike: "HONDA CG 160", plate: "ABC-1D23", payer: "Parceira · fatura mensal", mechanics: "JOSÉ", problem: "RUÍDO AO FREAR", delivery: "12/09/2026", priority: "Urgente", mileage: "38420", fuel: "1/2", mileageChecked: true, partnerOrder: "1684", items: [{ id: "LAB-1", type: "Mão de obra", name: "REVISÃO", price: 100, quantity: 1 }], parts: 0, labor: 100, discount: 10, total: 90, pendingCustomer: true, reserveNow: false, onEdit: noop };
const html = renderToStaticMarkup(<AttendanceReview {...summary}/>);
for (const text of ["ANA COSTA", "ABC-1D23", "RUÍDO AO FREAR", "12/09/2026", "1684", "90,00", "início do serviço", "antes de encerrar"]) assert.ok(html.includes(text), text);
console.log("OK conferência com dados, itens, desconto e regras de estoque");

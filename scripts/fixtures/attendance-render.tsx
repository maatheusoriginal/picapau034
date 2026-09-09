import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppDialog } from "../../app/page";
import { AttendanceReview, type AttendanceSummaryProps } from "../../src/components/AttendanceSummary";

globalThis.fetch = async () => { throw new Error("A verificação de renderização não deve acessar a rede."); };
const noop = () => {};
const props: React.ComponentProps<typeof AppDialog> = { dialog: "osChoice", canOperate: true, canCreateCategory: true, canCreatePartBrand: true, canCheckoutOrders: true, step: 1, setStep: noop, close: noop, finish: noop, changeDialog: noop, onAddExpense: noop, users: [], partners: [], quickServices: [], categories: [], suppliers: [], paymentMachines: [], paymentMethods: [], products: [], clients: [], motorcycles: [], orders: [], expenses: [], notify: noop, selectedRecordId: "", osPrefix: "OS", canManageCustomers: true, cart: [], setCart: noop, discount: 0, setDiscount: noop, sales: [], stockEntries: [], stockAdjustments: [], accounts: [], cashSessions: [], movements: [], lists: null, settings: null, currentUser: null };
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
const summary: AttendanceSummaryProps = { customer: "ANA COSTA", phone: "(34) 99999-1234", bike: "HONDA CG 160", plate: "ABC-1D23", payer: "Parceira · fatura mensal", mechanics: "JOSÉ", problem: "RUÍDO AO FREAR", delivery: "12/09/2026", priority: "Urgente", mileage: "38420", fuel: "1/2", mileageChecked: true, partnerOrder: "1684", items: [{ id: "LAB-1", type: "Mão de obra", name: "REVISÃO", price: 100, quantity: 1 }], parts: 0, labor: 100, discount: 10, total: 90, pendingCustomer: true, reserveNow: false, onEdit: noop };
const html = renderToStaticMarkup(<AttendanceReview {...summary}/>);
for (const text of ["ANA COSTA", "ABC-1D23", "RUÍDO AO FREAR", "12/09/2026", "1684", "90,00", "início do serviço", "antes de encerrar"]) assert.ok(html.includes(text), text);
console.log("OK conferência com dados, itens, desconto e regras de estoque");

import assert from "node:assert/strict";
import { attendanceIdentityIssue, attendanceItemsIssue, type AttendanceIdentity } from "../src/attendance";
import { withItemQuantity, itemUnitPrice } from "../src/order-items";
import { buildSaleDocument } from "../src/documents";
import type { ClientRecord, MotorcycleRecord, ProductRecord, SaleRecord, ServiceOrderItem } from "../src/types";

const customer = { id: "CLI-001", name: "ANA COSTA", phone: "(34) 99999-1234", active: true } as ClientRecord;
const motorcycle = { id: "MOTO-ABC1D23", plate: "ABC-1D23", ownerId: customer.id, brand: "Honda", model: "CG 160", active: true } as MotorcycleRecord;
const base: AttendanceIdentity = { origin: "direct", customer: null, newCustomer: false, skipCustomer: false, name: "", phone: "", plate: "", model: "" };
const check = (name: string, test: () => void) => { test(); console.log(`OK ${name}`); };
check("Texto na busca não se transforma silenciosamente em cliente", () => {
  assert.equal(attendanceIdentityIssue({ ...base, name: "ANA", phone: "ANA", plate: "ABC-1D23" })?.field, "intake-search");
});
check("Cliente existente e sua moto permitem continuar", () => {
  assert.equal(attendanceIdentityIssue({ ...base, customer, motorcycle, plate: motorcycle.plate }), null);
});
check("Cadastro novo pede nome e valida WhatsApp opcional", () => {
  assert.equal(attendanceIdentityIssue({ ...base, newCustomer: true, plate: "ABC-1234" })?.field, "intake-name");
  assert.equal(attendanceIdentityIssue({ ...base, newCustomer: true, name: "ANA", phone: "1234", plate: "ABC-1234" })?.field, "intake-phone");
  for (const phone of ["", "(34) 3232-1234", "(34) 99999-1234"]) assert.equal(attendanceIdentityIssue({ ...base, newCustomer: true, name: "ANA", phone, plate: "ABC-1234" }), null);
});
check("Recepção sem cliente exige placa válida", () => {
  assert.equal(attendanceIdentityIssue({ ...base, skipCustomer: true, model: "CG" })?.field, "intake-plate");
  for (const plate of ["ABC-123", "AB1-2345", "1234567"]) assert.equal(attendanceIdentityIssue({ ...base, skipCustomer: true, plate })?.field, "intake-plate");
  assert.equal(attendanceIdentityIssue({ ...base, skipCustomer: true, plate: "ABC-1D23" }), null);
});
check("Empresa e placa são necessárias no atendimento da frota", () => {
  assert.equal(attendanceIdentityIssue({ ...base, origin: "partner", plate: "ABC-1234" })?.field, "intake-partner");
  assert.equal(attendanceIdentityIssue({ ...base, origin: "partner", partnerId: "PAR-1" })?.field, "intake-plate");
  assert.equal(attendanceIdentityIssue({ ...base, origin: "partner", partnerId: "PAR-1", plate: "ABC-1234" }), null);
});
check("Marca sozinha não identifica a moto; modelo sem placa continua permitido para cliente identificado", () => {
  assert.equal(attendanceIdentityIssue({ ...base, customer })?.field, "intake-plate");
  assert.equal(attendanceIdentityIssue({ ...base, customer, model: "CG 160" }), null);
});
const product = { id: "PRD-01", name: "ÓLEO", active: true, stock: 3, price: "R$ 25,90", cost: "R$ 15,00" } as ProductRecord;
const item: ServiceOrderItem = { id: "OIL", productId: product.id, name: product.name, type: "Peça", quantity: 1, price: 25.9, cost: 15 };
check("Quantidades e preços fracionados preservam os totais e custos", () => {
  const line = withItemQuantity(item, 2.5);
  assert.equal(line.price, 64.75); assert.equal(line.cost, 37.5); assert.equal(itemUnitPrice(line), 25.9);
});
check("Estoque considera todas as linhas da mesma peça", () => {
  assert.match(attendanceItemsIssue([withItemQuantity(item, 2), withItemQuantity(item, 2)], [product], true), /incluiu 4/);
  assert.equal(attendanceItemsIssue([withItemQuantity(item, 4)], [product], false), "");
  assert.equal(attendanceItemsIssue([withItemQuantity(item, 3)], [product], true), "");
});
check("Peça desativada e valores inválidos não chegam à confirmação", () => {
  assert.match(attendanceItemsIssue([item], [{ ...product, active: false }], false), /desativada/);
  assert.match(attendanceItemsIssue([{ ...item, quantity: 0 }], [product], false), /quantidade/);
  assert.match(attendanceItemsIssue([{ ...item, price: NaN }], [product], false), /valor/);
  assert.match(attendanceItemsIssue([{ ...item, price: -1 }], [product], false), /valor/);
  assert.equal(attendanceItemsIssue([], [], true), "");
});
check("Cliente e moto do serviço rápido aparecem no comprovante com escaping", () => {
  const sale: SaleRecord = { id: "VEN-0001", origin: "Serviço rápido", items: [item], total: 25.9, customer: "ANA <script>teste</script>", vehicle: "CG 160 · ABC-1D23", date: "09/09/2026", soldAt: "2026-09-09T12:00:00Z", paymentMethod: "PIX" };
  const html = buildSaleDocument(sale, null);
  assert.ok(html.includes("CG 160 · ABC-1D23")); assert.ok(html.includes("ANA &lt;script&gt;teste&lt;/script&gt;")); assert.ok(!html.includes("<script>teste</script>"));
});
console.log("10 cenários do novo atendimento aprovados.");

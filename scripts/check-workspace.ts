import assert from "node:assert/strict";
import { canVisit, destinationForPath, routePaths, workspacePermissions, calendarDay, todayKey, orderMatchesFilter, orderAttention, sortOrders, searchProducts, lowStock, matchesSearch } from "../src/workspace";
import { itemUnitPrice, withItemQuantity } from "../src/order-items";
import { stockDeltas } from "../src/inventory";
import { partnerTotals } from "../src/partner";
import type { OrderRecord, ProductRecord, ServiceOrderItem } from "../src/types";

let count = 0;
const check = (label: string, actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected, label); count += 1; };
const order = (patch: Partial<OrderRecord>): OrderRecord => ({ id: "OS-1", customer: "JOÃO", plate: "ABC-1D23", bike: "CG 150", mechanic: "", mechanicIds: [], time: "09:00", status: "Recepção", tone: "blue", ...patch });
const product = (patch: Partial<ProductRecord>): ProductRecord => ({ id: "p1", code: "PRD-001", name: "ÓLEO 20W50", price: "R$ 30,00", cost: "R$ 15,00", category: "Óleos", stock: 3, minimum: 2, status: "Normal", ...patch });

check("settings view can remain in settings", canVisit("Configurações", "Balcão", ["settings.view"]), true);
check("cashier cannot open user management", canVisit("Usuários e acessos", "Balcão", ["settings.manage"]), false);
check("mechanic cannot open financial report", canVisit("Relatórios", "Mecânico", ["orders.view"]), false);
check("unknown route is never implicitly authorized", canVisit("Tela inexistente", "Super Admin", []), false);
check("trailing slash", destinationForPath("/oficina/"), "Ordens de serviço");
for (const [name, path] of Object.entries(routePaths)) check(`route ${name}`, destinationForPath(path), name);
/*
  Tela sem ENDEREÇO é tela inalcançável.

  `canVisit` começa recusando destino que não está em `routePaths`, e
  `navigateTo` desiste em silêncio quando ela recusa. Então acrescentar uma tela
  em três lugares (menu, roteador e permissão) e esquecer o QUARTO — o endereço
  — produz exatamente isto: o item aparece no menu, o clique não dá erro, e a
  tela nunca abre. Aconteceu com o "Histórico geral", e só o navegador pegou.

  Estas duas linhas cobram que endereço e permissão andem juntos, para o erro
  morrer aqui, em meio segundo, em vez de numa rodada de trinta minutos.
*/
for (const nome of Object.keys(workspacePermissions)) {
  check(`tela "${nome}" tem endereço`, Boolean(routePaths[nome]), true);
}
/*
  As telas que NÃO declaram permissão, e por quê.

  `canVisit` devolve `[].some(...)` — falso — para destino sem permissão
  declarada, e antes disso libera o Super Admin. Então ficar de fora desta lista
  é o jeito de dizer "só o Super Admin entra". É intencional para as três
  abaixo, e a lista existe para que a quarta não entre aqui por esquecimento.
*/
const soDoSuperAdmin = ["Usuários e acessos", "Administração"];
for (const nome of Object.keys(routePaths)) {
  // "Visão geral" é a porta de entrada: abre para todo mundo que entrou no
  // sistema, então não tem permissão própria de propósito.
  if (nome === "Visão geral" || soDoSuperAdmin.includes(nome)) continue;
  check(`tela "${nome}" diz quem pode entrar`, Boolean(workspacePermissions[nome]), true);
}
for (const nome of soDoSuperAdmin) {
  check(`"${nome}" continua só do Super Admin`, canVisit(nome, "Balcão", ["settings.manage", "team.manage", "finance.manage"]), false);
  check(`e o Super Admin entra em "${nome}"`, canVisit(nome, "Super Admin", []), true);
}
check("e quem vê valores entra no histórico geral", canVisit("Histórico geral", "Balcão", ["finance.view"]), true);
check("quem não vê valores não entra", canVisit("Histórico geral", "Mecânico", ["orders.view"]), false);

check("BR dates are local days", calendarDay("07/09/2026"), "2026-09-07");
check("ISO date", calendarDay("2026-09-07"), "2026-09-07");
check("invalid date rejected", calendarDay("31/02/2026"), "");
check("leap year accepted", calendarDay("29/02/2024"), "2024-02-29");
check("no date does not invent a deadline", calendarDay("Sem previsão"), "");
check("calendar key", todayKey(new Date(2026, 8, 7, 23)), "2026-09-07");
const closed = order({ closed: true, status: "Entrega", delivery: "01/09/2026" });
check("delivered is not awaiting pickup", orderMatchesFilter(closed, "Prontas", "2026-09-07"), false);
check("closed OS has no warning", orderAttention(closed, "2026-09-07"), "");
check("closed history remains accessible", orderMatchesFilter(closed, "Entregues"), true);
check("today is not overdue", orderMatchesFilter(order({ delivery: "07/09/2026" }), "Atrasadas", "2026-09-07"), false);
check("overdue BR deadline", orderMatchesFilter(order({ delivery: "06/09/2026" }), "Atrasadas", "2026-09-07"), true);
check("approval action", orderAttention(order({ status: "Aprovação" })), "Pedir aprovação");
check("sorting prioritizes delayed orders", sortOrders([order({ id: "OS-2" }), order({ id: "OS-1", delivery: "01/09/2026" }), closed], "2026-09-07")[0].delivery, "01/09/2026");
check("inactive stock does not raise an alert", lowStock(product({ active: false, stock: 0 })), false);
check("opted-out low stock alert", lowStock(product({ alertLowStock: false, stock: 0 })), false);
check("critical stock", lowStock(product({ stock: 1 })), true);
check("name without accent", matchesSearch("joao", "JOÃO DA SILVA"), true);
check("plate without hyphen", matchesSearch("ABC1D23", "ABC-1D23"), true);
check("phone without punctuation", matchesSearch("34999999999", "(34) 99999-9999"), true);
check("all terms must match", matchesSearch("oleo honda", "ÓLEO", "HONDA"), true);
check("empty POS search stays empty", searchProducts([product({})], "").length, 0);
const parts = [product({ id: "other", name: "CABO 7891234567890" }), product({ id: "exact", barcode: "7891234567890" }), product({ id: "off", active: false, barcode: "7891234567890" })];
check("real barcode matches and ranks first", searchProducts(parts, "7891234567890").map((item) => item.id), ["exact", "other"]);
check("factory reference", searchProducts([product({ partNumber: "HND-150" })], "hnd150").length, 1);
const line: ServiceOrderItem = { id: "p", type: "Peça", name: "Óleo", price: 60, cost: 30, quantity: 2, productId: "p" };
check("legacy price is a line total", itemUnitPrice(line), 30);
check("quantity change preserves unit price", withItemQuantity(line, 3).price, 90);
check("quantity change preserves unit cost", withItemQuantity(line, 3).cost, 45);
check("invalid quantity does not corrupt record", withItemQuantity(line, Number.NaN), line);
check("partner discount only affects labor", partnerTotals([withItemQuantity(line, 3), { id: "s", type: "Mão de obra", name: "Revisão", price: 100 }], 15).total, 175);
check("already reserved item is not deducted twice", stockDeltas([{ productId: "p", quantity: 2 }], [{ productId: "p", quantity: 2 }]), []);
check("one additional quantity deducts one", stockDeltas([{ productId: "p", quantity: 3 }], [{ productId: "p", quantity: 2 }]), [{ productId: "p", quantity: 1 }]);
check("removed quantity returns to stock", stockDeltas([], [{ productId: "p", quantity: 2 }]), [{ productId: "p", quantity: -2 }]);
console.log(`${count} verificações de navegação, consulta, prazos, busca, valores e reservas passaram.`);

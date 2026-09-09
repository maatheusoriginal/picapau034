import type { ClientRecord, MotorcycleRecord, ProductRecord, ServiceOrderItem } from "./types";
import { isValidPlate } from "./plate";
import { itemQuantity } from "./order-items";

export type AttendanceIssue = { field: string; message: string };
export type AttendanceIdentity = {
  origin: "direct" | "partner";
  partnerId?: string;
  customer: ClientRecord | null;
  newCustomer: boolean;
  skipCustomer: boolean;
  name: string;
  phone: string;
  plate: string;
  model: string;
  motorcycle?: MotorcycleRecord;
};

/** A search is never a selection. Validate the same identity before advancing and saving. */
export function attendanceIdentityIssue(input: AttendanceIdentity): AttendanceIssue | null {
  const issue = (field: string, message: string) => ({ field, message });
  if (input.origin === "partner" && !input.partnerId) return issue("intake-partner", "Escolha a empresa parceira.");
  if (input.origin === "direct" && !input.skipCustomer && !input.customer) {
    if (!input.newCustomer) return issue("intake-search", "Selecione um cliente da busca, cadastre um novo ou escolha atender sem identificar.");
    if (!input.name.trim()) return issue("intake-name", "Informe o nome do cliente.");
    if (input.phone && !/^\d{10,11}$/.test(input.phone.replace(/\D/g, ""))) return issue("intake-phone", "Informe o WhatsApp com DDD (10 ou 11 números) ou deixe em branco.");
  }
  if (input.plate.trim() && !isValidPlate(input.plate)) return issue("intake-plate", "Confira a placa: use ABC-1234 ou ABC-1D23.");
  if (!input.plate.trim() && (input.skipCustomer || input.origin === "partner")) return issue("intake-plate", "Informe a placa para identificar esta motocicleta.");
  if (!input.motorcycle && !input.plate.trim() && !input.model.trim()) return issue("intake-plate", "Escolha uma motocicleta ou informe a placa ou o modelo.");
  return null;
}

/** Aggregate repeated products before checking availability. The database still owns the final reservation. */
export function attendanceItemsIssue(items: ServiceOrderItem[], products: ProductRecord[], checkStock: boolean): string {
  const requested = new Map<string, number>();
  for (const item of items) {
    if (!item.name.trim() || !Number.isFinite(item.price) || item.price < 0 || (item.quantity != null && (!Number.isFinite(item.quantity) || item.quantity <= 0))) return "Confira a descrição, a quantidade e o valor dos itens.";
    if (item.type !== "Peça" || !item.productId) continue;
    requested.set(item.productId, (requested.get(item.productId) || 0) + itemQuantity(item));
  }
  for (const [id, quantity] of requested) {
    const product = products.find((entry) => entry.id === id);
    if (!product || product.active === false) return "Uma peça foi removida ou desativada. Remova o item e escolha outra peça.";
    if (checkStock && quantity > Number(product.stock || 0)) return `${product.name}: você incluiu ${quantity}, mas há ${product.stock || 0} em estoque.`;
  }
  return "";
}

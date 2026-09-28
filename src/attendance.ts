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
  /**
   * Moto elétrica: não tem placa, e `plate` traz o código da oficina.
   *
   * As regras de placa não valem para ela — e não é só deixar passar: cobrar
   * "use ABC-1234" de uma moto que não tem placa é impedir a oficina de abrir
   * a OS de um serviço que ela está fazendo.
   */
  electric?: boolean;
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
  // A moto elétrica é identificada pelo código da oficina, que o sistema
  // gera: as três regras abaixo são sobre placa e não se aplicam a ela.
  const eletrica = input.electric === true;
  if (!eletrica && input.plate.trim() && !isValidPlate(input.plate)) return issue("intake-plate", "Confira a placa: use ABC-1234 ou ABC-1D23.");
  if (!eletrica && !input.plate.trim() && (input.skipCustomer || input.origin === "partner")) return issue("intake-plate", "Informe a placa para identificar esta motocicleta.");
  if (!input.motorcycle && !eletrica && !input.plate.trim() && !input.model.trim()) return issue("intake-plate", "Escolha uma motocicleta ou informe a placa ou o modelo.");
  // Sem placa, o modelo é o que resta para saber que moto é essa no papel.
  if (eletrica && !input.motorcycle && !input.model.trim()) return issue("intake-model", "Informe o modelo da moto elétrica: sem placa, é ele que diz qual moto é.");
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

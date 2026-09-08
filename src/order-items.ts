import type { ServiceOrderItem } from "./types";
import { round2 } from "./finance";

/** Existing records store the line total in price and cost, not unit amounts. */
export const itemQuantity = (item: ServiceOrderItem) => item.quantity && item.quantity > 0 ? item.quantity : 1;
export const itemUnitPrice = (item: ServiceOrderItem) => item.price / itemQuantity(item);
export function withItemQuantity(item: ServiceOrderItem, quantity: number): ServiceOrderItem {
  if (!Number.isFinite(quantity) || quantity <= 0) return item;
  return { ...item, quantity, price: round2(itemUnitPrice(item) * quantity), ...(item.cost != null ? { cost: round2(item.cost / itemQuantity(item) * quantity) } : {}) };
}

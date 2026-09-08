import type { OrderRecord, ProductRecord, FirebasePermission, UserRole } from "./types";

export const routePaths: Record<string, string> = {
  "Visão geral": "/", "Ordens de serviço": "/oficina", "Orçamentos": "/orcamentos",
  "PDV Balcão": "/pdv", "Serviço rápido": "/servico-rapido", "Vendas do balcão": "/vendas",
  "Produtos e estoque": "/estoque", "Compras e entradas": "/compras", "Ajuste de estoque": "/inventario",
  "Fornecedores": "/fornecedores", "Clientes": "/clientes", "Motocicletas": "/motos",
  "Funcionários": "/equipe", "Financeiro": "/financeiro", "Contas a receber": "/receber",
  "Contas a pagar": "/pagar", "Histórico de caixas": "/caixas", "Relatórios": "/relatorios",
  "Configurações": "/configuracoes", "Usuários e acessos": "/acessos", "Administração": "/admin",
};

export const workspacePermissions: Record<string, FirebasePermission[]> = {
  "Ordens de serviço": ["orders.view"], "Orçamentos": ["budgets.view"], "PDV Balcão": ["pos.use"],
  "Serviço rápido": ["quickService.use"], "Vendas do balcão": ["pos.use"],
  "Produtos e estoque": ["inventory.view"], "Compras e entradas": ["inventory.manage"],
  "Ajuste de estoque": ["inventory.view"], "Fornecedores": ["inventory.manage"],
  "Clientes": ["customers.view"], "Motocicletas": ["customers.view"], "Funcionários": ["team.view"],
  "Financeiro": ["finance.view"], "Contas a receber": ["finance.view"], "Contas a pagar": ["finance.view"],
  "Histórico de caixas": ["finance.view"], "Relatórios": ["finance.view"], "Configurações": ["settings.view"],
};

export function canVisit(destination: string, role: UserRole, permissions: FirebasePermission[]): boolean {
  if (!routePaths[destination]) return false;
  if (role === "Super Admin" || destination === "Visão geral") return true;
  return (workspacePermissions[destination] ?? []).some((permission) => permissions.includes(permission));
}

export function destinationForPath(path: string): string {
  const clean = path.replace(/\/+$/, "") || "/";
  return Object.entries(routePaths).find(([, url]) => url === clean)?.[0] ?? "Visão geral";
}

export function searchable(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchesSearch(query: string, ...values: unknown[]): boolean {
  const tokens = query.trim().split(/\s+/).map(searchable).filter(Boolean);
  const text = searchable(values.join(" "));
  return tokens.every((token) => text.includes(token));
}

/** Both formats exist in older records. Keep dates as local calendar days. */
export function calendarDay(value?: string): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : null;
  if (!parts) return "";
  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? parts.join("-") : "";
}

export const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const shortDate = (value?: string) => calendarDay(value) ? calendarDay(value).split("-").reverse().join("/") : "Sem previsão";
export const lowStock = (product: ProductRecord) => product.active !== false && product.alertLowStock !== false && product.stock <= product.minimum;
export const orderIsLate = (order: OrderRecord, today = todayKey()) => !order.closed && !!calendarDay(order.delivery) && calendarDay(order.delivery) < today;

export function orderAttention(order: OrderRecord, today = todayKey()): string {
  if (order.closed) return "";
  if (orderIsLate(order, today)) return "Prazo vencido";
  if (order.status === "Entrega") return "Combinar retirada";
  if (order.status === "Aguardando peça") return "Conferir reposição";
  if (order.status === "Aprovação") return "Pedir aprovação";
  if (order.customerPending) return "Completar cliente";
  if (searchable(order.priority).includes("urgente") || searchable(order.priority).includes("alta")) return "Prioridade alta";
  if (calendarDay(order.delivery) === today) return "Entrega prevista hoje";
  return "";
}

export function sortOrders(orders: OrderRecord[], today = todayKey()): OrderRecord[] {
  const score = (order: OrderRecord) => order.closed ? 99 : orderIsLate(order, today) ? 0 : orderAttention(order, today) ? 1 : 2;
  return [...orders].sort((a, b) => score(a) - score(b)
    || (calendarDay(a.delivery) || "9999").localeCompare(calendarDay(b.delivery) || "9999")
    || b.id.localeCompare(a.id, "pt-BR", { numeric: true }));
}

export function orderMatchesFilter(order: OrderRecord, filter: string, today = todayKey()): boolean {
  if (filter === "Todos") return true;
  if (filter === "Entregues") return !!order.closed;
  if (order.closed) return false;
  if (filter === "Em aberto") return true;
  if (filter === "Atenção") return !!orderAttention(order, today);
  if (filter === "Atrasadas") return orderIsLate(order, today);
  if (filter === "Hoje") return calendarDay(order.delivery) === today;
  if (filter === "Prontas") return order.status === "Entrega";
  return order.status === filter;
}

/** Exact barcode takes precedence, including when another description contains it. */
export function searchProducts(products: ProductRecord[], query: string): ProductRecord[] {
  if (!query.trim()) return [];
  const needle = searchable(query);
  const exact = (product: ProductRecord) => [product.barcode, product.code, product.partNumber].some((code) => !!code && searchable(code) === needle);
  return products.filter((product) => product.active !== false && matchesSearch(query, product.name, product.code, product.barcode, product.partNumber, product.brand, product.compatibility))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || a.name.localeCompare(b.name, "pt-BR"));
}

export type ParkedSale = { id: string; at: string; items: import("./types").CartItem[]; discount: number };

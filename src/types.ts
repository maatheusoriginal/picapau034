export type IconName =
  | "home"
  | "wrench"
  | "file"
  | "box"
  | "users"
  | "bike"
  | "wallet"
  | "chart"
  | "search"
  | "bell"
  | "plus"
  | "arrow"
  | "clock"
  | "alert"
  | "check"
  | "menu"
  | "settings"
  | "shield"
  | "trash"
  | "edit"
  | "lock"
  | "printer"
  | "refresh";

export type DialogKind =
  | "osChoice"
  | "os"
  | "quick"
  | "product"
  | "import"
  | "payment"
  | "catalog"
  | "client"
  | "motorcycle"
  | "employee"
  | "supplier"
  | "purchase"
  | "finance"
  | "order"
  | "orderCheckout"
  | "settings"
  | "cash"
  | "expense"
  | "receivable"
  | "payable"
  | "settleReceivable"
  | "settlePayable"
  | "record"
  | "changePassword"
  | null;

/**
 * `recordId` diz qual registro o diálogo deve abrir — sem ele, o detalhe da OS
 * mostrava sempre `orders[0]`, então clicar em qualquer linha da lista abria a
 * primeira ordem de serviço.
 */
export type OpenDialog = (dialog: Exclude<DialogKind, null>, recordId?: string) => void;

export type ExpenseRecord = {
  id: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: "Pago" | "Agendado";
  method: string;
  order?: string;
  charged?: number;
  employeeId?: string;
};

export type UserConfig = {
  id: string;
  name: string;
  role: "Super Admin" | "Balcão" | "Mecânico";
  position: string;
  phone: string;
  document?: string;
  active: boolean;
  isMechanic: boolean;
  isResponsibleMechanic: boolean;
  canReceiveServiceOrders: boolean;
  canManageAllOrders: boolean;
  employmentType: "Fixo" | "Avulso";
  baseSalary: number;
  paymentDay: number;
  serviceCommission?: number;
  productCommission?: number;
  currentOrders: number;
  userId?: string;
  notes?: string;
};

export type UserRole = UserConfig["role"];

export const allUserRoles: UserRole[] = ["Super Admin", "Balcão", "Mecânico"];

// Única fonte de verdade para as permissões do sistema. Antes esta lista (e os
// defaults por cargo) existia duplicada em app/firebase/client.ts,
// server/admin-users.ts e server/bootstrap.ts — bastava adicionar uma
// permissão em um lugar e esquecer os outros para o front e o back saírem de
// sincronia. Client e servidor agora importam tudo daqui.
export type FirebasePermission =
  | "orders.view"
  | "orders.create"
  | "orders.update"
  | "budgets.view"
  | "pos.use"
  | "quickService.use"
  | "inventory.view"
  | "inventory.manage"
  | "customers.view"
  | "customers.manage"
  | "finance.view"
  | "finance.manage"
  | "team.view";

export const allFirebasePermissions: FirebasePermission[] = [
  "orders.view", "orders.create", "orders.update", "budgets.view",
  "pos.use", "quickService.use", "inventory.view", "inventory.manage",
  "customers.view", "customers.manage", "finance.view", "finance.manage", "team.view",
];

export function defaultPermissionsForRole(role: UserRole, employeeId = ""): FirebasePermission[] {
  if (role === "Super Admin") return [...allFirebasePermissions];
  if (role === "Balcão") return [
    "orders.view", "orders.create", "orders.update", "budgets.view",
    "pos.use", "quickService.use", "inventory.view", "inventory.manage",
    "customers.view", "customers.manage", "finance.view", "finance.manage",
  ];
  const mechanicDefaults: FirebasePermission[] = ["orders.view", "orders.update", "budgets.view", "inventory.view", "customers.view"];
  if (employeeId === "USR-003") mechanicDefaults.push("orders.create", "team.view");
  return mechanicDefaults;
}

export function isMechanicUser(user: Partial<UserConfig>): boolean {
  if (user.isMechanic === true || user.isResponsibleMechanic === true || user.canReceiveServiceOrders === true) {
    return true;
  }
  const pos = (user.position || "").toLowerCase();
  const role = (user.role || "").toLowerCase();
  const job = ((user as Record<string, unknown>).jobTitle ? String((user as Record<string, unknown>).jobTitle) : "").toLowerCase();
  if (pos.includes("mecanic") || pos.includes("mecânic")) return true;
  if (role.includes("mecanic") || role.includes("mecânic") || role === "mechanic") return true;
  if (job.includes("mecanic") || job.includes("mecânic") || job === "mechanic") return true;
  return false;
}

export type PaymentMachineConfig = {
  id: string;
  name: string;
  active: boolean;
  primary: boolean;
  debitFee: number;
  credit1xFee: number;
  credit2to6Fee: number;
  credit7to12Fee: number;
  settlementDays: number;
};

export type PaymentMethodConfig = {
  id: string;
  name: string;
  active: boolean;
  usesMachine: boolean;
};

export type PartnerConfig = {
  id: string;
  name: string;
  phone: string;
  laborDiscount: number;
  billingCycle: string;
  active: boolean;
};

export type QuickServiceConfig = {
  id: string;
  name: string;
  laborPrice: number;
  duration: number;
  productCategory: string;
  productRequired: boolean;
  active: boolean;
};

export type CategoryConfig = {
  id: string;
  name: string;
  group: "Serviços" | "Produtos" | "Despesas";
  active: boolean;
};

export type SupplierConfig = {
  id: string;
  name: string;
  tradeName?: string;
  document?: string;
  phone: string;
  phoneSecondary?: string;
  email?: string;
  representative?: string;
  categories: string;
  deliveryDays: number;
  paymentTerms?: string;
  minimumOrder?: number;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
  active: boolean;
};

export type ServiceOrderItem = {
  id: string;
  type: "Peça" | "Mão de obra";
  name: string;
  price: number;
  quantity?: number;
  cost?: number;
};

export type OrderRecord = {
  id: string;
  customer: string;
  bike: string;
  plate: string;
  mechanic: string;
  mechanicIds: string[];
  time: string;
  status: string;
  tone: string;
  items?: ServiceOrderItem[];
  problem?: string;
  solution?: string;
  notes?: string;
  total?: number;
  /** Como a moto chegou à oficina (cliente, parceiro, garantia...). */
  origin?: string;
  /** Previsão de entrega mostrada no detalhe da OS. */
  delivery?: string;
  /** Prioridade combinada com o cliente (Normal, Urgente...). */
  priority?: string;
  /** Resumo do serviço principal, usado nas listagens. */
  service?: string;
  /** Cliente cadastrado que abriu a OS, quando existe. */
  clientId?: string;
  /** Motocicleta cadastrada, quando existe. */
  motorcycleId?: string;
  /** Quilometragem registrada na recepção. */
  mileage?: string;
  /** Nível de combustível na entrada da moto. */
  fuelLevel?: string;
  /** OS entregue e recebida: sai das listas de serviço em andamento. */
  closed?: boolean;
  /** Data do encerramento, no formato brasileiro. */
  closedAt?: string;
  /** Forma de pagamento usada no encerramento. */
  paymentMethod?: string;
};

/**
 * Listas que a oficina ajusta em Configurações → Listas e que alimentam os
 * selects espalhados pelo sistema.
 *
 * Antes cada tela trazia a sua própria lista fixa no código — e elas nem
 * batiam entre si: Configurações oferecia as unidades "JG" e "MT" enquanto o
 * cadastro de produto oferecia "JOGO", "KG" e "M", então a unidade padrão
 * escolhida pelo dono não existia como opção na hora de cadastrar a peça.
 */
export type SystemLists = {
  /** Unidades de medida das peças (UN, LT, PC...). */
  units: string[];
  /** Marcas de motocicleta oferecidas no cadastro. */
  motorcycleBrands: string[];
  /** Caixas e contas bancárias que recebem e pagam. */
  cashAccounts: string[];
  /** Prioridades atribuídas a uma OS na recepção. */
  orderPriorities: string[];
  /** Níveis de combustível registrados na entrada da moto. */
  fuelLevels: string[];
};

export const systemListLabels: Record<keyof SystemLists, { title: string; hint: string; placeholder: string }> = {
  units: { title: "Unidades de medida", hint: "Usadas no cadastro de peças e na unidade padrão.", placeholder: "Ex.: UN, LT, PC" },
  motorcycleBrands: { title: "Marcas de motocicleta", hint: "Aparecem no cadastro de motos.", placeholder: "Ex.: Honda" },
  cashAccounts: { title: "Caixas e contas", hint: "Contas de entrada e saída de dinheiro.", placeholder: "Ex.: Caixa balcão" },
  orderPriorities: { title: "Prioridades da OS", hint: "Escolhidas na recepção da motocicleta.", placeholder: "Ex.: Urgente" },
  fuelLevels: { title: "Níveis de combustível", hint: "Registrados na entrada da moto.", placeholder: "Ex.: 1/2 tanque" },
};

export const defaultSystemLists: SystemLists = {
  units: ["UN", "PC", "LT", "KG", "M", "PAR", "JG", "CX"],
  motorcycleBrands: ["Honda", "Yamaha", "Suzuki", "Shineray", "Kawasaki", "Dafra", "BMW", "Triumph", "Royal Enfield", "Outra"],
  cashAccounts: ["Caixa balcão", "Banco Inter"],
  orderPriorities: ["Normal", "Urgente", "Baixa"],
  fuelLevels: ["Reserva", "1/4", "1/2 tanque", "3/4", "Cheio"],
};

/** Devolve a lista configurada ou o padrão, quando ainda não houve ajuste. */
export function systemList(lists: Partial<SystemLists> | null | undefined, key: keyof SystemLists): string[] {
  const value = lists?.[key];
  return Array.isArray(value) && value.length ? value : defaultSystemLists[key];
}

/** Item no carrinho do PDV. Carrega o id do produto no Firestore para a baixa de estoque. */
export type CartItem = {
  id: string;
  code: string;
  name: string;
  unit: number;
  quantity: number;
  stock: number;
  /** Custo unitário no momento da venda, para o cálculo de lucro não mudar quando o cadastro do produto mudar. */
  cost: number;
};

/**
 * Venda concluída — no balcão (PDV) ou como serviço rápido. É o registro de
 * entrada de dinheiro da oficina: o financeiro soma daqui o que foi recebido.
 */
export type SaleRecord = {
  id: string;
  origin: "PDV" | "Serviço rápido";
  items: ServiceOrderItem[];
  total: number;
  paymentMethod: string;
  /** Taxa da maquininha, quando a venda foi no cartão. */
  fee?: number;
  /** Valor líquido depois da taxa. */
  net?: number;
  machineName?: string;
  /** Caixa ou conta bancária que recebeu o valor. */
  account?: string;
  installments?: number;
  customer?: string;
  clientId?: string;
  mechanicId?: string;
  mechanicName?: string;
  /** Quem operou a venda. */
  operatorUid?: string;
  operatorName?: string;
  /** Data no formato brasileiro, para exibição direta nas listas. */
  date: string;
  /** ISO 8601, para ordenar e filtrar por período sem depender do formato local. */
  soldAt: string;
};

export const serviceOrderStatuses = ["Recepção", "Avaliação", "Aprovação", "Em serviço", "Entrega"] as const;

export type ServiceOrderStatus = (typeof serviceOrderStatuses)[number];

/**
 * Cor do selo de situação. Fonte única: antes a tela do diálogo calculava a
 * dela em uma expressão solta e as listagens liam um campo `tone` gravado no
 * banco, então uma OS criada com o tone errado ficava com a cor errada para
 * sempre.
 */
export function statusTone(status: string): string {
  if (status === "Entrega") return "green";
  if (status === "Em serviço") return "amber";
  if (status === "Aprovação") return "red";
  if (status === "Avaliação") return "violet";
  return "blue";
}

export type ProductRecord = {
  id: string;
  code: string;
  barcode?: string;
  partNumber?: string;
  name: string;
  category: string;
  brand?: string;
  unit?: string;
  location?: string;
  cost: string;
  markup?: number;
  price: string;
  stock: number;
  minimum: number;
  maximum?: number;
  alertLowStock?: boolean;
  compatibility?: string;
  supplierId?: string;
  supplierName?: string;
  notes?: string;
  active?: boolean;
  status: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  document?: string;
  type?: "Pessoa física" | "Empresa";
  detail: string;
  meta: string;
  condition: string;
  creditLimit?: number;
  address?: string;
  motorcycleIds: string[];
  tradeCredit?: number;
  tradeDetails?: string;
  notes?: string;
  active?: boolean;
};

export type MotorcycleRecord = {
  id: string;
  ownerId: string;
  ownerName?: string;
  plate: string;
  brand?: string;
  model: string;
  year: string;
  color: string;
  mileage?: number;
  engineSize?: string;
  chassis?: string;
  renavam?: string;
  notes?: string;
};

export type SettingsConfig = {
  workshopName: string;
  tradeName?: string;
  cnpj?: string;
  phone: string;
  secondaryPhone?: string;
  address: string;
  osPrefix: string;
  nextOsNumber: number;
  defaultWarrantyDays: number;
  defaultDeliveryDays: string;
  defaultOsNotes: string;
  allowMultipleMechanics: boolean;
  showWorkload: boolean;
  defaultMinStock: number;
  defaultUnit: string;
  pricingMode?: "markup" | "fixed";
  suggestedMarkup: number;
  blockZeroStockSale: boolean;
  deductStockOnlyWhenUsed: boolean;
  useAverageCost: boolean;
  thermalPrinter: string;
  printFormat: string;
  printThreeCopies: boolean;
  defaultWhatsappMessage: string;
};

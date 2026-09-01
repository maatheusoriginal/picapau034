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
  /** ISO 8601 do pagamento. Só existe em gasto pago, e é o que prende o gasto à sessão de caixa certa. */
  paidAt?: string;
  /** Fornecedor de quem foi comprado, quando informado no lançamento. */
  supplierId?: string;
  supplierName?: string;
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

/**
 * Permissões que o cargo recebe por padrão.
 *
 * É só um ponto de partida: quem cria o usuário marca e desmarca o que quiser
 * na lista de permissões. Nada é concedido fora do que está aqui ou do que foi
 * marcado à mão.
 *
 * Não existe exceção por funcionário. Havia uma — o mecânico de id "USR-003"
 * ganhava "abrir OS" e "ver equipe" automaticamente, o que fazia sentido para o
 * Ronaldo dos dados de exemplo e para mais ninguém. Numa oficina de verdade
 * esse id é outra pessoa qualquer, ou ninguém, e o efeito era um funcionário
 * aparecer com permissão que o administrador não deu. Mecânico que precisa
 * abrir OS recebe a permissão marcada na tela, onde fica visível.
 */
export function defaultPermissionsForRole(role: UserRole): FirebasePermission[] {
  if (role === "Super Admin") return [...allFirebasePermissions];
  if (role === "Balcão") return [
    "orders.view", "orders.create", "orders.update", "budgets.view",
    "pos.use", "quickService.use", "inventory.view", "inventory.manage",
    "customers.view", "customers.manage", "finance.view", "finance.manage",
  ];
  return ["orders.view", "orders.update", "budgets.view", "inventory.view", "customers.view"];
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

/**
 * Formas de pagamento que valem enquanto ninguém configurou as suas.
 *
 * Sem isto, uma oficina recém-instalada abre o PDV, monta a venda e não
 * encontra NENHUMA forma de pagamento para escolher — não dá para receber
 * nada. A coleção nasce vazia e a tela só lista o que está nela.
 *
 * Mesma ideia de `defaultSystemLists`: o padrão vale até a oficina cadastrar
 * o seu, e some assim que ela cadastrar.
 */
export const defaultPaymentMethods: PaymentMethodConfig[] = [
  { id: "PM-DINHEIRO", name: "Dinheiro", active: true, usesMachine: false },
  { id: "PM-PIX", name: "PIX", active: true, usesMachine: false },
  { id: "PM-DEBITO", name: "Débito", active: true, usesMachine: true },
  { id: "PM-CREDITO", name: "Crédito", active: true, usesMachine: true },
  { id: "PM-PRAZO", name: "Nota a prazo", active: true, usesMachine: false },
  { id: "PM-TROCA", name: "Troca de serviços", active: true, usesMachine: false },
];

/**
 * Maquininha genérica, sem taxa, para o cartão funcionar antes de a oficina
 * cadastrar a dela. Taxa zero não inventa desconto que não existe: quando a
 * oficina cadastrar a máquina de verdade, a taxa passa a valer.
 */
export const defaultPaymentMachines: PaymentMachineConfig[] = [
  { id: "MAQ-PADRAO", name: "Maquininha da oficina", active: true, primary: true,
    debitFee: 0, credit1xFee: 0, credit2to6Fee: 0, credit7to12Fee: 0, settlementDays: 1 },
];

/** Categorias de peça para o cadastro de produto não abrir sem opção nenhuma. */
export const defaultProductCategories: CategoryConfig[] = [
  "Motor e Transmissão", "Freios e Rodas", "Elétrica e Ignição", "Suspensão e Direção",
  "Lubrificantes e Fluidos", "Pneus e Câmaras", "Acessórios e Carenagens", "Cabos e Relação", "Filtros",
].map((name, index) => ({ id: `CAT-${String(index + 1).padStart(3, "0")}`, name, group: "Produtos" as const, active: true }));

/**
 * Devolve o que está cadastrado ou o padrão, quando a oficina ainda não
 * configurou nada. Mesma função de `systemList` para as listas do sistema.
 */
export function orDefault<T>(configured: T[] | undefined, fallback: T[]): T[] {
  return configured && configured.length ? configured : fallback;
}

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

/**
 * Grupos de categoria. "Receitas" classifica o que entra — antes só existiam
 * grupos para o que sai (Despesas) e para o que é vendido, então não havia como
 * responder de onde veio o dinheiro do mês.
 */
export const categoryGroups = ["Serviços", "Produtos", "Despesas", "Receitas"] as const;

export type CategoryGroup = (typeof categoryGroups)[number];

export type CategoryConfig = {
  id: string;
  name: string;
  group: CategoryGroup;
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
  /**
   * Produto no Firestore, quando o item veio do estoque. `id` guarda o código
   * da peça (visível para a oficina), que não serve para dar baixa.
   */
  productId?: string;
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
  /** Se o odômetro foi conferido na recepção da moto. */
  mileageChecked?: boolean;
  /** Nível de combustível na entrada da moto. */
  fuelLevel?: string;
  /** OS entregue e recebida: sai das listas de serviço em andamento. */
  closed?: boolean;
  /** Data do encerramento, no formato brasileiro. */
  closedAt?: string;
  /** ISO 8601 do encerramento. `closedAt` só tem a data, e a sessão de caixa precisa da hora. */
  closedAtISO?: string;
  /** As partes do pagamento no encerramento, quando foi dividido. */
  payments?: SalePayment[];
  /** Forma de pagamento usada no encerramento. */
  paymentMethod?: string;
  /**
   * Peças que esta OS já tirou do estoque. Comparar com os itens atuais é o que
   * evita baixa dobrada e devolve a peça quando ela sai da ordem.
   */
  deductedItems?: Array<{ productId: string; quantity: number }>;
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
  /** Marcas e fabricantes de peça oferecidos no cadastro de produto. */
  partBrands: string[];
  /** Caixas e contas bancárias que recebem e pagam. */
  cashAccounts: string[];
  /** Prioridades atribuídas a uma OS na recepção. */
  orderPriorities: string[];
  /** Níveis de combustível registrados na entrada da moto. */
  fuelLevels: string[];
  /** Motivos de entrada de dinheiro que não são venda. */
  movementIncomeCategories: string[];
  /** Motivos de saída de dinheiro que não são conta agendada. */
  movementExpenseCategories: string[];
};

export const systemListLabels: Record<keyof SystemLists, { title: string; hint: string; placeholder: string }> = {
  units: { title: "Unidades de medida", hint: "Usadas no cadastro de peças e na unidade padrão.", placeholder: "Ex.: UN, LT, PC" },
  motorcycleBrands: { title: "Marcas de motocicleta", hint: "Aparecem no cadastro de motos.", placeholder: "Ex.: Honda" },
  partBrands: { title: "Marcas de peça", hint: "Aparecem no cadastro de peças, no campo Marca / Fabricante.", placeholder: "Ex.: Motul" },
  cashAccounts: { title: "Caixas e contas", hint: "Contas de entrada e saída de dinheiro.", placeholder: "Ex.: Caixa balcão" },
  orderPriorities: { title: "Prioridades da OS", hint: "Escolhidas na recepção da motocicleta.", placeholder: "Ex.: Urgente" },
  fuelLevels: { title: "Níveis de combustível", hint: "Registrados na entrada da moto.", placeholder: "Ex.: 1/2 tanque" },
  movementIncomeCategories: { title: "Motivos de entrada", hint: "Dinheiro que entra sem ser venda nem OS.", placeholder: "Ex.: Venda de sucata" },
  movementExpenseCategories: { title: "Motivos de saída", hint: "Dinheiro que sai sem ser conta agendada.", placeholder: "Ex.: Manutenção da oficina" },
};

export const defaultSystemLists: SystemLists = {
  units: ["UN", "PC", "LT", "KG", "M", "PAR", "JG", "CX"],
  motorcycleBrands: ["Honda", "Yamaha", "Suzuki", "Shineray", "Kawasaki", "Dafra", "BMW", "Triumph", "Royal Enfield", "Outra"],
  partBrands: ["Motul", "Ipiranga", "Yamalube", "Mobil", "Lubrax", "Cobreq", "Fras-le", "NGK", "Bosch", "Magneti Marelli", "DID", "Riffel", "Vedamotors", "Pirelli", "Levorin", "Michelin", "Original Honda", "Original Yamaha"],
  cashAccounts: ["Caixa balcão", "Banco Inter"],
  orderPriorities: ["Normal", "Urgente", "Baixa"],
  fuelLevels: ["Reserva", "1/4", "1/2 tanque", "3/4", "Cheio"],
  // Sangria e suprimento não estão aqui de propósito: quem faz isso é o caixa.
  movementIncomeCategories: ["Venda de sucata", "Devolução de fornecedor", "Aporte do dono", "Reembolso recebido", "Outra entrada"],
  movementExpenseCategories: ["Manutenção da oficina", "Frete e entrega", "Material de limpeza", "Retirada do dono", "Outra saída"],
};

/** Devolve a lista configurada ou o padrão, quando ainda não houve ajuste. */
export function systemList(lists: Partial<SystemLists> | null | undefined, key: keyof SystemLists): string[] {
  const value = lists?.[key];
  return Array.isArray(value) && value.length ? value : defaultSystemLists[key];
}

/** Item no carrinho do PDV. Carrega o id do produto no Firestore para a baixa de estoque. */
/** Uma baixa: parte (ou todo) do valor de uma conta que foi paga ou recebida. */
/**
 * Uma entrada ou saída de dinheiro lançada à mão.
 *
 * É o que não é venda nem conta agendada: venda de sucata, devolução de
 * fornecedor, aporte do dono, conserto pago na hora. Sangria e suprimento NÃO
 * entram aqui — quem faz isso é o caixa, e ter dois caminhos para a mesma
 * coisa faria a conferência da gaveta contar o mesmo dinheiro duas vezes.
 */
export type MovementRecord = {
  id: string;
  kind: "entrada" | "saida";
  amount: number;
  category: string;
  method: string;
  description: string;
  /** Data brasileira, para exibição direta. */
  date: string;
  /** ISO 8601, para ordenar e para prender a movimentação à sessão de caixa certa. */
  at: string;
  operatorUid?: string;
  operatorName?: string;
};

/**
 * Uma sessão de caixa: da abertura ao fechamento.
 *
 * É o dinheiro **físico** da gaveta, e só ele. Venda no PIX ou no cartão não
 * entra aqui — vai para a conta, e conferir a gaveta com esses valores dentro
 * faria toda conferência fechar errado. É justamente essa separação que
 * permite descobrir no fim do dia que faltam R$ 50.
 */
export type CashSession = {
  id: string;
  /** ISO 8601 da abertura. Delimita quais vendas pertencem a esta sessão. */
  openedAt: string;
  /** Data brasileira da abertura, para exibição direta. */
  openedDate: string;
  openedByUid?: string;
  openedByName?: string;
  /** Fundo de troco com que o caixa começou o dia. */
  openingAmount: number;
  /** Suprimentos e sangrias lançados durante a sessão. */
  movements?: CashMovement[];
  status: "aberto" | "fechado";
  closedAt?: string;
  closedDate?: string;
  closedByUid?: string;
  closedByName?: string;
  /** Quanto foi contado na gaveta no fechamento. */
  countedAmount?: number;
  /** Quanto o sistema esperava encontrar, gravado no momento do fechamento. */
  expectedAmount?: number;
  /** Contado menos esperado: positivo é sobra, negativo é falta. */
  difference?: number;
  closingNotes?: string;
};

/** Dinheiro colocado na gaveta (suprimento) ou retirado dela (sangria). */
export type CashMovement = {
  kind: "Suprimento" | "Sangria";
  amount: number;
  reason: string;
  /** ISO 8601, para ordenar. */
  at: string;
  date: string;
  operatorUid?: string;
  operatorName?: string;
};

export type AccountSettlement = {
  /** Data no formato brasileiro, para exibição direta nas listas. */
  date: string;
  /** ISO 8601, para ordenar e filtrar por período. */
  settledAt: string;
  amount: number;
  method: string;
  /** Caixa ou conta bancária que recebeu ou pagou. */
  account?: string;
  operatorUid?: string;
  operatorName?: string;
};

/**
 * Uma conta a receber ou a pagar.
 *
 * Antes as contas a receber eram deduzidas na hora, a partir das vendas e OS
 * fechadas em "Nota a prazo" — e por isso nunca saíam da lista: não havia onde
 * registrar que o cliente pagou. O total só crescia. Agora a conta é um
 * registro próprio, com as baixas guardadas dentro dela.
 */
export type AccountRecord = {
  id: string;
  kind: "receber" | "pagar";
  /** Cliente, fornecedor ou favorecido. */
  person: string;
  personId?: string;
  description: string;
  category: string;
  /** Valor original desta parcela. */
  amount: number;
  /** Vencimento no formato brasileiro. */
  dueDate: string;
  settlements: AccountSettlement[];
  notes?: string;
  /** De onde a conta veio: "Manual", "Venda", "Ordem de serviço". */
  origin: string;
  /** Venda ou OS que gerou a conta, quando não é lançamento manual. */
  sourceId?: string;
  /** Número desta parcela e total de parcelas. Lançamento avulso é 1 de 1. */
  installment: number;
  installments: number;
  /** Liga as parcelas do mesmo lançamento. */
  groupId?: string;
};

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
/**
 * Uma parte do pagamento de uma venda ou OS.
 *
 * Existe porque "dividir pagamento" era um botão que não gravava nada: o
 * cliente pagava R$ 100 no PIX e R$ 50 em dinheiro, e a venda entrava com uma
 * forma só. O caixa então esperava R$ 150 na gaveta e a conferência fechava
 * errado, sem ninguém entender por quê.
 */
export type SalePayment = {
  method: string;
  amount: number;
  /** Taxa da maquininha desta parte, quando foi cartão. */
  fee?: number;
  machineName?: string;
  installments?: number;
};

export type SaleRecord = {
  id: string;
  origin: "PDV" | "Serviço rápido";
  items: ServiceOrderItem[];
  /** Soma dos itens, antes do desconto. */
  subtotal?: number;
  /** Desconto concedido na venda, em reais. */
  discount?: number;
  /** O que o cliente pagou de fato: subtotal menos desconto. */
  total: number;
  /** Forma principal. Continua existindo para as vendas antigas e para exibição. */
  paymentMethod: string;
  /** As partes do pagamento, quando foi dividido. Ausente = pagamento único. */
  payments?: SalePayment[];
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

/** Uma compra de peças que entrou no estoque. */
export type StockEntryRecord = {
  id: string;
  supplierId?: string;
  supplierName?: string;
  /** Data no formato brasileiro. */
  date: string;
  /** ISO 8601, para ordenar e filtrar por período. */
  entryAt: string;
  payment: string;
  /** Como o custo foi tratado nesta entrada: "Custo médio" ou "Último preço". */
  costMode: string;
  total: number;
  items: Array<{ productId: string; name: string; quantity: number; unitCost: number; total: number }>;
  operatorUid?: string;
  operatorName?: string;
};

/**
 * As situações da OS, na ordem em que a moto caminha pela oficina.
 *
 * A ordem importa de verdade: `shouldReserveStock` decide pela POSIÇÃO se a
 * peça já saiu do estoque ("da bancada em diante"). Por isso "Aguardando peça"
 * fica depois de "Em serviço" — o serviço começou, as peças que existiam já
 * foram baixadas, e parar para esperar uma que faltou não devolve as outras
 * para a prateleira.
 */
export const serviceOrderStatuses = ["Recepção", "Avaliação", "Aprovação", "Em serviço", "Aguardando peça", "Entrega"] as const;

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
  // Vermelho para as duas situações em que a moto está parada esperando outra
  // pessoa: o cliente aprovar ou o fornecedor entregar. É o que precisa saltar
  // aos olhos de quem olha o quadro da oficina.
  if (status === "Aprovação" || status === "Aguardando peça") return "red";
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
  /** ISO 8601 da última cópia de segurança baixada. Fica aqui, e não no
   *  navegador, para valer em qualquer aparelho: guardado localmente, o
   *  celular acharia que nunca houve backup feito no computador. */
  lastBackupAt?: string;
};

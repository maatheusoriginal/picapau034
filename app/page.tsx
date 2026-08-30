"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMechanicUser, serviceOrderStatuses, statusTone, systemList } from "../src/types";
import { financeSummary, payableEntries, receivableEntries } from "../src/finance";
import type { SettingsTab } from "../src/components/SettingsWorkspace";

// Carregados sob demanda: cada um só é montado quando o diálogo/aba
// correspondente é aberto (ver DialogRouter e a aba "Configurações" mais
// abaixo), então não precisam entrar no bundle inicial. Isso tira ~1.400
// linhas do SettingsWorkspace e mais 5 modais do JS que todo usuário baixa
// só para abrir a tela de login ou a Visão geral.
const ProductFormModal = lazy(() => import("../src/components/ProductFormModal").then((m) => ({ default: m.ProductFormModal })));
const SupplierFormModal = lazy(() => import("../src/components/SupplierFormModal").then((m) => ({ default: m.SupplierFormModal })));
const MotorcycleFormModal = lazy(() => import("../src/components/MotorcycleFormModal").then((m) => ({ default: m.MotorcycleFormModal })));
const ClientFormModal = lazy(() => import("../src/components/ClientFormModal").then((m) => ({ default: m.ClientFormModal })));
const EmployeeFormModal = lazy(() => import("../src/components/EmployeeFormModal").then((m) => ({ default: m.EmployeeFormModal })));
const SettingsWorkspace = lazy(() => import("../src/components/SettingsWorkspace").then((m) => ({ default: m.SettingsWorkspace })));

function LazyFallback() {
  return <div className="lazy-loading" role="status" aria-live="polite">Carregando…</div>;
}
import {
  bootstrapCurrentUserAsSuperAdmin,
  changeOwnPassword,
  createManagedUser,
  createServiceOrder,
  recordSale,
  defaultFirebasePermissions,
  deleteManagedUser,
  firebaseErrorMessage,
  listManagedUsers,
  MIN_PASSWORD_LENGTH,
  observeAccessProfile,
  observeCollection,
  observeEmployees,
  observeFirestoreDoc,
  observeFirebaseAuth,
  requestFirebasePasswordReset,
  saveFirestoreDoc,
  setManagedUserPassword,
  signInFirebase,
  signOutFirebase,
  syncCollectionDiff,
  syncEmployeesDiff,
  updateManagedUser,
  type FirebaseAccessProfile,
  type FirebaseManagedUser,
  type FirebasePermission,
  type FirebaseUserSummary,
  type ManagedUserInput,
} from "./firebase/client";

// Os tipos de domínio vivem em src/types.ts, que é a fonte única compartilhada
// entre esta tela, os modais de cadastro e o backend administrativo. Antes este
// arquivo redeclarava versões reduzidas dos mesmos tipos (OrderRecord sem
// `total`, MotorcycleRecord sem `brand`, ...), o que fazia o TypeScript
// reclamar de campos que a interface de fato usa e escondia divergências entre
// o que o formulário grava e o que a tela lê.
import type {
  CartItem,
  CategoryConfig,
  ClientRecord,
  DialogKind,
  ExpenseRecord,
  IconName,
  MotorcycleRecord,
  OpenDialog,
  OrderRecord,
  PartnerConfig,
  PaymentMachineConfig,
  PaymentMethodConfig,
  ProductRecord,
  QuickServiceConfig,
  SaleRecord,
  ServiceOrderStatus,
  SystemLists,
  ServiceOrderItem,
  SettingsConfig,
  SupplierConfig,
  UserConfig,
} from "../src/types";

type FirebaseConnectionState = "checking" | "signed-out" | "needs-profile" | "connected" | "disabled" | "error";

const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseBRL = (value: string) => Number(value.replace(/[^\d,]/g, "").replace(",", ".")) || 0;
const onlyDigits = (value: string) => value.replace(/\D/g, "");
const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
/**
 * O painel administrativo tem endereço próprio (/admin). Não há biblioteca de
 * rotas no projeto: o Express devolve o index.html para qualquer caminho, então
 * basta ler e escrever o pathname.
 */
const currentPath = () => window.location.pathname.replace(/\/+$/, "") || "/";
const isAdminPath = () => currentPath() === "/admin";

/**
 * Maior número já usado em ids do tipo `PREFIXO-0007`. Base para gerar o
 * próximo da sequência sem reaproveitar o id de um registro apagado.
 */
const highestSequence = (records: Array<{ id: string }>, prefix: string) => records.reduce((highest, record) => {
  if (prefix && !record.id.toUpperCase().startsWith(`${prefix.toUpperCase()}-`)) return highest;
  const digits = record.id.match(/(\d+)\s*$/);
  return digits ? Math.max(highest, Number(digits[1])) : highest;
}, 0);
const formatPlate = (value: string) => {
  const normalized = normalizePlate(value);
  return normalized.length > 3 ? `${normalized.slice(0, 3)}-${normalized.slice(3)}` : normalized;
};
const platePattern = (value: string) => {
  const normalized = normalizePlate(value);
  if (normalized.length < 7) return "Digite os 7 caracteres";
  return /[A-Z]/.test(normalized[4] ?? "") ? "Padrão Mercosul" : "Padrão antigo";
};
const formatPhone = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const initialExpenses: ExpenseRecord[] = [];

const initialUsers: UserConfig[] = [];

const initialPaymentMachines: PaymentMachineConfig[] = [];

const initialPaymentMethods: PaymentMethodConfig[] = [];

const initialPartners: PartnerConfig[] = [];

const initialQuickServices: QuickServiceConfig[] = [];

const initialCategories: CategoryConfig[] = [];

const initialSuppliers: SupplierConfig[] = [];

const initialSales: SaleRecord[] = [];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-7h6v7"/></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-8.9 8.9a2.1 2.1 0 0 0 3 3l8.9-8.9a4 4 0 0 0-.6-5.4Z"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    box: <><path d="m3 7 9-4 9 4-9 4z"/><path d="m3 7 9 4 9-4v10l-9 4-9-4zM12 11v10"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    bike: <><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17 9 9h4l3 8M8 12h7l4 5M13 9l-2-3h-2M17 6h3"/></>,
    wallet: <><path d="M3 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    alert: <><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    shield: <><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    printer: <><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></>,
    refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></>,
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

const navGroups: Array<{
  label: string;
  icon: IconName;
  items: Array<{ label: string; icon: IconName; badge?: string }>;
}> = [
  {
    label: "Oficina",
    icon: "wrench",
    items: [
      { label: "Ordens de serviço", icon: "wrench" },
      { label: "Orçamentos", icon: "file" },
    ],
  },
  {
    label: "Balcão",
    icon: "wallet",
    items: [
      { label: "PDV Balcão", icon: "wallet" },
      { label: "Serviço rápido", icon: "clock" },
      { label: "Vendas do balcão", icon: "file" },
    ],
  },
  {
    label: "Estoque",
    icon: "box",
    items: [
      { label: "Produtos e estoque", icon: "box" },
      { label: "Compras e entradas", icon: "file" },
      { label: "Fornecedores", icon: "users" },
    ],
  },
  {
    label: "Cadastros",
    icon: "users",
    items: [
      { label: "Clientes", icon: "users" },
      { label: "Motocicletas", icon: "bike" },
      { label: "Funcionários", icon: "wrench" },
    ],
  },
  {
    label: "Gestão",
    icon: "chart",
    items: [
      { label: "Financeiro", icon: "wallet" },
      { label: "Contas a receber", icon: "arrow" },
      { label: "Contas a pagar", icon: "file" },
      { label: "Relatórios", icon: "chart" },
    ],
  },
];

const destinationPermissions: Record<string, FirebasePermission[]> = {
  "Ordens de serviço": ["orders.view"],
  "Orçamentos": ["budgets.view"],
  "PDV Balcão": ["pos.use"],
  "Serviço rápido": ["quickService.use"],
  "Vendas do balcão": ["pos.use"],
  "Produtos e estoque": ["inventory.view"],
  "Compras e entradas": ["inventory.manage"],
  "Fornecedores": ["inventory.manage"],
  "Clientes": ["customers.view"],
  "Motocicletas": ["customers.view"],
  "Funcionários": ["team.view"],
  "Financeiro": ["finance.view"],
  "Contas a receber": ["finance.view"],
  "Contas a pagar": ["finance.view"],
  "Relatórios": ["finance.view"],
};

const initialOrders: OrderRecord[] = [];

const initialProducts: ProductRecord[] = [];

const initialClients: ClientRecord[] = [];

const initialMotorcycles: MotorcycleRecord[] = [];


function downloadStockTemplate() {
  const rows = [
    ["Nome", "Código de barras", "Código da peça (opcional)", "Quantidade", "Categoria", "Marca", "Unidade", "Preço de custo", "Preço de venda", "Estoque mínimo", "Compatibilidade", "Localização", "Fornecedor"],
    ["Óleo 20W50", "7890000000000", "", "10", "Óleos", "Exemplo", "UN", "25,00", "39,90", "5", "CG 125 / CG 150", "Prateleira A1", "Fornecedor exemplo"],
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-cadastro-estoque-pica-pau-motos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function useFirebaseSession() {
  const [user, setUser] = useState<FirebaseUserSummary | null>(null);
  const [profile, setProfile] = useState<FirebaseAccessProfile | null>(null);
  const [state, setState] = useState<FirebaseConnectionState>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let stopProfile: () => void = () => undefined;
    let stopAuth: () => void = () => undefined;

    const handleAuthError = (firebaseError: unknown) => {
      setUser(null);
      setProfile(null);
      setState("error");
      setError(firebaseErrorMessage(firebaseError));
    };

    try {
      stopAuth = observeFirebaseAuth((nextUser) => {
        stopProfile();
        setUser(nextUser);
        setProfile(null);
        setError("");
        if (!nextUser) {
          setState("signed-out");
          return;
        }
        setState("checking");
        try {
          stopProfile = observeAccessProfile(nextUser.uid, (nextProfile) => {
            setProfile(nextProfile);
            if (!nextProfile) {
              setState("needs-profile");
              return;
            }
            if (!nextProfile.active) {
              setState("disabled");
              setError("Seu acesso ao sistema está desativado. Procure o responsável pela oficina.");
              return;
            }
            setState("connected");
          }, (firebaseError) => {
            setState("error");
            setError(firebaseErrorMessage(firebaseError));
          });
        } catch (firebaseError) {
          handleAuthError(firebaseError);
        }
      }, handleAuthError);
    } catch (firebaseError) {
      handleAuthError(firebaseError);
    }

    return () => { stopProfile(); stopAuth(); };
  }, []);

  const login = async (email: string, password: string) => {
    setState("checking");
    setError("");
    try {
      await signInFirebase(email, password);
    } catch (firebaseError) {
      setState("signed-out");
      const message = firebaseErrorMessage(firebaseError);
      setError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    await signOutFirebase();
    setUser(null);
    setProfile(null);
    setState("signed-out");
    setError("");
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    setError("");
    try {
      await changeOwnPassword(currentPassword, newPassword);
    } catch (firebaseError) {
      const message = firebaseErrorMessage(firebaseError);
      setError(message);
      throw new Error(message);
    }
  };

  const resetPassword = async (email: string) => {
    setError("");
    try {
      await requestFirebasePasswordReset(email);
    } catch (firebaseError) {
      const message = firebaseErrorMessage(firebaseError);
      setError(message);
      throw new Error(message);
    }
  };

  const bootstrapAdmin = async () => {
    setError("");
    try {
      await bootstrapCurrentUserAsSuperAdmin();
    } catch (firebaseError) {
      const message = firebaseErrorMessage(firebaseError);
      setError(message);
      throw new Error(message);
    }
  };

  const reportSyncError = (firebaseError: unknown) => {
    setError(firebaseErrorMessage(firebaseError));
  };

  return { user, profile, state, error, login, logout, resetPassword, changePassword, bootstrapAdmin, reportSyncError };
}

function useFirebaseSyncedCollection<T extends { id: string }>(
  collectionName: string,
  initialRecords: T[],
  enabled: boolean,
  writable: boolean,
  onError: (error: unknown) => void,
) {
  const [records, setRecords] = useState<T[]>([]);
  const remoteSignature = useRef("");
  const remoteRecordMap = useRef(new Map<string, string>());
  const remoteReady = useRef(false);
  const errorHandler = useRef(onError);

  useEffect(() => { errorHandler.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled) {
      remoteReady.current = false;
      remoteSignature.current = "";
      remoteRecordMap.current = new Map();
      const timer = window.setTimeout(() => setRecords([]), 0);
      return () => window.clearTimeout(timer);
    }
    const stop = observeCollection<T>(collectionName, (remoteRecords) => {
      // Em produção, uma coleção vazia deve permanecer vazia.
      // Antes, o sistema restaurava automaticamente os registros fictícios
      // sempre que todos os documentos eram apagados no Firestore.
      remoteReady.current = true;
      remoteSignature.current = JSON.stringify(remoteRecords);
      remoteRecordMap.current = new Map(remoteRecords.map((record) => [record.id, JSON.stringify(record)]));
      setRecords(remoteRecords);
    }, (firebaseError) => errorHandler.current(firebaseError));
    return stop;
  }, [collectionName, enabled, initialRecords, writable]);

  useEffect(() => {
    if (!enabled || !writable || !remoteReady.current) return;
    const signature = JSON.stringify(records);
    if (signature === remoteSignature.current) return;
    const timer = window.setTimeout(() => {
      // Grava só os registros que mudaram desde o último snapshot recebido do
      // Firestore, em vez de reescrever a coleção inteira a cada edição local
      // (era o comportamento antigo de replaceCollection).
      const previousMap = remoteRecordMap.current;
      const nextMap = new Map<string, string>();
      const changed: T[] = [];
      records.forEach((record) => {
        const recordSignature = JSON.stringify(record);
        nextMap.set(record.id, recordSignature);
        if (previousMap.get(record.id) !== recordSignature) changed.push(record);
      });
      const deletedIds = [...previousMap.keys()].filter((id) => !nextMap.has(id));
      syncCollectionDiff(collectionName, changed, deletedIds).then(() => {
        remoteSignature.current = signature;
        remoteRecordMap.current = nextMap;
      }).catch((firebaseError) => errorHandler.current(firebaseError));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [collectionName, enabled, records, writable]);

  return [records, setRecords] as const;
}

function useFirebaseSyncedEmployees(
  initialRecords: UserConfig[],
  enabled: boolean,
  isAdmin: boolean,
  onError: (error: unknown) => void,
) {
  const [records, setRecords] = useState<UserConfig[]>([]);
  const remoteSignature = useRef("");
  const remoteRecordMap = useRef(new Map<string, string>());
  const remoteReady = useRef(false);
  const errorHandler = useRef(onError);

  useEffect(() => { errorHandler.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled) {
      remoteReady.current = false;
      remoteSignature.current = "";
      remoteRecordMap.current = new Map();
      const timer = window.setTimeout(() => setRecords([]), 0);
      return () => window.clearTimeout(timer);
    }
    return observeEmployees<UserConfig>(isAdmin, (remoteRecords) => {
      // Funcionários também não são recriados a partir dos dados de demonstração
      // quando as coleções employees/employeeCompensation estiverem vazias.
      remoteReady.current = true;
      remoteSignature.current = JSON.stringify(remoteRecords);
      remoteRecordMap.current = new Map(remoteRecords.map((record) => [record.id, JSON.stringify(record)]));
      setRecords(remoteRecords);
    }, (firebaseError) => errorHandler.current(firebaseError));
  }, [enabled, initialRecords, isAdmin]);

  useEffect(() => {
    if (!enabled || !isAdmin || !remoteReady.current) return;
    const signature = JSON.stringify(records);
    if (signature === remoteSignature.current) return;
    const timer = window.setTimeout(() => {
      // Mesma lógica de diff pontual usada em useFirebaseSyncedCollection,
      // aplicada ao par employees/employeeCompensation.
      const previousMap = remoteRecordMap.current;
      const nextMap = new Map<string, string>();
      const changed: UserConfig[] = [];
      records.forEach((record) => {
        const recordSignature = JSON.stringify(record);
        nextMap.set(record.id, recordSignature);
        if (previousMap.get(record.id) !== recordSignature) changed.push(record);
      });
      const deletedIds = [...previousMap.keys()].filter((id) => !nextMap.has(id));
      syncEmployeesDiff(changed, deletedIds).then(() => {
        remoteSignature.current = signature;
        remoteRecordMap.current = nextMap;
      }).catch((firebaseError) => errorHandler.current(firebaseError));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [enabled, isAdmin, records]);

  return [records, setRecords] as const;
}

// O carrinho vem do WorkshopApp porque o recebimento acontece no diálogo de
// pagamento, que é outro componente. Enquanto o estado morava aqui dentro, o
// diálogo não tinha como saber o que estava sendo vendido — mostrava um total
// fixo de R$ 108,00 e a venda sumia ao fechar a janela.
function PdvWorkspace({
  notify,
  openDialog,
  cart,
  setCart,
  products = [],
  clients = [],
}: {
  notify: (message: string) => void;
  openDialog: OpenDialog;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  products?: ProductRecord[];
  clients?: ClientRecord[];
}) {
  const [pdvSearch, setPdvSearch] = useState("");
  // Antes recalculado em toda renderização (inclusive a cada tecla digitada em
  // qualquer outro campo da tela), mesmo quando `products`/`cart` não mudaram.
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.unit * item.quantity, 0), [cart]);
  const addToCart = useCallback((product: Omit<CartItem, "quantity">) => {
    if (product.stock === 0) return notify(`${product.name} está sem estoque.`);
    setCart((current) => {
      const inCart = current.find((item) => item.code === product.code);
      // Não deixa vender mais do que existe na prateleira.
      if (inCart && inCart.quantity >= product.stock) {
        notify(`${product.name} tem apenas ${product.stock} em estoque.`);
        return current;
      }
      return inCart
        ? current.map((item) => item.code === product.code ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setPdvSearch("");
  }, [notify, setCart]);
  const pdvCatalog = useMemo(() => products.map((p) => ({
    id: p.id,
    code: p.code,
    barcode: p.code,
    name: p.name,
    unit: parseBRL(p.price),
    stock: p.stock,
    cost: parseBRL(p.cost),
  })), [products]);
  const pdvSuggestions = useMemo(() => (
    pdvSearch ? pdvCatalog.filter((product) => `${product.name} ${product.code} ${product.barcode}`.toLowerCase().includes(pdvSearch.toLowerCase())).slice(0, 8) : []
  ), [pdvCatalog, pdvSearch]);
  const changeQuantity = useCallback((code: string, difference: number) => {
    setCart((current) => current
      .map((item) => item.code === code ? { ...item, quantity: Math.min(item.stock, Math.max(0, item.quantity + difference)) } : item)
      .filter((item) => item.quantity > 0));
  }, [setCart]);

  return (
    <>
      <div className="module-heading pdv-heading">
        <div><p>Venda no balcão</p><h1>PDV Balcão</h1><span>Venda peças com poucos cliques e receba em mais de uma forma.</span></div>
        <div className="pdv-heading-actions"><button className="outline-button large" onClick={() => openDialog("expense")}><Icon name="plus" size={16}/>Lançar gasto</button><div className="pdv-session"><i/><div><strong>Caixa aberto</strong><small>Pronto para vendas</small></div></div></div>
      </div>
      <div className="pdv-layout">
        <section className="pdv-main">
          <div className="pdv-search-wrap"><label className="pdv-search"><Icon name="search"/><input autoFocus value={pdvSearch} onChange={(event) => setPdvSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && pdvSuggestions[0]) addToCart(pdvSuggestions[0]); }} placeholder="Digite o produto, código de barras ou código da peça"/><kbd>F2</kbd></label>{pdvSearch ? <div className="pdv-suggestions">{pdvSuggestions.length ? pdvSuggestions.map((product) => <button key={product.code} onClick={() => addToCart(product)} disabled={product.stock === 0}><span className="catalog-code">{product.code.slice(-2)}</span><div><strong>{product.name}</strong><small>{product.code} · {product.barcode}</small></div><b>{product.stock ? `${product.stock} un. · R$ ${product.unit.toFixed(2).replace(".", ",")}` : "Sem estoque"}</b><Icon name="plus" size={16}/></button>) : <div className="no-results">Nenhum produto encontrado.</div>}</div> : null}</div>
          <div className="pdv-shortcuts">
            {pdvCatalog.filter((p) => p.stock > 0).slice(0, 2).map((prod, idx) => (
              <button key={prod.code} onClick={() => addToCart(prod)}>
                <span>{String(idx + 1).padStart(2, "0")}</span>
                <div><strong>{prod.name}</strong><small>{prod.stock} em estoque</small></div>
                <b>R$ {prod.unit.toFixed(2).replace(".", ",")}</b>
              </button>
            ))}
            <button onClick={() => openDialog("catalog")}><span>+</span><div><strong>Ver catálogo</strong><small>{products.length} {products.length === 1 ? "produto" : "produtos"}</small></div><Icon name="arrow" size={17}/></button>
          </div>
          <section className="panel pdv-cart">
            <div className="pdv-cart-head"><div><h2>Itens da venda</h2><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} unidades</span></div><button onClick={() => setCart([])}>Limpar venda</button></div>
            {cart.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Produto</th><th>Quantidade</th><th>Unitário</th><th>Total</th><th></th></tr></thead>
                  <tbody>{cart.map((item) => (
                    <tr key={item.code}>
                      <td><strong>{item.name}</strong><span className="mono">{item.code} · Estoque {item.stock}</span></td>
                      <td><div className="quantity-control"><button onClick={() => changeQuantity(item.code, -1)}>−</button><strong>{item.quantity}</strong><button onClick={() => changeQuantity(item.code, 1)}>+</button></div></td>
                      <td className="mono">R$ {item.unit.toFixed(2).replace(".", ",")}</td>
                      <td><strong className="mono">R$ {(item.unit * item.quantity).toFixed(2).replace(".", ",")}</strong></td>
                      <td><button className="remove-item" onClick={() => changeQuantity(item.code, -item.quantity)} aria-label={`Remover ${item.name}`}>×</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="pdv-empty"><span><Icon name="box"/></span><strong>Venda vazia</strong><p>Busque um produto para começar.</p></div>}
          </section>
        </section>
        <aside className="pdv-summary panel">
          <div className="summary-title"><span>Resumo da venda</span><b>VENDA NO BALCÃO</b></div>
          <button className="pdv-client" onClick={() => openDialog("client")}><span className="registry-avatar">CF</span><div><strong>Consumidor final</strong><small>Adicionar cliente ou usar crediário</small></div><Icon name="arrow" size={17}/></button>
          <div className="summary-lines">
            <div><span>Subtotal</span><b>R$ {total.toFixed(2).replace(".", ",")}</b></div>
            <div><span>Desconto</span><button onClick={() => openDialog("finance")}>Adicionar</button></div>
          </div>
          <div className="grand-total"><span>Total a receber</span><strong>R$ {total.toFixed(2).replace(".", ",")}</strong></div>
          <button className="payment-button" disabled={!cart.length} onClick={() => openDialog("payment")}><Icon name="wallet"/>Receber pagamento<span>F10</span></button>
          <div className="payment-hints"><span>PIX</span><span>Dinheiro</span><span>Cartão</span><span>Pagamento dividido</span></div>
          <button className="hold-sale" onClick={() => notify("Venda guardada para continuar depois.")}><Icon name="clock" size={17}/>Guardar venda</button>
        </aside>
      </div>
    </>
  );
}

function QuickServiceWorkspace({ openDialog, quickServices }: { openDialog: (dialog: "quick") => void; quickServices: QuickServiceConfig[] }) {
  const enabledServices = quickServices.filter((service) => service.active);
  return (
    <>
      <div className="module-heading">
        <div><p>Balcão express</p><h1>Serviço rápido</h1><span>Atenda sem exigir cadastro completo de cliente ou motocicleta.</span></div>
        <button className="primary-button" onClick={() => openDialog("quick")}><Icon name="plus" size={18}/>Novo serviço rápido</button>
      </div>
      <div className="quick-service-grid">
        {enabledServices.length ? enabledServices.map((service, index) => (
          <button key={service.id} onClick={() => openDialog("quick")}><span className={index === 0 ? "quick-service-number active" : "quick-service-number"}>{String(index + 1).padStart(2, "0")}</span><div><strong>{service.name}</strong><small>{service.duration} min · {service.productRequired ? service.productCategory : "Produto opcional"}</small></div><b>{formatBRL(service.laborPrice)}</b><Icon name="arrow" size={17}/></button>
        )) : <div className="no-results" style={{ gridColumn: "1 / -1", padding: "24px 16px", textAlign: "center" }}>Nenhum serviço rápido configurado. Adicione em Configurações.</div>}
      </div>
      <section className="panel module-panel">
        <div className="panel-header"><div><h2>Atendimentos de hoje</h2><p>Serviços concluídos diretamente no balcão</p></div><span className="status green"><i/>0 concluídos</span></div>
        <div className="table-scroll"><table><thead><tr><th>Horário</th><th>Serviço</th><th>Produto</th><th>Pagamento</th><th>Valor</th><th>Status</th></tr></thead><tbody>
          <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>Nenhum atendimento expresso realizado hoje.</td></tr>
        </tbody></table></div>
      </section>
    </>
  );
}

function FinanceWorkspace({
  openDialog,
  navigate,
  expenses,
  users,
  sales,
  orders,
}: {
  openDialog: OpenDialog;
  navigate: (destination: string) => void;
  expenses: ExpenseRecord[];
  users: UserConfig[];
  sales: SaleRecord[];
  orders: OrderRecord[];
}) {
  // grossRevenue, partsCost e cardRevenue eram constantes 0 escritas no código,
  // então o lucro líquido era sempre o negativo dos gastos.
  const summary = useMemo(() => financeSummary(sales, orders, expenses), [sales, orders, expenses]);
  const { grossTotal: grossRevenue, cardFees, paidExpenses, pendingExpenses, netProfit } = summary;
  const payrollPaid = expenses.filter((expense) => expense.status === "Pago" && expense.category === "Pagamento de funcionário").reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <>
      <div className="module-heading">
        <div><p>Controle financeiro</p><h1>Financeiro</h1><span>Caixa, recebimentos, pagamentos e gastos da oficina em um só lugar.</span></div>
        <div className="heading-actions"><button className="outline-button large" onClick={() => openDialog("cash")}>Abrir caixa</button><button className="primary-button" onClick={() => openDialog("expense")}><Icon name="plus" size={18}/>Adicionar gasto</button></div>
      </div>
      <div className="finance-kpi-grid">
        <button className="finance-kpi receive" onClick={() => navigate("Contas a receber")}><span className="finance-kpi-icon"><Icon name="arrow"/></span><div><small>Total a receber</small><strong>{formatBRL(summary.receivableTotal)}</strong><em>{summary.receivableTotal ? "Vendas e OS a prazo" : "Nenhum valor em aberto"}</em></div><Icon name="arrow" size={18}/></button>
        <button className="finance-kpi pay" onClick={() => navigate("Contas a pagar")}><span className="finance-kpi-icon"><Icon name="file"/></span><div><small>Total a pagar</small><strong>{formatBRL(pendingExpenses)}</strong><em>{expenses.filter((e) => e.status === "Agendado").length} contas agendadas</em></div><Icon name="arrow" size={18}/></button>
        <button className="finance-kpi balance" onClick={() => openDialog("cash")}><span className="finance-kpi-icon"><Icon name="wallet"/></span><div><small>Saldo disponível hoje</small><strong>{formatBRL(summary.cashBalance)}</strong><em>Recebido menos gastos pagos</em></div><Icon name="arrow" size={18}/></button>
      </div>
      <section className="finance-result-strip panel"><div className="result-strip-head"><div><small>Resultado real da oficina</small><h2>Lucro líquido estimado</h2></div><strong>{formatBRL(netProfit)}</strong></div><div className="result-breakdown"><span><small>Faturamento</small><b>{formatBRL(grossRevenue)}</b></span><span><small>Custo das peças</small><b>− {formatBRL(summary.partsCost)}</b></span><span><small>Gastos pagos</small><b>− {formatBRL(paidExpenses)}</b></span><span><small>Taxas de maquininha</small><b>− {formatBRL(cardFees)}</b></span></div><p>Considera vendas, custo das peças, gastos lançados, pagamentos de funcionários ({formatBRL(payrollPaid)}) e as taxas de maquininha já descontadas das vendas no cartão.</p></section>
      <div className="finance-body-grid">
        <section className="panel finance-movements">
          <div className="panel-header"><div><h2>Últimos gastos</h2><p>Lançamentos manuais e despesas agendadas</p></div><button className="outline-button" onClick={() => openDialog("expense")}>Novo gasto</button></div>
          <div className="table-scroll"><table><thead><tr><th>Gasto</th><th>Categoria</th><th>Pagamento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{expenses.length ? expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><span>{expense.id}{expense.order ? ` · ${expense.order}` : ""}</span></td><td>{expense.category}</td><td>{expense.method}<span>{expense.dueDate}</span></td><td><strong className="mono">{formatBRL(expense.amount)}</strong>{expense.charged ? <span className="margin-caption">Cobrado {formatBRL(expense.charged)}</span> : null}</td><td><span className={`status ${expense.status === "Pago" ? "green" : "amber"}`}><i/>{expense.status}</span></td></tr>) : <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>Nenhum gasto registrado no momento.</td></tr>}</tbody></table></div>
        </section>
        <aside className="panel finance-quick-actions">
          <div className="panel-header"><div><h2>Atalhos financeiros</h2><p>Operações mais usadas</p></div></div>
          <button onClick={() => openDialog("receivable")}><span className="quick-icon green"><Icon name="plus"/></span><div><strong>Nova conta a receber</strong><small>Cliente, parceiro ou crediário</small></div><Icon name="arrow" size={17}/></button>
          <button onClick={() => openDialog("payable")}><span className="quick-icon dark"><Icon name="file"/></span><div><strong>Nova conta a pagar</strong><small>Fornecedor ou despesa futura</small></div><Icon name="arrow" size={17}/></button>
          <button onClick={() => openDialog("expense")}><span className="quick-icon red"><Icon name="wallet"/></span><div><strong>Gasto rápido</strong><small>Pago agora ou agendado</small></div><Icon name="arrow" size={17}/></button>
        </aside>
      </div>
    </>
  );
}

function AccountsWorkspace({
  kind,
  openDialog,
  expenses,
  sales,
  orders,
}: {
  kind: "receber" | "pagar";
  openDialog: OpenDialog;
  expenses: ExpenseRecord[];
  sales: SaleRecord[];
  orders: OrderRecord[];
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("Todos");
  const isReceivable = kind === "receber";
  const records = useMemo(() => {
    // A receber saía sempre vazio; a pagar marcava tudo como "A vencer", então
    // uma conta vencida nunca aparecia como atrasada.
    if (isReceivable) return receivableEntries(sales, orders).map((entry) => ({
      id: entry.id,
      person: entry.person,
      description: `${entry.source} · ${entry.description}`,
      dueDate: entry.date,
      original: entry.total,
      open: entry.total,
      status: "A vencer",
    }));
    return payableEntries(expenses);
  }, [isReceivable, expenses, sales, orders]);
  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchesSearch = `${record.id} ${record.person} ${record.description}`.toLowerCase().includes(accountSearch.toLowerCase());
    const matchesStatus = accountFilter === "Todos" || record.status === accountFilter;
    return matchesSearch && matchesStatus;
  }), [records, accountSearch, accountFilter]);
  const total = useMemo(() => records.reduce((sum, record) => sum + record.open, 0), [records]);
  const overdue = useMemo(() => records.filter((record) => record.status === "Atrasado").reduce((sum, record) => sum + record.open, 0), [records]);
  const dueToday = useMemo(() => records.filter((record) => record.status === "Vence hoje").reduce((sum, record) => sum + record.open, 0), [records]);

  return (
    <>
      <div className="module-heading">
        <div><p>Financeiro</p><h1>Contas a {isReceivable ? "receber" : "pagar"}</h1><span>{isReceivable ? "Acompanhe crediário, parceiros e pagamentos parciais dos clientes." : "Controle fornecedores, despesas operacionais e compromissos agendados."}</span></div>
        <div className="heading-actions">{!isReceivable ? <button className="outline-button large" onClick={() => openDialog("expense")}>Adicionar gasto</button> : null}<button className="primary-button" onClick={() => openDialog(isReceivable ? "receivable" : "payable")}><Icon name="plus" size={18}/>Nova conta</button></div>
      </div>
      <div className="module-summary account-summary">
        <article><span>Total em aberto</span><strong>{formatBRL(total)}</strong><small>{records.length} {records.length === 1 ? "lançamento" : "lançamentos"}</small></article>
        <article className={overdue ? "summary-danger" : ""}><span>Vencido</span><strong>{formatBRL(overdue)}</strong><small>{overdue ? "Precisa de atenção" : "Nenhuma conta atrasada"}</small></article>
        <article><span>Vence hoje</span><strong>{formatBRL(dueToday)}</strong><small>{records.filter((record) => record.status === "Vence hoje").length} {records.filter((record) => record.status === "Vence hoje").length === 1 ? "lançamento" : "lançamentos"}</small></article>
      </div>
      <section className="panel module-panel">
        <div className="list-toolbar"><label className="mini-search"><Icon name="search" size={17}/><input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder={`Buscar ${isReceivable ? "cliente" : "fornecedor"}, descrição ou código`}/></label><div className="filter-pills">{["Todos", "A vencer", "Vence hoje", "Atrasado"].map((filter) => <button className={accountFilter === filter ? "selected" : ""} key={filter} onClick={() => setAccountFilter(filter)}>{filter}</button>)}</div></div>
        <div className="table-scroll"><table><thead><tr><th>{isReceivable ? "Cliente / Pagador" : "Fornecedor / Favorecido"}</th><th>Descrição</th><th>Vencimento</th><th>Valor original</th><th>Saldo</th><th>Status</th><th>Ação</th></tr></thead><tbody>{filteredRecords.length ? filteredRecords.map((record) => <tr key={record.id}><td><strong>{record.person}</strong><span className="mono">{record.id}</span></td><td><strong>{record.description}</strong><span>{isReceivable ? "Receita operacional" : "Despesa da oficina"}</span></td><td>{record.dueDate}</td><td className="mono">{formatBRL(record.original)}</td><td><strong className="mono">{formatBRL(record.open)}</strong></td><td><span className={`status ${record.status === "Atrasado" ? "red" : record.status === "Vence hoje" ? "amber" : "blue"}`}><i/>{record.status}</span></td><td><button className="account-action" onClick={() => openDialog(isReceivable ? "settleReceivable" : "settlePayable")}>{isReceivable ? "Receber" : "Pagar"}</button></td></tr>) : <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>Nenhuma conta {isReceivable ? "a receber" : "a pagar"} cadastrada no momento.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}

function TeamWorkspace({ users, setUsers, openDialog, notify }: { users: UserConfig[]; setUsers: React.Dispatch<React.SetStateAction<UserConfig[]>>; openDialog: OpenDialog; notify: (message: string) => void }) {
  const [teamFilter, setTeamFilter] = useState("Todos");
  const [teamSearch, setTeamSearch] = useState("");
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [selectedEmployeeForEdit, setSelectedEmployeeForEdit] = useState<UserConfig | null>(null);

  // Essas quatro derivações rodavam de novo em toda renderização de
  // TeamWorkspace — inclusive ao digitar em outro campo ou ao abrir o modal
  // de edição — mesmo quando a lista de usuários e os filtros não mudaram.
  const activeUsers = useMemo(() => users.filter((user) => user.active !== false), [users]);
  const activeMechanicsCount = useMemo(() => activeUsers.filter((user) => isMechanicUser(user)).length, [activeUsers]);
  const monthlyPayroll = useMemo(() => activeUsers.filter((user) => user.employmentType === "Fixo").reduce((sum, user) => sum + (user.baseSalary || 0), 0), [activeUsers]);
  const filteredUsers = useMemo(() => users.filter((user) => {
    const isMech = isMechanicUser(user);
    const matchesFilter = teamFilter === "Todos"
      || (teamFilter === "Mecânicos" && isMech)
      || (teamFilter === "Gestão" && user.canManageAllOrders)
      || (teamFilter === "Avulsos" && user.employmentType === "Avulso");
    const haystack = `${user.name} ${user.role} ${user.position} ${user.phone}`.toLowerCase();
    return matchesFilter && haystack.includes(teamSearch.toLowerCase());
  }), [users, teamFilter, teamSearch]);

  const handleEditEmployee = useCallback((emp: UserConfig) => {
    setSelectedEmployeeForEdit(emp);
    setIsEmployeeModalOpen(true);
  }, []);

  const handleAddEmployee = useCallback(() => {
    setSelectedEmployeeForEdit(null);
    setIsEmployeeModalOpen(true);
  }, []);

  const handleEmployeeSaved = useCallback((saved: UserConfig) => {
    setUsers((current) => {
      const idx = current.findIndex((u) => u.id === saved.id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = saved;
        return next;
      }
      return [...current, saved];
    });
  }, [setUsers]);

  return (
    <>
      <div className="module-heading">
        <div><p>Equipe da oficina</p><h1>Funcionários e pagamentos</h1><span>Controle quem é fixo ou avulso, o salário padrão e a carga de OS.</span></div>
        <div className="heading-actions">
          <button className="outline-button large" onClick={() => openDialog("expense")}><Icon name="wallet" size={16}/>Registrar pagamento</button>
          <button className="primary-button" onClick={handleAddEmployee}><Icon name="plus" size={18}/>Adicionar funcionário</button>
        </div>
      </div>
      <div className="module-summary">
        <article><span>Equipe ativa</span><strong>{activeUsers.length}</strong><small>{activeMechanicsCount} mecânico(s) apto(s) para OS</small></article>
        <article><span>Folha mensal padrão</span><strong>{formatBRL(monthlyPayroll)}</strong><small>{users.filter((user) => user.employmentType === "Fixo" && (!user.baseSalary || user.baseSalary === 0)).length} salários ainda precisam ser definidos</small></article>
        <article><span>Tipo de vínculo</span><strong>{users.filter((user) => user.employmentType === "Fixo").length} + {users.filter((user) => user.employmentType === "Avulso").length}</strong><small>Fixos + avulsos</small></article>
      </div>
      <section className="panel module-panel">
        <div className="list-toolbar"><label className="mini-search"><Icon name="search" size={17}/><input value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Buscar funcionário, telefone ou função"/></label><div className="filter-pills">{["Todos", "Mecânicos", "Gestão", "Avulsos"].map((filter) => <button className={teamFilter === filter ? "selected" : ""} key={filter} onClick={() => setTeamFilter(filter)}>{filter}</button>)}</div></div>
        <div className="team-list">{filteredUsers.length ? filteredUsers.map((user) => {
          const isMech = isMechanicUser(user);
          const status = user.active !== false ? (user.currentOrders ? "Trabalhando" : "Disponível") : "Inativo";
          return <article className="team-row" key={user.id}>
            <span className="team-avatar">{user.name.split(" ").slice(0, 2).map((part) => part[0]).join("") || "FN"}<i/></span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.position} {user.isResponsibleMechanic ? "• Responsável" : isMech ? "• Mecânico" : ""} · {user.employmentType}</small>
            </span>
            <span>
              <b>Atividade</b>
              <small>{isMech ? `${user.currentOrders || 0} OS em andamento` : user.canManageAllOrders ? "Acesso a toda operação" : "Atendimento"}</small>
            </span>
            <label className="team-salary">
              <b>Salário padrão</b>
              <span className="salary-val">{formatBRL(user.baseSalary || 0)}</span>
              <small>Dia {String(user.paymentDay || 5).padStart(2, "0")}</small>
            </label>
            <span className={`status ${status === "Disponível" ? "green" : status === "Inativo" ? "red" : "blue"}`}><i/>{status}</span>
            <button className="row-button" onClick={() => handleEditEmployee(user)} aria-label={`Editar ${user.name}`}><Icon name="arrow" size={17}/></button>
          </article>;
        }) : <div className="no-results" style={{ padding: "32px 16px", textAlign: "center" }}>Nenhum funcionário encontrado.</div>}</div>
      </section>

      <Suspense fallback={null}>
        <EmployeeFormModal
          isOpen={isEmployeeModalOpen}
          onClose={() => { setIsEmployeeModalOpen(false); setSelectedEmployeeForEdit(null); }}
          onSaved={handleEmployeeSaved}
          editingEmployee={selectedEmployeeForEdit}
          notify={notify}
          allEmployees={users}
        />
      </Suspense>
    </>
  );
}

const accessPermissionGroups: Array<{
  title: string;
  detail: string;
  permissions: Array<{ key: FirebasePermission; label: string; help: string }>;
}> = [
  {
    title: "Oficina e ordens de serviço",
    detail: "Controle separado para consultar, abrir e atualizar OS.",
    permissions: [
      { key: "orders.view", label: "Ver ordens de serviço", help: "Consulta OS, clientes, motos e andamento." },
      { key: "orders.create", label: "Abrir nova OS", help: "Permite criar OS rápida ou completa." },
      { key: "orders.update", label: "Atualizar OS atribuídas", help: "Muda situação e marca o serviço como pronto." },
      { key: "budgets.view", label: "Ver orçamentos", help: "Consulta propostas e aprovações." },
    ],
  },
  {
    title: "Balcão e atendimento",
    detail: "Acesso ao caixa de vendas e aos atendimentos expressos.",
    permissions: [
      { key: "pos.use", label: "Usar o PDV", help: "Abre vendas, recebe valores e fecha o balcão." },
      { key: "quickService.use", label: "Fazer serviço rápido", help: "Troca de óleo e serviços sem OS completa." },
    ],
  },
  {
    title: "Cadastros e estoque",
    detail: "Separe a consulta da permissão para alterar dados.",
    permissions: [
      { key: "inventory.view", label: "Consultar produtos e estoque", help: "Visualiza peças, preços e saldo." },
      { key: "inventory.manage", label: "Alterar estoque e fornecedores", help: "Cadastra produtos, compras e movimentações." },
      { key: "customers.view", label: "Consultar clientes e motos", help: "Visualiza dados e histórico de atendimento." },
      { key: "customers.manage", label: "Cadastrar clientes e motos", help: "Cria e edita os cadastros." },
      { key: "team.view", label: "Ver equipe da oficina", help: "Consulta mecânicos ao distribuir uma OS." },
    ],
  },
  {
    title: "Financeiro",
    detail: "Valores da oficina ficam bloqueados para quem não tiver acesso.",
    permissions: [
      { key: "finance.view", label: "Ver valores e relatórios", help: "Consulta caixa, contas e lucro." },
      { key: "finance.manage", label: "Lançar e receber valores", help: "Registra gastos, pagamentos e baixas." },
    ],
  },
];

type AccessDialogMode = "create" | "edit" | "password" | "delete" | null;
type AccessUserForm = ManagedUserInput & { password: string };

const emptyAccessForm = (): AccessUserForm => ({
  name: "",
  email: "",
  phone: "",
  role: "Mecânico",
  employeeId: "",
  active: true,
  permissions: defaultFirebasePermissions("Mecânico"),
  password: String(Math.floor(100000 + Math.random() * 900000)),
});

function UserAccessWorkspace({
  currentUser,
  firebaseConnected,
  employees,
  notify,
  openFirebaseAccess,
}: {
  currentUser: FirebaseUserSummary | null;
  firebaseConnected: boolean;
  employees: UserConfig[];
  notify: (message: string) => void;
  openFirebaseAccess: () => void;
}) {
  const [managedUsers, setManagedUsers] = useState<FirebaseManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [sourceMode, setSourceMode] = useState<"checking" | "cloud" | "fallback" | "error">("checking");
  const [dialogMode, setDialogMode] = useState<AccessDialogMode>(null);
  const [selectedUser, setSelectedUser] = useState<FirebaseManagedUser | null>(null);
  const [form, setForm] = useState<AccessUserForm>(emptyAccessForm);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Ativos");
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

  const refreshUsers = useCallback(async () => {
    if (!firebaseConnected) return;
    setLoading(true);
    setError("");
    setSourceMode("checking");
    try {
      const result = await listManagedUsers();
      setManagedUsers(result.users);
      setSourceMode(result.mode);
    } catch (loadError) {
      setSourceMode("error");
      setError(firebaseErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [firebaseConnected]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshUsers]);

  const openCreate = () => {
    setSelectedUser(null);
    setForm(emptyAccessForm());
    setDialogError("");
    setDialogMode("create");
  };
  const openEdit = (user: FirebaseManagedUser) => {
    setSelectedUser(user);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      employeeId: user.employeeId,
      active: user.hasAccessProfile ? user.active : true,
      permissions: user.permissions.length ? user.permissions : defaultFirebasePermissions(user.role, user.employeeId),
      password: "",
    });
    setDialogError("");
    setDialogMode("edit");
  };
  const openPassword = (user: FirebaseManagedUser) => {
    setSelectedUser(user);
    setForm((current) => ({ ...current, password: emptyAccessForm().password }));
    setDialogError("");
    setDialogMode("password");
  };
  const openDelete = (user: FirebaseManagedUser) => {
    setSelectedUser(user);
    setDialogError("");
    setDialogMode("delete");
  };
  const closeDialog = () => { if (!busy) { setDialogMode(null); setSelectedUser(null); setDialogError(""); } };
  const copyText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    notify(message);
  };
  const togglePermission = (permission: FirebasePermission) => {
    if (form.role === "Super Admin") return;
    setForm((current) => {
      const removing = current.permissions.includes(permission);
      let next = removing ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission];
      if (!removing && permission === "orders.create") next = Array.from(new Set([...next, "orders.view", "inventory.view", "customers.view", "team.view"]));
      if (!removing && permission === "inventory.manage") next = Array.from(new Set([...next, "inventory.view"]));
      if (!removing && permission === "customers.manage") next = Array.from(new Set([...next, "customers.view"]));
      if (!removing && permission === "finance.manage") next = Array.from(new Set([...next, "finance.view"]));
      if (removing && permission === "orders.view") next = next.filter((item) => item !== "orders.create" && item !== "orders.update");
      if (removing && permission === "inventory.view") next = next.filter((item) => item !== "inventory.manage" && item !== "orders.create");
      if (removing && permission === "customers.view") next = next.filter((item) => item !== "customers.manage" && item !== "orders.create");
      if (removing && permission === "finance.view") next = next.filter((item) => item !== "finance.manage");
      return { ...current, permissions: next };
    });
  };

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) return setDialogError("Informe o nome e o e-mail do usuário.");
    if (dialogMode === "create" && !/^\d{6}$/.test(form.password)) return setDialogError("A senha temporária precisa ter exatamente 6 números.");
    setBusy(true);
    setDialogError("");
    try {
      if (dialogMode === "create") {
        const result = await createManagedUser({ ...form, phone: formatPhone(form.phone) });
        setCredentials({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password });
        notify(result.mode === "cloud" ? "Usuário criado no Authentication e liberado no sistema." : "Usuário criado e liberado no sistema.");
      } else if (dialogMode === "edit" && selectedUser) {
        const result = await updateManagedUser(selectedUser.uid, { ...form, phone: formatPhone(form.phone) });
        notify(!selectedUser.hasAccessProfile ? "Conta do Authentication vinculada e acesso liberado." : result.mode === "cloud" ? "Usuário e permissões atualizados." : "Perfil e permissões atualizados no Firestore.");
      }
      setDialogMode(null);
      setSelectedUser(null);
      await refreshUsers();
    } catch (saveError) {
      setDialogError(firebaseErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!selectedUser || !/^\d{6}$/.test(form.password)) return setDialogError("A senha temporária precisa ter exatamente 6 números.");
    setBusy(true);
    setDialogError("");
    try {
      const result = await setManagedUserPassword(selectedUser.uid, selectedUser.email, form.password);
      if (result.mode === "reset-email") notify(`Link para criar uma nova senha enviado para ${selectedUser.email}.`);
      else {
        setCredentials({ name: selectedUser.name, email: selectedUser.email, password: form.password });
        notify("Senha temporária alterada e sessões anteriores encerradas.");
      }
      setDialogMode(null);
      setSelectedUser(null);
    } catch (passwordError) {
      setDialogError(firebaseErrorMessage(passwordError));
    } finally {
      setBusy(false);
    }
  };

  const toggleUser = async (user: FirebaseManagedUser) => {
    if (!user.hasAccessProfile) return openEdit(user);
    if (user.uid === currentUser?.uid && user.active) return notify("Você não pode desativar a própria conta.");
    const otherAdmins = managedUsers.filter((item) => item.uid !== user.uid && item.active && item.role === "Super Admin");
    if (user.role === "Super Admin" && user.active && !otherAdmins.length) return notify("Mantenha pelo menos outro Super Admin ativo.");
    setBusy(true);
    setError("");
    try {
      const result = await updateManagedUser(user.uid, { name: user.name, email: user.email, phone: user.phone, role: user.role, employeeId: user.employeeId, active: !user.active, permissions: user.permissions });
      notify(`${user.name} foi ${user.active ? "desativado" : "ativado"}.${result.mode === "fallback" ? " A permissão do sistema já foi atualizada." : ""}`);
      await refreshUsers();
    } catch (toggleError) {
      setError(firebaseErrorMessage(toggleError));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async () => {
    if (!selectedUser) return;
    if (selectedUser.uid === currentUser?.uid) return setDialogError("Você não pode apagar a própria conta.");
    const otherAdmins = managedUsers.filter((item) => item.uid !== selectedUser.uid && item.active && item.role === "Super Admin");
    if (selectedUser.role === "Super Admin" && selectedUser.active && !otherAdmins.length) return setDialogError("Cadastre outro Super Admin ativo antes de apagar este usuário.");
    setBusy(true);
    setDialogError("");
    try {
      const result = await deleteManagedUser(selectedUser.uid);
      notify(result.mode === "cloud" ? "Usuário apagado do sistema e do Firebase Authentication." : "Acesso removido do sistema.");
      setDialogMode(null);
      setSelectedUser(null);
      await refreshUsers();
    } catch (deleteError) {
      setDialogError(firebaseErrorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  };

  if (!firebaseConnected) return (
    <>
      <div className="module-heading"><div><p>Administração</p><h1>Usuários e acessos</h1><span>Crie logins, altere perfis e controle quem pode entrar no sistema.</span></div></div>
      <section className="panel access-activation"><span className="access-lock"><Icon name="shield" size={28}/></span><div><small>Firebase necessário</small><h2>Entre como Super Admin para gerenciar usuários</h2><p>Os funcionários são criados no Firebase Authentication e vinculados ao perfil de acesso da oficina.</p></div><button className="primary-button" onClick={openFirebaseAccess}><Icon name="shield" size={17}/>Conectar Firebase</button></section>
    </>
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = managedUsers.filter((user) => {
    const matchesSearch = `${user.name} ${user.email} ${user.phone} ${user.employeeId}`.toLowerCase().includes(normalizedSearch);
    const matchesRole = roleFilter === "Todos" || user.role === roleFilter;
    const matchesStatus = statusFilter === "Todos"
      || (statusFilter === "Ativos" && user.hasAccessProfile && user.active)
      || (statusFilter === "Sem perfil" && !user.hasAccessProfile)
      || (statusFilter === "Inativos" && user.hasAccessProfile && !user.active);
    return matchesSearch && matchesRole && matchesStatus;
  });
  const activeUsers = managedUsers.filter((user) => user.hasAccessProfile && user.active);
  const authenticationUsers = managedUsers.filter((user) => user.hasAuthAccount);
  const waitingProfile = managedUsers.filter((user) => user.hasAuthAccount && !user.hasAccessProfile);

  return (
    <>
      <div className="module-heading">
        <div><p>Administração</p><h1>Usuários e acessos</h1><span>Contas do Authentication, vínculos e permissões individuais em um só lugar.</span></div>
        <div className="heading-actions"><button className="outline-button large" onClick={() => void refreshUsers()} disabled={loading}><Icon name="clock" size={16}/>{loading ? "Sincronizando..." : "Sincronizar Authentication"}</button><button className="primary-button" onClick={openCreate}><Icon name="plus" size={18}/>Criar usuário</button></div>
      </div>

      <div className="module-summary access-summary">
        <article><span>{sourceMode === "cloud" ? "Contas no Authentication" : "Perfis encontrados"}</span><strong>{sourceMode === "cloud" ? authenticationUsers.length : managedUsers.length}</strong><small>{sourceMode === "cloud" ? "Importadas automaticamente do Firebase" : "Acessos disponíveis no Firestore"}</small></article>
        <article><span>Acessos liberados</span><strong>{activeUsers.length}</strong><small>{activeUsers.filter((user) => user.role === "Super Admin").length} Super Admin · {activeUsers.filter((user) => user.role !== "Super Admin").length} equipe</small></article>
        <article className={waitingProfile.length ? "summary-danger" : ""}><span>Aguardando configuração</span><strong>{waitingProfile.length}</strong><small>{waitingProfile.length ? "Contas existentes ainda sem perfil de acesso" : "Todas as contas estão configuradas"}</small></article>
      </div>

      {credentials ? <section className="access-credentials-banner"><span><Icon name="check" size={19}/></span><div><small>Credenciais temporárias prontas</small><strong>{credentials.name} · {credentials.email}</strong><p>Senha: <b>{credentials.password}</b> · entregue ao funcionário por um canal seguro.</p></div><button onClick={() => void copyText(`E-mail: ${credentials.email}\nSenha temporária: ${credentials.password}`, "Credenciais copiadas.")}>Copiar credenciais</button><button className="credentials-close" aria-label="Fechar aviso" onClick={() => setCredentials(null)}>×</button></section> : null}
      {sourceMode === "checking" ? <div className="auth-sync-state checking"><Icon name="clock" size={17}/><span>Consultando as contas do Firebase Authentication...</span></div> : sourceMode === "fallback" ? <div className="access-mode-note"><Icon name="alert" size={17}/><span>O backend administrativo ainda não está configurado neste ambiente. Por segurança, o sistema carregou apenas os perfis já liberados no Firestore. Configure a variável FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON para trazer também as contas sem perfil.</span></div> : sourceMode === "cloud" ? <div className="auth-sync-state"><Icon name="check" size={17}/><span>Authentication sincronizado: contas novas ou antigas aparecem automaticamente nesta lista.</span></div> : null}
      {error ? <div className="firebase-error access-error"><Icon name="alert" size={17}/><span>{error}</span></div> : null}

      <section className="panel module-panel access-panel">
        <div className="list-toolbar access-toolbar"><label className="mini-search"><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, telefone ou funcionário"/></label><div className="access-filters"><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar por perfil"><option>Todos</option><option>Super Admin</option><option>Balcão</option><option>Mecânico</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por situação"><option>Ativos</option><option>Sem perfil</option><option>Inativos</option><option>Todos</option></select></div></div>
        <div className="table-scroll">
          <table className="access-table">
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Funcionário</th><th>Permissões</th><th>Último acesso</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{loading && !managedUsers.length ? <tr><td colSpan={7}><div className="access-empty">Buscando contas do Authentication...</div></td></tr> : filteredUsers.length ? filteredUsers.map((user) => {
              const employee = employees.find((item) => item.id === user.employeeId);
              const initials = user.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const lastAccess = user.lastSignInAt ? new Date(user.lastSignInAt) : null;
              return <tr key={user.uid} className={user.hasAccessProfile && !user.active ? "access-inactive" : ""}>
                <td><div className="access-user-cell"><span className="registry-avatar">{initials || "US"}</span><div><strong>{user.name}{user.uid === currentUser?.uid ? <em>Você</em> : null}{!user.hasAccessProfile ? <em className="auth-only">Authentication</em> : null}</strong><small>{user.email || "E-mail não informado"}{user.phone ? ` · ${user.phone}` : ""}</small></div></div></td>
                <td>{user.hasAccessProfile ? <span className={`access-role ${user.role === "Super Admin" ? "admin" : user.role === "Balcão" ? "counter" : "mechanic"}`}>{user.role}</span> : <span className="access-role pending">Definir perfil</span>}</td>
                <td><strong>{employee?.name || user.employeeId || "Não vinculado"}</strong><span>{employee?.position || (user.employeeId ? "Cadastro da equipe" : "Acesso independente")}</span></td>
                <td><strong>{user.hasAccessProfile ? user.role === "Super Admin" ? "Acesso total" : `${user.permissions.length} permissões` : "Nenhuma ainda"}</strong><span>{user.permissions.includes("orders.create") && user.hasAccessProfile ? "Pode abrir OS" : "Não abre nova OS"}</span></td>
                <td><strong>{lastAccess && !Number.isNaN(lastAccess.getTime()) ? lastAccess.toLocaleDateString("pt-BR") : "Ainda não acessou"}</strong><span>{lastAccess && !Number.isNaN(lastAccess.getTime()) ? lastAccess.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Senha temporária"}</span></td>
                <td>{user.hasAccessProfile ? <button className={`access-status ${user.active ? "active" : "inactive"}`} disabled={busy} onClick={() => void toggleUser(user)}><i/>{user.active ? "Ativo" : "Inativo"}</button> : <button className="access-status pending" onClick={() => openEdit(user)}><i/>Sem acesso</button>}</td>
                <td><div className="access-actions"><button onClick={() => openEdit(user)}>{user.hasAccessProfile ? "Editar" : "Liberar"}</button><button onClick={() => openPassword(user)}>Senha</button><button className="danger" disabled={user.uid === currentUser?.uid} title={user.uid === currentUser?.uid ? "Você não pode apagar a própria conta" : "Apagar usuário"} onClick={() => openDelete(user)}>Apagar</button></div></td>
              </tr>;
            }) : <tr><td colSpan={7}><div className="access-empty"><Icon name="users" size={24}/><strong>Nenhum usuário encontrado</strong><span>{sourceMode === "fallback" ? "Nenhum perfil foi encontrado no Firestore. Configure o Firebase Admin no ambiente para importar as contas do Authentication." : "Altere os filtros ou sincronize o Authentication."}</span></div></td></tr>}</tbody>
          </table>
        </div>
      </section>

      {dialogMode ? <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
        <section className={`dialog access-dialog ${(dialogMode === "create" || dialogMode === "edit") ? "access-dialog-wide" : ""} ${dialogMode === "delete" ? "access-delete-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="access-dialog-title">
          <header className="dialog-header"><div><span>Usuários e acessos</span><h2 id="access-dialog-title">{dialogMode === "create" ? "Criar novo usuário" : dialogMode === "edit" ? !selectedUser?.hasAccessProfile ? `Liberar acesso de ${selectedUser?.name}` : `Editar ${selectedUser?.name}` : dialogMode === "password" ? "Alterar senha temporária" : "Apagar usuário"}</h2><p>{dialogMode === "create" ? "A conta será criada no Authentication e vinculada à oficina." : dialogMode === "edit" ? !selectedUser?.hasAccessProfile ? "A conta já existe no Authentication. Defina o funcionário, o perfil e exatamente o que poderá acessar." : "Atualize os dados e marque exatamente o que este usuário pode acessar." : dialogMode === "password" ? "Use uma senha provisória de 6 números." : "Esta ação remove o acesso e a conta do funcionário."}</p></div><button aria-label="Fechar" onClick={closeDialog}>×</button></header>

          {dialogMode === "create" || dialogMode === "edit" ? <div className="dialog-body form-section access-form">
            {dialogMode === "edit" && selectedUser && !selectedUser.hasAccessProfile ? <div className="auth-existing-account"><Icon name="check" size={18}/><div><strong>Conta encontrada no Firebase Authentication</strong><small>Ao salvar, o sistema criará o perfil de acesso usando o mesmo UID desta conta.</small></div></div> : null}
            <div className="form-grid">
              <label className="field field-full"><span>Nome completo</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome do funcionário" autoFocus/></label>
              <label className="field"><span>E-mail de acesso</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="nome@picapau.com"/></label>
              <label className="field"><span>WhatsApp / telefone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })} placeholder="(34) 99999-9999"/></label>
              <label className="field"><span>Perfil de acesso</span><select value={form.role} onChange={(event) => { const role = event.target.value as FirebaseAccessProfile["role"]; setForm({ ...form, role, permissions: defaultFirebasePermissions(role, form.employeeId) }); }}><option>Super Admin</option><option>Balcão</option><option>Mecânico</option></select></label>
              <label className="field"><span>Vincular ao funcionário</span><select value={form.employeeId} onChange={(event) => { const employeeId = event.target.value; const required = defaultFirebasePermissions(form.role, employeeId); setForm({ ...form, employeeId, permissions: employeeId === "USR-003" ? Array.from(new Set([...form.permissions, ...required])) : form.permissions }); }}><option value="">Sem vínculo</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name} · {employee.position}</option>)}</select></label>
              {dialogMode === "create" ? <label className="field field-full"><span>Senha temporária de 6 números</span><div className="password-builder"><input inputMode="numeric" maxLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: onlyDigits(event.target.value).slice(0, 6) })}/><button onClick={() => setForm({ ...form, password: emptyAccessForm().password })}>Gerar outra</button><button onClick={() => void copyText(form.password, "Senha copiada.")}>Copiar</button></div><small className="field-help">Entregue essa senha ao funcionário. Ele poderá usá-la no primeiro acesso.</small></label> : null}
            </div>
            <label className="toggle-row"><input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })}/><span/><div><strong>Usuário ativo</strong><small>Pode entrar no sistema e usar somente as permissões marcadas abaixo.</small></div></label>
            <div className="permission-editor">
              <div className="permission-editor-head"><div><span className="form-eyebrow">Controle individual</span><h3>O que este usuário pode acessar?</h3><p>O Ronaldo pode receber “Abrir nova OS”; os demais mecânicos podem ficar apenas com consulta e atualização das OS atribuídas.</p></div>{form.role !== "Super Admin" ? <button onClick={() => setForm({ ...form, permissions: defaultFirebasePermissions(form.role, form.employeeId) })}>Aplicar padrão do perfil</button> : null}</div>
              {form.role === "Super Admin" ? <div className="permission-admin-all"><Icon name="shield" size={20}/><div><strong>Acesso completo</strong><small>Super Admin possui automaticamente todos os módulos, configurações e gestão de usuários.</small></div></div> : <div className="permission-groups">{accessPermissionGroups.map((group) => <section key={group.title}><header><div><strong>{group.title}</strong><small>{group.detail}</small></div><b>{group.permissions.filter((permission) => form.permissions.includes(permission.key)).length}/{group.permissions.length}</b></header><div>{group.permissions.map((permission) => <label className="permission-row" key={permission.key}><input type="checkbox" checked={form.permissions.includes(permission.key)} onChange={() => togglePermission(permission.key)}/><span><i/></span><div><strong>{permission.label}</strong><small>{permission.help}</small></div>{permission.key === "orders.create" && form.employeeId === "USR-003" ? <em>Ronaldo</em> : null}</label>)}</div></section>)}</div>}
            </div>
          </div> : null}

          {dialogMode === "password" ? <div className="dialog-body access-password-body"><div className="access-selected-user"><span className="registry-avatar">{selectedUser?.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span><div><strong>{selectedUser?.name}</strong><small>{selectedUser?.email}</small></div></div><label className="field"><span>Nova senha temporária</span><div className="password-builder"><input autoFocus inputMode="numeric" maxLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: onlyDigits(event.target.value).slice(0, 6) })}/><button onClick={() => setForm({ ...form, password: emptyAccessForm().password })}>Gerar outra</button><button onClick={() => void copyText(form.password, "Senha copiada.")}>Copiar</button></div></label><div className="info-strip"><Icon name="shield" size={18}/><span>Ao salvar, as sessões anteriores serão encerradas. Se as funções administrativas ainda não estiverem publicadas, o Firebase enviará um link de redefinição por e-mail.</span></div></div> : null}

          {dialogMode === "delete" ? <div className="dialog-body access-delete-body"><span className="delete-user-icon"><Icon name="alert" size={25}/></span><div><h3>Apagar {selectedUser?.name}?</h3><p>O usuário perderá o acesso imediatamente. O cadastro de funcionário e o histórico das OS serão preservados.</p><strong>{selectedUser?.email}</strong></div></div> : null}
          {dialogError ? <div className="firebase-error access-dialog-error"><Icon name="alert" size={17}/><span>{dialogError}</span></div> : null}
          <footer className="dialog-footer"><button className="ghost-button" onClick={closeDialog} disabled={busy}>Cancelar</button><button className={dialogMode === "delete" ? "danger-button" : "primary-button"} disabled={busy} onClick={() => void (dialogMode === "delete" ? removeUser() : dialogMode === "password" ? changePassword() : saveUser())}>{busy ? "Salvando..." : dialogMode === "delete" ? "Apagar usuário" : dialogMode === "password" ? "Alterar senha" : dialogMode === "create" ? "Criar usuário" : "Salvar alterações"}</button></footer>
        </section>
      </div> : null}
    </>
  );
}

/**
 * Painel /admin: uma tela só, com o estado real do sistema e o caminho direto
 * para cada grupo de configuração.
 *
 * A versão anterior era fachada — "Erasmo, Rayane e equipe da oficina",
 * "6 usuários", "12 alertas", "Último backup Hoje, 02:15" eram textos fixos no
 * código, e os seis cartões caíam todos na mesma tela de Configurações. Agora
 * cada número vem dos dados e cada cartão abre a aba certa.
 */
function AdminWorkspace({
  navigate,
  openSettings,
  settings,
  users,
  products,
  orders,
  clients,
  motorcycles,
  sales,
  expenses,
  categories,
  quickServices,
  partners,
  paymentMachines,
  paymentMethods,
  suppliers,
}: {
  navigate: (destination: string) => void;
  openSettings: (tab: SettingsTab) => void;
  settings: Partial<SettingsConfig> | null;
  users: UserConfig[];
  products: ProductRecord[];
  orders: OrderRecord[];
  clients: ClientRecord[];
  motorcycles: MotorcycleRecord[];
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  categories: CategoryConfig[];
  quickServices: QuickServiceConfig[];
  partners: PartnerConfig[];
  paymentMachines: PaymentMachineConfig[];
  paymentMethods: PaymentMethodConfig[];
  suppliers: SupplierConfig[];
}) {
  const summary = useMemo(() => financeSummary(sales, orders, expenses), [sales, orders, expenses]);
  const activeUsers = users.filter((user) => user.active !== false);
  const lowStock = products.filter((product) => product.stock <= product.minimum);
  const openOrders = orders.filter((order) => !order.closed && order.status !== "Entrega");
  const activeMethods = paymentMethods.filter((method) => method.active);
  const activeMachines = paymentMachines.filter((machine) => machine.active);
  const activeQuickServices = quickServices.filter((service) => service.active);
  const activePartners = partners.filter((partner) => partner.active);
  const osPrefix = settings?.osPrefix || "OS";

  // O que ainda falta configurar para a oficina operar sem tropeço. Substitui o
  // selo "Sistema funcionando normalmente", que estava sempre verde.
  const pending = [
    !settings?.workshopName ? { label: "Dados da oficina", tab: "general" as SettingsTab } : null,
    !activeMethods.length ? { label: "Formas de pagamento", tab: "payments" as SettingsTab } : null,
    !categories.length ? { label: "Categorias", tab: "categories" as SettingsTab } : null,
    !activeQuickServices.length ? { label: "Serviços rápidos", tab: "services" as SettingsTab } : null,
  ].filter((item): item is { label: string; tab: SettingsTab } => item !== null);

  const sections: Array<{ icon: IconName; title: string; text: string; badge: string; onOpen: () => void }> = [
    {
      icon: "users", title: "Usuários e acessos",
      text: "Contas, perfis e permissões de cada funcionário",
      badge: `${activeUsers.length} de ${users.length} ativo${users.length === 1 ? "" : "s"}`,
      onOpen: () => navigate("Usuários e acessos"),
    },
    {
      icon: "wrench", title: "Oficina e OS",
      text: "Dados da oficina, numeração das OS, garantia e prazos",
      badge: `Prefixo ${osPrefix} · próxima ${orders.length + 1}`,
      onOpen: () => openSettings("general"),
    },
    {
      icon: "wallet", title: "Pagamentos e taxas",
      text: "Formas de recebimento, maquininhas e taxas por bandeira",
      badge: `${activeMethods.length} forma${activeMethods.length === 1 ? "" : "s"} · ${activeMachines.length} maquininha${activeMachines.length === 1 ? "" : "s"}`,
      onOpen: () => openSettings("payments"),
    },
    {
      icon: "clock", title: "Serviços rápidos",
      text: "Atendimentos expressos com preço de mão de obra fixo",
      badge: `${activeQuickServices.length} ativo${activeQuickServices.length === 1 ? "" : "s"}`,
      onOpen: () => openSettings("services"),
    },
    {
      icon: "box", title: "Estoque e reposição",
      text: "Estoque mínimo, unidades, markup e regras de venda",
      badge: lowStock.length ? `${lowStock.length} item(ns) em alerta` : "Estoque regularizado",
      onOpen: () => openSettings("stock"),
    },
    {
      icon: "file", title: "Categorias",
      text: "Categorias de serviços, produtos e despesas",
      badge: `${categories.length} cadastrada${categories.length === 1 ? "" : "s"}`,
      onOpen: () => openSettings("categories"),
    },
    {
      icon: "users", title: "Parceiros e frotas",
      text: "Empresas que encaminham motos e o desconto de cada uma",
      badge: `${activePartners.length} ativo${activePartners.length === 1 ? "" : "s"}`,
      onOpen: () => openSettings("partners"),
    },
    {
      icon: "printer", title: "Impressão e WhatsApp",
      text: "Cupom térmico, vias impressas e mensagem padrão",
      badge: settings?.thermalPrinter || "Não configurada",
      onOpen: () => openSettings("print"),
    },
    {
      icon: "box", title: "Fornecedores",
      text: "Contatos, prazos e condições de compra",
      badge: `${suppliers.filter((supplier) => supplier.active).length} ativo${suppliers.filter((supplier) => supplier.active).length === 1 ? "" : "s"}`,
      onOpen: () => navigate("Fornecedores"),
    },
  ];

  return (
    <>
      <div className="module-heading">
        <div><p>Administração</p><h1>Painel administrativo</h1><span>O estado do sistema e todas as configurações, agrupadas pelo que você quer resolver.</span></div>
        {pending.length
          ? <span className="system-healthy pending"><i/><b>{pending.length} item(ns) a configurar</b></span>
          : <span className="system-healthy"><i/><b>Configuração completa</b></span>}
      </div>

      {pending.length ? (
        <div className="admin-pending" role="status">
          <Icon name="alert" size={18}/>
          <div>
            <strong>Falta configurar antes de usar no dia a dia</strong>
            <small>Sem isso, algumas telas abrem sem opção para escolher.</small>
          </div>
          <div className="admin-pending-actions">
            {pending.map((item) => (
              <button key={item.label} onClick={() => openSettings(item.tab)}>{item.label}</button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="admin-overview">
        <section className="admin-welcome">
          <span className="admin-shield">PP</span>
          <div>
            <small>Ambiente principal</small>
            <h2>{settings?.workshopName || "Pica Pau Motos"}</h2>
            <p>{[settings?.cnpj, settings?.phone, settings?.address].filter(Boolean).join(" · ") || "Complete os dados da oficina em Oficina e OS"}</p>
          </div>
          <button onClick={() => openSettings("general")}>Editar dados</button>
        </section>
        <div className="admin-mini-stats">
          <article>
            <span>OS em aberto</span>
            <strong>{openOrders.length}</strong>
            <small>{summary.closedOrders} encerrada{summary.closedOrders === 1 ? "" : "s"}</small>
          </article>
          <article>
            <span>Recebido hoje</span>
            <strong>{formatBRL(summary.receivedToday)}</strong>
            <small>{summary.salesTodayCount} movimentação(ões)</small>
          </article>
          <article>
            <span>Cadastros</span>
            <strong>{clients.length} cliente{clients.length === 1 ? "" : "s"}</strong>
            <small>{motorcycles.length} moto(s) · {products.length} produto(s)</small>
          </article>
          <article>
            <span>Estoque em alerta</span>
            <strong>{lowStock.length}</strong>
            <small>{products.filter((product) => product.stock === 0).length} zerado(s)</small>
          </article>
        </div>
      </div>

      <div className="settings-grid">{sections.map((section) => (
        <button key={section.title} onClick={section.onOpen}>
          <span className="setting-icon"><Icon name={section.icon}/></span>
          <div><strong>{section.title}</strong><small>{section.text}</small></div>
          <b>{section.badge}</b>
          <Icon name="arrow" size={17}/>
        </button>
      ))}</div>
    </>
  );
}

function ModuleWorkspace({
  active,
  canOperate,
  canCreateOrders,
  firebaseConnected,
  currentFirebaseUser,
  openFirebaseAccess,
  openDialog,
  notify,
  navigate,
  expenses,
  users,
  setUsers,
  partners,
  setPartners,
  quickServices,
  setQuickServices,
  categories,
  setCategories,
  suppliers,
  setSuppliers,
  paymentMachines,
  setPaymentMachines,
  paymentMethods,
  setPaymentMethods,
  orders,
  products,
  clients,
  cart,
  setCart,
  sales,
  openSettings,
  settingsTab,
  settings,
  motorcycles,
}: {
  active: string;
  canOperate: boolean;
  canCreateOrders: boolean;
  firebaseConnected: boolean;
  currentFirebaseUser: FirebaseUserSummary | null;
  openFirebaseAccess: () => void;
  openDialog: OpenDialog;
  notify: (message: string) => void;
  navigate: (destination: string) => void;
  expenses: ExpenseRecord[];
  users: UserConfig[];
  setUsers: React.Dispatch<React.SetStateAction<UserConfig[]>>;
  partners: PartnerConfig[];
  setPartners: React.Dispatch<React.SetStateAction<PartnerConfig[]>>;
  quickServices: QuickServiceConfig[];
  setQuickServices: React.Dispatch<React.SetStateAction<QuickServiceConfig[]>>;
  categories: CategoryConfig[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryConfig[]>>;
  suppliers: SupplierConfig[];
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierConfig[]>>;
  paymentMachines: PaymentMachineConfig[];
  setPaymentMachines: React.Dispatch<React.SetStateAction<PaymentMachineConfig[]>>;
  paymentMethods: PaymentMethodConfig[];
  setPaymentMethods: React.Dispatch<React.SetStateAction<PaymentMethodConfig[]>>;
  orders: OrderRecord[];
  products: ProductRecord[];
  clients: ClientRecord[];
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  sales: SaleRecord[];
  openSettings: (tab: SettingsTab) => void;
  settingsTab: SettingsTab;
  settings: Partial<SettingsConfig> | null;
  motorcycles: MotorcycleRecord[];
}) {
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("Todos");

  if (active === "PDV Balcão") return <PdvWorkspace notify={notify} openDialog={openDialog} cart={cart} setCart={setCart} products={products} clients={clients} />;
  if (active === "Serviço rápido") return <QuickServiceWorkspace openDialog={(dialog) => openDialog(dialog)} quickServices={quickServices}/>;
  if (active === "Financeiro") return <FinanceWorkspace openDialog={openDialog} navigate={navigate} expenses={expenses} users={users} sales={sales} orders={orders}/>;
  if (active === "Contas a receber") return <AccountsWorkspace kind="receber" openDialog={openDialog} expenses={expenses} sales={sales} orders={orders}/>;
  if (active === "Contas a pagar") return <AccountsWorkspace kind="pagar" openDialog={openDialog} expenses={expenses} sales={sales} orders={orders}/>;
  if (active === "Funcionários") return <TeamWorkspace users={users} setUsers={setUsers} openDialog={openDialog} notify={notify} />;
  if (active === "Usuários e acessos") return <UserAccessWorkspace currentUser={currentFirebaseUser} firebaseConnected={firebaseConnected} employees={users} notify={notify} openFirebaseAccess={openFirebaseAccess}/>;
  if (active === "Configurações") return (
    <Suspense fallback={<LazyFallback />}>
      <SettingsWorkspace quickServices={quickServices} setQuickServices={setQuickServices} categories={categories} setCategories={setCategories} paymentMachines={paymentMachines} setPaymentMachines={setPaymentMachines} paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods} partners={partners} setPartners={setPartners} notify={notify} initialTab={settingsTab}/>
    </Suspense>
  );
  if (active === "Administração") return <AdminWorkspace navigate={navigate} openSettings={openSettings} settings={settings} users={users} products={products} orders={orders} clients={clients} motorcycles={motorcycles} sales={sales} expenses={expenses} categories={categories} quickServices={quickServices} partners={partners} paymentMachines={paymentMachines} paymentMethods={paymentMethods} suppliers={suppliers}/>;

  if (active === "Ordens de serviço" || active === "Orçamentos") {
    const isBudget = active === "Orçamentos";
    const filteredOrders = orders.filter((order) => {
      const text = `${order.id} ${order.customer} ${order.bike} ${order.plate}`.toLowerCase();
      const byText = text.includes(query.toLowerCase());
      const byStatus = listFilter === "Todos" || (listFilter === "Abertas" && ["Recepção", "Avaliação", "Aprovação"].includes(order.status)) || (listFilter === "Em andamento" && order.status === "Em serviço") || (listFilter === "Concluídas" && order.status === "Entrega");
      return byText && byStatus;
    });
    const openCount = orders.filter((order) => ["Recepção", "Avaliação", "Aprovação"].includes(order.status)).length;
    const inServiceCount = orders.filter((order) => order.status === "Em serviço").length;
    const readyCount = orders.filter((order) => order.status === "Entrega" && !order.closed).length;
    const budgetDraftCount = orders.filter((order) => order.status === "Recepção" || order.status === "Avaliação").length;
    const budgetPendingCount = orders.filter((order) => order.status === "Aprovação").length;
    const budgetApprovedCount = orders.filter((order) => order.status === "Em serviço" || order.status === "Entrega").length;

    return (
      <>
        <div className="module-heading">
          <div><p>Oficina</p><h1>{active}</h1><span>{isBudget ? "Acompanhe propostas enviadas e aprovações." : "Controle todas as motos desde a entrada até a entrega."}</span></div>
          {canCreateOrders ? <button className="primary-button" onClick={() => openDialog(isBudget ? "os" : "osChoice")}><Icon name="plus" size={18} />{isBudget ? "Novo orçamento" : "Abrir nova OS"}</button> : <span className="system-healthy"><i/><b>Consulta da oficina</b></span>}
        </div>
        <div className="module-summary">
          <article><span>{isBudget ? "Em elaboração" : "Em aberto"}</span><strong>{isBudget ? budgetDraftCount : openCount}</strong><small>{(isBudget ? budgetDraftCount : openCount) > 0 ? "Precisam de ação" : "Nenhum pendente"}</small></article>
          <article><span>{isBudget ? "Aguardando cliente" : "Em serviço"}</span><strong>{isBudget ? budgetPendingCount : inServiceCount}</strong><small>{(isBudget ? budgetPendingCount : inServiceCount) > 0 ? (isBudget ? "Aguardando aprovação" : "Mecânicos trabalhando") : "Nenhum em andamento"}</small></article>
          <article><span>{isBudget ? "Aprovados no mês" : "Prontas"}</span><strong>{isBudget ? budgetApprovedCount : readyCount}</strong><small>{(isBudget ? budgetApprovedCount : readyCount) > 0 ? (isBudget ? "Propostas aceitas" : "Aguardando retirada") : "Nenhum registro"}</small></article>
        </div>
        <section className="panel module-panel">
          <div className="list-toolbar">
            <label className="mini-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por OS, cliente ou placa"/></label>
            <div className="filter-pills">{["Todos", "Abertas", "Em andamento", "Concluídas"].map((filter) => <button className={listFilter === filter ? "selected" : ""} key={filter} onClick={() => setListFilter(filter)}>{filter}</button>)}</div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>OS / Cliente</th><th>Motocicleta</th><th>Responsável</th><th>Entrada</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>{filteredOrders.length > 0 ? filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong className="order-id">{order.id}</strong><span>{order.customer}</span></td>
                  <td><strong>{order.bike}</strong><span className="plate">{order.plate}</span></td>
                  <td><span className="mechanic-avatar">{order.mechanic ? order.mechanic[0] : "M"}</span>{order.mechanic || "Não definido"}</td>
                  <td>{order.time ? `Entrada: ${order.time}` : "Hoje"}</td>
                  <td><span className={`status ${statusTone(order.status)}`}><i />{isBudget && order.status === "Em serviço" ? "Aprovado" : order.status}</span></td>
                  <td><button className="outline-button" onClick={() => openDialog("order", order.id)}>Abrir</button></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    Nenhuma ordem de serviço cadastrada. Clique em "Abrir nova OS" para começar.
                  </td>
                </tr>
              )}</tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  if (active === "Produtos e estoque") {
    const filteredProducts = products.filter((product) => {
      const byText = `${product.name} ${product.code} ${product.category}`.toLowerCase().includes(query.toLowerCase());
      const byStatus = listFilter === "Todos" || product.status === listFilter;
      return byText && byStatus;
    });
    const criticalCount = products.filter((p) => p.stock > 0 && p.stock <= p.minimum).length;
    const zeroStockCount = products.filter((p) => p.stock === 0).length;

    return (
      <>
        <div className="module-heading">
          <div><p>Produtos e peças</p><h1>Controle de estoque</h1><span>Veja saldos, preços e itens que precisam de reposição.</span></div>
          {canOperate ? <div className="heading-actions">
            <button className="outline-button large" onClick={downloadStockTemplate}>Baixar modelo Sheets</button>
            <button className="outline-button large" onClick={() => openDialog("import")}>Importar planilha</button>
            <button className="primary-button" onClick={() => openDialog("product")}><Icon name="plus" size={18}/>Adicionar produto</button>
          </div> : <span className="system-healthy"><i/><b>Estoque em consulta</b></span>}
        </div>
        <div className="module-summary">
          <article><span>Produtos cadastrados</span><strong>{products.length}</strong><small>{products.length > 0 ? "Itens ativos no catálogo" : "Nenhum produto cadastrado"}</small></article>
          <article className={criticalCount + zeroStockCount > 0 ? "summary-danger" : ""}><span>Estoque crítico</span><strong>{criticalCount + zeroStockCount}</strong><small>{zeroStockCount > 0 ? `${zeroStockCount} produto(s) zerado(s)` : criticalCount > 0 ? `${criticalCount} em nível mínimo` : "Estoque normalizado"}</small></article>
          <article><span>Categorias ativas</span><strong>{categories.filter((c) => c.active).length}</strong><small>{suppliers.filter((s) => s.active).length} fornecedor(es) cadastrado(s)</small></article>
        </div>
        <section className="panel module-panel">
          <div className="list-toolbar">
            <label className="mini-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, código ou código de barras"/></label>
            <div className="filter-pills">{["Todos", "Crítico", "Sem estoque"].map((filter) => <button className={listFilter === filter ? "selected" : ""} key={filter} onClick={() => setListFilter(filter)}>{filter}</button>)}</div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>Saldo</th><th>Custo</th><th>Venda</th><th>Situação</th><th></th></tr></thead>
              <tbody>{filteredProducts.length > 0 ? filteredProducts.map((product) => (
                <tr key={product.code}>
                  <td><strong>{product.name}</strong><span className="mono">{product.code}</span></td>
                  <td>{product.category}</td>
                  <td><strong className={product.stock <= product.minimum ? "danger-text" : ""}>{product.stock} un.</strong><span>Mín. {product.minimum}</span></td>
                  <td className="mono">{product.cost}</td><td><strong className="mono">{product.price}</strong></td>
                  <td><span className={`status ${product.status === "Normal" ? "green" : product.status === "Crítico" ? "amber" : "red"}`}><i/>{product.status}</span></td>
                  <td><button className="row-button" aria-label={`Abrir ${product.name}`} onClick={() => canOperate ? openDialog("product") : notify("Seu perfil pode consultar o estoque, mas não alterar produtos.")}><Icon name="arrow" size={17}/></button></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    Nenhum produto cadastrado no estoque.
                  </td>
                </tr>
              )}</tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  const configs: Record<string, { eyebrow: string; description: string; button: string; first: string; second: string; third: string }> = {
    Clientes: { eyebrow: "Relacionamento", description: "Cadastros, contatos, veículos e histórico de atendimento.", button: "Adicionar cliente", first: "Clientes ativos", second: "Com WhatsApp", third: "Com motos vinculadas" },
    Motocicletas: { eyebrow: "Veículos", description: "Motos vinculadas aos proprietários e histórico da oficina.", button: "Cadastrar moto", first: "Motos cadastradas", second: "Marcas ativas", third: "Com placa Mercosul" },
    "Vendas do balcão": { eyebrow: "Histórico do PDV", description: "Consulte vendas, pagamentos e comprovantes do balcão.", button: "Abrir PDV", first: "Vendas hoje", second: "Recebido hoje", third: "Ticket médio" },
    "Compras e entradas": { eyebrow: "Reposição de estoque", description: "Registre compras e entradas de peças sem rotina fiscal.", button: "Nova entrada", first: "Entradas no mês", second: "Valor comprado", third: "Aguardando conferência" },
    Fornecedores: { eyebrow: "Parceiros de fornecimento", description: "Contatos, prazos, condições e peças fornecidas.", button: "Adicionar fornecedor", first: "Fornecedores ativos", second: "Prazo médio", third: "Com entrega rápida" },
    Financeiro: { eyebrow: "Caixa e recebimentos", description: "Acompanhe entradas, saídas e valores a receber.", button: "Nova movimentação", first: "Saldo do dia", second: "A receber", third: "Contas vencidas" },
    Relatórios: { eyebrow: "Indicadores", description: "Resultados da oficina organizados para decisões rápidas.", button: "Exportar relatório", first: "Faturamento do mês", second: "Ticket médio", third: "Serviços concluídos" },
  };
  const config = configs[active] ?? configs.Clientes;

  const defaultRecords = clients.map((client) => ({ name: client.name, sub: client.phone || "Sem telefone", meta: client.detail || "Cliente cadastrado", initials: (client.name.split(" ").slice(0, 2).map((word) => word[0]).join("") || "CL").toUpperCase() }));
  const motorcycleRecords = motorcycles.map((moto) => {
    const owner = clients.find((c) => c.id === moto.ownerId);
    return {
      name: `${moto.brand} ${moto.model}`,
      sub: `${owner ? owner.name : "Proprietário não vinculado"} · ${moto.plate}`,
      meta: `${moto.year} · ${moto.color}`,
      initials: (moto.model.slice(0, 2) || "MT").toUpperCase(),
    };
  });
  const supplierRecords = suppliers.map((supplier) => ({ name: supplier.name, sub: `${supplier.phone || "Sem telefone"} · ${supplier.deliveryDays === 0 ? "Entrega no dia" : `Entrega em ${supplier.deliveryDays} dia${supplier.deliveryDays === 1 ? "" : "s"}`}`, meta: supplier.categories, initials: (supplier.name.split(" ").slice(0, 2).map((word) => word[0]).join("") || "FN").toUpperCase() }));
  
  const records = active === "Fornecedores" ? supplierRecords : active === "Motocicletas" ? motorcycleRecords : active === "Clientes" ? defaultRecords : [];
  
  // Os KPIs de Financeiro, Relatórios e Vendas do balcão eram "R$ 0,00" e "0"
  // escritos direto no ternário.
  const moduleSummary = useMemo(() => financeSummary(sales, orders, expenses), [sales, orders, expenses]);
  const salesToday = useMemo(() => sales.filter((sale) => sale.date === new Date().toLocaleDateString("pt-BR")), [sales]);
  const firstValue = active === "Financeiro" ? formatBRL(moduleSummary.dayBalance) : active === "Relatórios" ? formatBRL(moduleSummary.grossMonth) : active === "Motocicletas" ? String(motorcycles.length) : active === "Vendas do balcão" ? String(salesToday.length) : active === "Compras e entradas" ? "0" : active === "Fornecedores" ? String(suppliers.filter((supplier) => supplier.active).length) : String(clients.length);
  const secondValue = active === "Financeiro" ? formatBRL(moduleSummary.receivableTotal) : active === "Relatórios" ? formatBRL(moduleSummary.averageTicket) : active === "Motocicletas" ? String(new Set(motorcycles.map((m) => m.brand)).size) : active === "Vendas do balcão" ? formatBRL(salesToday.reduce((total, sale) => total + sale.total, 0)) : active === "Compras e entradas" ? "R$ 0,00" : active === "Fornecedores" ? (suppliers.length > 0 ? `${Math.round(suppliers.reduce((sum, s) => sum + s.deliveryDays, 0) / suppliers.length)} dias` : "0 dias") : String(clients.filter((c) => Boolean(c.phone)).length);
  const thirdValue = active === "Financeiro" ? String(moduleSummary.overdueCount) : active === "Relatórios" ? String(moduleSummary.closedOrders) : active === "Motocicletas" ? String(motorcycles.filter((m) => m.plate.length === 8).length) : active === "Vendas do balcão" ? formatBRL(salesToday.length ? salesToday.reduce((total, sale) => total + sale.total, 0) / salesToday.length : 0) : active === "Compras e entradas" ? "0" : active === "Fornecedores" ? String(suppliers.filter((s) => s.deliveryDays <= 1).length) : String(clients.filter((c) => c.motorcycleIds && c.motorcycleIds.length > 0).length);

  const primaryAction = () => {
    if (active === "Clientes") return openDialog("client");
    if (active === "Motocicletas") return openDialog("motorcycle");
    if (active === "Compras e entradas") return openDialog("purchase");
    if (active === "Fornecedores") return openDialog("supplier");
    if (active === "Financeiro") return openDialog("finance");
    if (active === "Vendas do balcão") return navigate("PDV Balcão");
    if (active === "Relatórios") return notify("Relatório exportado em formato PDF.");
    return openDialog("record");
  };
  const filteredRecords = records.filter((record) => `${record.name} ${record.sub} ${record.meta}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="module-heading">
        <div><p>{config.eyebrow}</p><h1>{active}</h1><span>{config.description}</span></div>
        {canOperate ? <button className="primary-button" onClick={primaryAction}><Icon name="plus" size={18}/>{config.button}</button> : <span className="system-healthy"><i/><b>Somente consulta</b></span>}
      </div>
      <div className="module-summary">
        <article><span>{config.first}</span><strong>{firstValue}</strong><small>Atualizado agora</small></article>
        <article><span>{config.second}</span><strong>{secondValue}</strong><small>Período atual</small></article>
        <article><span>{config.third}</span><strong>{thirdValue}</strong><small>Registros no sistema</small></article>
      </div>
      <section className="panel module-panel registry-list">
        <div className="list-toolbar"><label className="mini-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar em ${active.toLowerCase()}...`}/></label><button className="outline-button large" onClick={() => setListFilter(listFilter === "Todos" ? "Recentes" : "Todos")}>{listFilter === "Todos" ? "Mais recentes" : "Mostrar todos"}</button></div>
        {filteredRecords.length > 0 ? (
          filteredRecords.map((record) => (
            <button className="registry-row" key={`${record.name}-${record.sub}`} onClick={() => canOperate ? openDialog(active === "Fornecedores" ? "supplier" : active === "Compras e entradas" ? "purchase" : active === "Financeiro" ? "finance" : active === "Motocicletas" ? "motorcycle" : active === "Clientes" ? "client" : "record") : notify("Seu perfil possui acesso de consulta a este cadastro.")}>
              <span className="registry-avatar">{record.initials}</span>
              <span><strong>{record.name}</strong><small>{record.sub}</small></span>
              <span className="registry-meta">{record.meta}</span><Icon name="arrow" size={17}/>
            </button>
          ))
        ) : (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
            Nenhum registro encontrado em {active.toLowerCase()}.
          </div>
        )}
      </section>
    </>
  );
}

function AppDialog({
  dialog,
  canOperate,
  step,
  setStep,
  close,
  finish,
  changeDialog,
  onAddExpense,
  users,
  partners,
  quickServices,
  categories,
  suppliers,
  paymentMachines,
  paymentMethods,
  products,
  clients,
  motorcycles,
  orders,
  expenses,
  notify,
  selectedOrderId,
  osPrefix,
  canManageCustomers,
  cart,
  setCart,
  sales,
  lists,
  currentUser,
}: {
  dialog: DialogKind;
  canOperate: boolean;
  step: number;
  setStep: (step: number) => void;
  close: () => void;
  finish: (message: string) => void;
  changeDialog: OpenDialog;
  onAddExpense: (expense: Omit<ExpenseRecord, "id">) => void;
  users: UserConfig[];
  partners: PartnerConfig[];
  quickServices: QuickServiceConfig[];
  categories: CategoryConfig[];
  suppliers: SupplierConfig[];
  paymentMachines: PaymentMachineConfig[];
  paymentMethods: PaymentMethodConfig[];
  products: ProductRecord[];
  clients: ClientRecord[];
  motorcycles: MotorcycleRecord[];
  orders: OrderRecord[];
  expenses: ExpenseRecord[];
  notify: (message: string) => void;
  selectedOrderId: string;
  osPrefix: string;
  canManageCustomers: boolean;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  sales: SaleRecord[];
  lists: Partial<SystemLists> | null;
  currentUser: FirebaseUserSummary | null;
}) {
  if (dialog === "product") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <ProductFormModal
          isOpen={true}
          onClose={close}
          onSaved={(prod) => finish(`Produto "${prod.name}" salvo com sucesso no Firestore!`)}
          categories={categories}
          suppliers={suppliers}
          notify={notify || finish}
          allProducts={products}
          units={systemList(lists, "units")}
        />
      </Suspense>
    );
  }

  if (dialog === "supplier") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <SupplierFormModal
          isOpen={true}
          onClose={close}
          onSaved={(sup) => finish(`Fornecedor "${sup.name}" salvo com sucesso no Firestore!`)}
          notify={notify || finish}
          allSuppliers={suppliers}
        />
      </Suspense>
    );
  }

  if (dialog === "motorcycle") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <MotorcycleFormModal
          isOpen={true}
          onClose={close}
          onSaved={(moto) => finish(`Motocicleta placa ${moto.plate} salva com sucesso no Firestore!`)}
          clients={clients}
          notify={notify || finish}
          allMotorcycles={motorcycles}
          brands={systemList(lists, "motorcycleBrands")}
        />
      </Suspense>
    );
  }

  if (dialog === "client") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <ClientFormModal
          isOpen={true}
          onClose={close}
          onSaved={(cli) => finish(`Cliente "${cli.name}" salvo com sucesso no Firestore!`)}
          notify={notify || finish}
          allClients={clients}
        />
      </Suspense>
    );
  }

  if (dialog === "employee") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <EmployeeFormModal
          isOpen={true}
          onClose={close}
          onSaved={(emp) => finish(`Funcionário "${emp.name}" salvo com sucesso no Firestore!`)}
          notify={notify || finish}
          allEmployees={users}
        />
      </Suspense>
    );
  }

  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [splitPayment, setSplitPayment] = useState(false);
  const [catalogSelection, setCatalogSelection] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("Todos");
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [cashAction, setCashAction] = useState("Suprimento");
  const [settingsTab, setSettingsTab] = useState("Oficina");
  const [extraPurchaseItem, setExtraPurchaseItem] = useState(false);
  const [extraOrderItem, setExtraOrderItem] = useState(false);
  const [quickService, setQuickService] = useState(quickServices[0]?.name ?? "Serviço rápido");
  const [quickProduct, setQuickProduct] = useState("Sem produto");
  const [quickServiceValue, setQuickServiceValue] = useState(String(quickServices[0]?.laborPrice ?? 0));
  const [quickPartValue, setQuickPartValue] = useState("0");
  const [quickQuantity, setQuickQuantity] = useState(1);
  const [quickPayment, setQuickPayment] = useState("PIX");
  const [expenseCategory, setExpenseCategory] = useState("Peça comprada fora do estoque");
  const [expensePaymentMode, setExpensePaymentMode] = useState("Caixa");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseSale, setExpenseSale] = useState("");
  const [expensePart, setExpensePart] = useState("");
  const [expenseOrder, setExpenseOrder] = useState("");
  const [expenseDueDate, setExpenseDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expenseEmployeeId, setExpenseEmployeeId] = useState(users[0]?.id ?? "");
  const [osOrigin, setOsOrigin] = useState<"direct" | "partner">("direct");
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id ?? "");
  const [selectedMechanicIds, setSelectedMechanicIds] = useState<string[]>(() => users.filter((u) => u.active !== false && isMechanicUser(u)).slice(0, 1).map((u) => u.id));
  const [selectedQuickMechanicId, setSelectedQuickMechanicId] = useState(() => users.find((u) => u.active !== false && isMechanicUser(u))?.id ?? users[0]?.id ?? "");
  const [osItems, setOsItems] = useState<ServiceOrderItem[]>([]);
  const [pieceSearch, setPieceSearch] = useState("");
  const [laborDescription, setLaborDescription] = useState("");
  const [laborValue, setLaborValue] = useState("");
  const [customerLookup, setCustomerLookup] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedMotorcycleId, setSelectedMotorcycleId] = useState("");
  const [osPlate, setOsPlate] = useState("");
  const [newVehicleMode, setNewVehicleMode] = useState(false);
  const [motorcyclePlate, setMotorcyclePlate] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState(paymentMachines[0]?.id ?? "");
  const [paymentInstallments, setPaymentInstallments] = useState(1);
  const [orderStatus, setOrderStatus] = useState<ServiceOrderStatus>("Em serviço");
  const [orderMechanicIds, setOrderMechanicIds] = useState<string[]>(() => users.filter((u) => u.active !== false && isMechanicUser(u)).slice(0, 1).map((u) => u.id));
  const [checkoutItems, setCheckoutItems] = useState<ServiceOrderItem[]>([]);
  const [checkoutPieceSearch, setCheckoutPieceSearch] = useState("");
  const [checkoutLaborDescription, setCheckoutLaborDescription] = useState("");
  const [checkoutLaborValue, setCheckoutLaborValue] = useState("");
  const [clientPaymentCondition, setClientPaymentCondition] = useState("Pagamento normal");
  const [tradeServiceDescription, setTradeServiceDescription] = useState("");
  const [tradeValue, setTradeValue] = useState("");
  const [tradeNotes, setTradeNotes] = useState("");
  // Campos da recepção (etapa 3). Eram inputs sem estado: o que a atendente
  // digitava não chegava a lugar nenhum.
  const [osMileage, setOsMileage] = useState("");
  const [osProblem, setOsProblem] = useState("");
  const [osPriority, setOsPriority] = useState("Normal");
  const [osFuel, setOsFuel] = useState("");
  const [quickAccount, setQuickAccount] = useState("");
  const [osDelivery, setOsDelivery] = useState("");
  // Cadastro rápido da etapa 1, quando o cliente ou a moto ainda não existem.
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleYear, setNewVehicleYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const currentOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0];

  // Ao abrir o detalhe, o diálogo assume a situação e a equipe da OS clicada.
  // O AppDialog fica montado o tempo todo, então sem isto ele mostraria o
  // estado deixado pela ordem aberta anteriormente.
  useEffect(() => {
    if (dialog !== "order" || !currentOrder) return;
    setOrderStatus((serviceOrderStatuses as readonly string[]).includes(currentOrder.status) ? currentOrder.status as ServiceOrderStatus : "Recepção");
    setOrderMechanicIds(currentOrder.mechanicIds?.length ? currentOrder.mechanicIds : []);
    setExtraOrderItem(false);
    setDialogError("");
  }, [dialog, currentOrder?.id]);

  if (!dialog) return null;
  const activeMechanics = users.filter((user) => user.active !== false && isMechanicUser(user));
  const activePartners = partners.filter((partner) => partner.active);
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const enabledQuickServices = quickServices.filter((service) => service.active);
  const activePaymentMethods = paymentMethods.filter((method) => method.active);
  const activePaymentMachines = paymentMachines.filter((machine) => machine.active);
  const selectedMechanics = activeMechanics.filter((user) => selectedMechanicIds.includes(user.id));
  const orderMechanics = activeMechanics.filter((user) => orderMechanicIds.includes(user.id));
  const selectedPartner = activePartners.find((partner) => partner.id === selectedPartnerId) ?? activePartners[0];
  const selectedCustomer = clients.find((client) => client.id === selectedCustomerId) ?? clients[0];
  const lookupDigits = onlyDigits(customerLookup);
  const customerLookupMatch = clients.find((client) => (lookupDigits.length >= 8 && onlyDigits(client.phone).includes(lookupDigits)) || (!lookupDigits.length && customerLookup.trim().length >= 3 && client.name.toLowerCase().includes(customerLookup.toLowerCase())));
  const customerMotorcycles = motorcycles.filter((motorcycle) => motorcycle.ownerId === selectedCustomer?.id);
  const selectedMotorcycle = motorcycles.find((motorcycle) => motorcycle.id === selectedMotorcycleId);
  const selectedEmployee = users.find((user) => user.id === expenseEmployeeId) ?? users[0];
  const selectedMachine = activePaymentMachines.find((machine) => machine.id === selectedMachineId) ?? activePaymentMachines.find((machine) => machine.primary) ?? activePaymentMachines[0];
  const partsTotal = osItems.filter((item) => item.type === "Peça").reduce((sum, item) => sum + item.price, 0);
  const laborTotal = osItems.filter((item) => item.type === "Mão de obra").reduce((sum, item) => sum + item.price, 0);
  const partnerDiscount = osOrigin === "partner" ? laborTotal * ((selectedPartner?.laborDiscount ?? 0) / 100) : 0;
  const osTotal = partsTotal + laborTotal - partnerDiscount;
  const quickTotal = Number(quickServiceValue || 0) + (quickProduct === "Sem produto" ? 0 : Number(quickPartValue || 0) * quickQuantity);
  const expenseCost = Number(expenseAmount || 0);
  const expenseCharged = Number(expenseSale || 0);
  const expenseMargin = expenseCharged - expenseCost;
  const checkoutPartsTotal = checkoutItems.filter((item) => item.type === "Peça").reduce((sum, item) => sum + item.price, 0);
  const checkoutLaborTotal = checkoutItems.filter((item) => item.type === "Mão de obra").reduce((sum, item) => sum + item.price, 0);
  const checkoutTotal = checkoutPartsTotal + checkoutLaborTotal;
  const tradeCompensated = Math.min(Math.max(Number(tradeValue) || 0, 0), checkoutTotal);
  const tradeRemaining = Math.max(checkoutTotal - tradeCompensated, 0);
  const tradeCreditRemaining = Math.max((Number(tradeValue) || 0) - checkoutTotal, 0);
  // Listas configuráveis em Configurações -> Listas do sistema, com o padrão de
  // fábrica quando a oficina ainda não ajustou nada.
  const orderPriorities = systemList(lists, "orderPriorities");
  const fuelLevels = systemList(lists, "fuelLevels");
  const cashAccounts = systemList(lists, "cashAccounts");
  // Se a oficina renomear ou remover uma opção, o valor guardado no estado pode
  // não existir mais na lista — nesse caso o select mostraria vazio. Cai na
  // primeira opção válida.
  const pick = (list: string[], current: string) => (list.includes(current) ? current : list[0] ?? "");
  const currentPriority = pick(orderPriorities, osPriority);
  const currentFuel = pick(fuelLevels, osFuel);
  const currentAccount = pick(cashAccounts, quickAccount);
  // Os filtros do catálogo e as categorias de gasto vinham escritos no JSX e
  // ignoravam o cadastro de categorias da própria oficina.
  const productCategoryNames = categories.filter((item) => item.active !== false && item.group === "Produtos").map((item) => item.name);
  const expenseCategoryNames = categories.filter((item) => item.active !== false && item.group === "Despesas").map((item) => item.name);
  // "Peça comprada fora do estoque" e "Pagamento de funcionário" ficam fixas
  // porque disparam comportamento próprio no formulário (vínculo com a OS e
  // com o funcionário). As demais vêm do cadastro de categorias da oficina, com
  // a lista antiga como padrão enquanto nenhuma categoria de despesa existir.
  const behaviourExpenseCategories = ["Peça comprada fora do estoque", "Pagamento de funcionário"];
  const fallbackExpenseCategories = ["Comissões", "Compra para o estoque", "Fornecedor de peças", "Frete e motoboy", "Ferramentas e equipamentos", "Despesas fixas", "Taxas de cartão", "Outros gastos"];
  const expenseCategoryOptions = [
    ...behaviourExpenseCategories,
    ...(expenseCategoryNames.length ? expenseCategoryNames : fallbackExpenseCategories).filter((name) => !behaviourExpenseCategories.includes(name)),
  ];
  const cartTotal = cart.reduce((sum, item) => sum + item.unit * item.quantity, 0);
  const dialogSummary = financeSummary(sales, orders, expenses);
  const paymentGross = dialog === "orderCheckout" ? checkoutTotal : cartTotal;
  const paymentFeeRate = paymentMethod === "Débito" ? selectedMachine?.debitFee ?? 0 : paymentMethod === "Crédito" ? paymentInstallments === 1 ? selectedMachine?.credit1xFee ?? 0 : paymentInstallments <= 6 ? selectedMachine?.credit2to6Fee ?? 0 : selectedMachine?.credit7to12Fee ?? 0 : 0;
  const paymentFeeAmount = paymentGross * (paymentFeeRate / 100);
  const orderStatusTone = statusTone(orderStatus);
  const handleCustomerLookup = (value: string) => {
    const formattedValue = onlyDigits(value) ? formatPhone(value) : value;
    setCustomerLookup(formattedValue);
    const digits = onlyDigits(value);
    const normalizedText = value.toLowerCase();
    const found = clients.find((client) => (digits.length >= 8 && onlyDigits(client.phone).includes(digits)) || (normalizedText.length >= 3 && client.name.toLowerCase().includes(normalizedText)));
    if (!found) return;
    setSelectedCustomerId(found.id);
    const ownedMotorcycles = motorcycles.filter((motorcycle) => motorcycle.ownerId === found.id);
    if (ownedMotorcycles.length === 1) {
      setSelectedMotorcycleId(ownedMotorcycles[0].id);
      setOsPlate(ownedMotorcycles[0].plate);
      setNewVehicleMode(false);
    }
  };
  const handleOsPlate = (value: string) => {
    const formatted = formatPlate(value);
    setOsPlate(formatted);
    const found = motorcycles.find((motorcycle) => normalizePlate(motorcycle.plate) === normalizePlate(formatted));
    if (!found) {
      if (normalizePlate(formatted).length === 7) setNewVehicleMode(true);
      return;
    }
    setSelectedMotorcycleId(found.id);
    setSelectedCustomerId(found.ownerId);
    const owner = clients.find((client) => client.id === found.ownerId);
    if (owner) setCustomerLookup(owner.phone);
    setNewVehicleMode(false);
  };
  const selectMotorcycle = (id: string) => {
    const motorcycle = motorcycles.find((item) => item.id === id);
    if (!motorcycle) return;
    setSelectedMotorcycleId(id);
    setOsPlate(motorcycle.plate);
    setNewVehicleMode(false);
  };
  const toggleMechanic = (id: string, target: "new" | "existing") => {
    const selected = target === "new" ? selectedMechanicIds : orderMechanicIds;
    const update = target === "new" ? setSelectedMechanicIds : setOrderMechanicIds;
    update(selected.includes(id) ? (selected.length > 1 ? selected.filter((currentId) => currentId !== id) : selected) : [...selected, id]);
  };
  const titles: Record<Exclude<DialogKind, null>, string> = {
    changePassword: "Definir uma nova senha",
    osChoice: "Que tipo de atendimento é?",
    os: "Abrir nova ordem de serviço",
    quick: "Lançar serviço rápido",
    product: "Adicionar produto",
    import: "Importar cadastro de estoque",
    payment: "Receber pagamento",
    catalog: "Catálogo de produtos",
    client: "Selecionar ou cadastrar cliente",
    motorcycle: "Cadastrar motocicleta",
    employee: "Funcionário e acesso",
    supplier: "Cadastro de fornecedor",
    purchase: "Nova entrada de estoque",
    finance: "Nova movimentação financeira",
    order: currentOrder ? `${currentOrder.id} · ${currentOrder.bike}` : "Ordem de serviço",
    orderCheckout: currentOrder ? `Finalizar e receber ${currentOrder.id}` : "Finalizar e receber OS",
    settings: "Configurações do sistema",
    cash: "Controle do caixa",
    expense: "Adicionar gasto manual",
    receivable: "Nova conta a receber",
    payable: "Nova conta a pagar",
    settleReceivable: "Receber conta",
    settlePayable: "Pagar conta",
    record: "Detalhes do registro",
  };
  const subtitles: Record<Exclude<DialogKind, null>, string> = {
    changePassword: "Escolha a senha que você vai usar a partir de agora.",
    osChoice: "Escolha o fluxo certo antes de começar.",
    os: "Preencha somente o necessário. Você poderá completar depois.",
    quick: "Para trocas e ajustes sem cadastro completo.",
    product: "Cadastre a peça e já defina o saldo inicial.",
    import: "Use o modelo CSV preenchido no Google Sheets.",
    payment: "Aceite uma ou mais formas de pagamento.",
    catalog: "Pesquise por nome, código de barras ou SKU.",
    client: "Use um cadastro existente ou crie um novo rapidamente.",
    motorcycle: "A moto sempre ficará vinculada ao proprietário real.",
    employee: "Dados pessoais, função, pagamento e acesso ao sistema.",
    supplier: "Contato, condições e categorias fornecidas.",
    purchase: "Entrada simples de produtos, sem rotina fiscal.",
    finance: "Registre entrada, saída, sangria ou suprimento.",
    order: currentOrder ? `Cliente: ${currentOrder.customer} · Placa ${currentOrder.plate}` : "Detalhes da ordem de serviço",
    orderCheckout: "Confira os itens executados, receba e encerre a ordem de serviço.",
    settings: "Tudo que pode ser alterado, concentrado em uma tela.",
    cash: "Abra, movimente ou feche o caixa do dia.",
    expense: "Registre o que saiu do caixa ou deixe programado para pagar depois.",
    receivable: "Lançamento manual para cliente, parceiro ou outro pagador.",
    payable: "Compromisso com fornecedor ou despesa operacional.",
    settleReceivable: "Confirme o valor recebido e a forma de pagamento.",
    settlePayable: "Confirme o pagamento e a conta de saída.",
    record: "Informações completas e histórico de movimentações.",
  };

  // Próximo número livre da sequência, a partir do maior id já cadastrado.
  const nextOrderNumber = highestSequence(orders, osPrefix) + 1;

  const createOrder = async () => {
    // O campo de busca aceita telefone OU nome. Só serve de nome quando o que
    // foi digitado não é um telefone — senão a OS sairia com "(34) 99999-9999"
    // no lugar do cliente.
    const typedIsPhone = onlyDigits(customerLookup).length >= 8;
    const customerName = (customerLookupMatch?.name ?? newCustomerName).trim()
      || (typedIsPhone ? "" : customerLookup.trim());
    const plate = formatPlate(osPlate || selectedMotorcycle?.plate || "");
    const bike = (!newVehicleMode && selectedMotorcycle ? [selectedMotorcycle.brand, selectedMotorcycle.model].filter(Boolean).join(" ") : newVehicleModel).trim();
    if (!customerName) throw new Error("Informe o nome do cliente antes de abrir a ordem de serviço.");
    if (!bike && !plate) throw new Error("Informe a motocicleta ou a placa antes de abrir a ordem de serviço.");

    // Cliente e moto digitados na hora viram cadastro de verdade — senão a
    // próxima OS do mesmo cliente não o encontraria na busca. Só para quem tem
    // permissão de gerenciar clientes; sem ela a OS guarda apenas os textos.
    let clientId = customerLookupMatch?.id ?? "";
    let motorcycleId = !newVehicleMode ? selectedMotorcycleId : "";
    if (canManageCustomers && !clientId && customerName) {
      // Mesmo padrão CLI-000 do cadastro de clientes, mas a partir do maior id
      // já usado em vez da quantidade de registros: contar a lista faz o
      // próximo cliente reaproveitar o id de um cliente apagado e sobrescrevê-lo.
      clientId = `CLI-${String(highestSequence(clients, "CLI") + 1).padStart(3, "0")}`;
      await saveFirestoreDoc("clients", clientId, {
        name: customerName,
        phone: formatPhone(customerLookup),
        detail: bike || "Cliente cadastrado na abertura da OS",
        meta: "",
        condition: "Pagamento normal",
        motorcycleIds: [],
        active: true,
      });
    }
    if (canManageCustomers && !motorcycleId && clientId && plate) {
      // A placa já identifica a moto de forma única, mesmo padrão do cadastro.
      motorcycleId = `MOTO-${normalizePlate(plate)}`;
      await saveFirestoreDoc("motorcycles", motorcycleId, {
        ownerId: clientId,
        ownerName: customerName,
        plate,
        model: bike,
        year: newVehicleYear,
        color: "",
      });
      await saveFirestoreDoc("clients", clientId, {
        motorcycleIds: [...(customerLookupMatch?.motorcycleIds ?? []), motorcycleId],
      });
    }

    const orderId = await createServiceOrder(osPrefix, nextOrderNumber, {
      customer: customerName,
      bike: bike || "Motocicleta",
      plate,
      mechanic: selectedMechanics[0]?.name ?? "",
      mechanicIds: selectedMechanics.map((mechanic) => mechanic.id),
      time: new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      status: "Recepção",
      tone: statusTone("Recepção"),
      items: osItems,
      problem: osProblem,
      mileage: osMileage,
      priority: currentPriority,
      fuelLevel: currentFuel,
      delivery: osDelivery ? osDelivery.split("-").reverse().join("/") : "",
      origin: osOrigin === "partner" ? `Encaminhado por ${selectedPartner?.name ?? "parceiro"}` : "Cliente direto",
      total: osTotal,
      ...(clientId ? { clientId } : {}),
      ...(motorcycleId ? { motorcycleId } : {}),
    });
    return orderId;
  };

  const registerSale = async (input: {
    origin: "PDV" | "Serviço rápido";
    items: ServiceOrderItem[];
    total: number;
    stockUpdates: Array<{ productId: string; quantity: number }>;
    mechanicId?: string;
    mechanicName?: string;
    method: string;
    account?: string;
  }) => {
    const usesMachine = ["Débito", "Crédito"].includes(input.method);
    const installments = input.method === "Crédito" ? paymentInstallments : 1;
    const rate = !usesMachine ? 0
      : input.method === "Débito" ? selectedMachine?.debitFee ?? 0
      : installments === 1 ? selectedMachine?.credit1xFee ?? 0
      : installments <= 6 ? selectedMachine?.credit2to6Fee ?? 0
      : selectedMachine?.credit7to12Fee ?? 0;
    const fee = input.total * (rate / 100);
    const saleId = `VEN-${String(highestSequence(sales, "VEN") + 1).padStart(4, "0")}`;
    await recordSale(saleId, {
      origin: input.origin,
      items: input.items,
      total: input.total,
      paymentMethod: input.method,
      ...(usesMachine ? {
        fee,
        net: input.total - fee,
        machineName: selectedMachine?.name ?? "",
        installments,
      } : {}),
      ...(input.mechanicId ? { mechanicId: input.mechanicId, mechanicName: input.mechanicName ?? "" } : {}),
      ...(input.account ? { account: input.account } : {}),
      operatorUid: currentUser?.uid ?? "",
      operatorName: currentUser?.displayName ?? "",
      date: new Date().toLocaleDateString("pt-BR"),
      soldAt: new Date().toISOString(),
    }, input.stockUpdates);
    return saleId;
  };

  const saveOrderChanges = async () => {
    if (!currentOrder) throw new Error("Nenhuma ordem de serviço selecionada.");
    await saveFirestoreDoc("serviceOrders", currentOrder.id, {
      status: orderStatus,
      tone: statusTone(orderStatus),
      mechanicIds: orderMechanicIds,
      mechanic: activeMechanics.find((mechanic) => mechanic.id === orderMechanicIds[0])?.name ?? currentOrder.mechanic,
    });
  };

  const submit = async () => {
    if (saving) return;
    setDialogError("");
    if (dialog === "os" && step < 5) return setStep(step + 1);

    if (dialog === "os") {
      setSaving(true);
      try {
        const orderId = await createOrder();
        return finish(`Ordem de serviço ${orderId} aberta e salva no sistema.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível abrir a ordem de serviço.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "order" && orderStatus !== "Entrega") {
      setSaving(true);
      try {
        await saveOrderChanges();
        return finish(`Situação da ${currentOrder?.id ?? "OS"} atualizada para ${orderStatus}.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível salvar a ordem de serviço.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "order" && orderStatus === "Entrega" && !canOperate) {
      setSaving(true);
      try {
        await saveOrderChanges();
        return finish(`Situação da ${currentOrder?.id ?? "OS"} atualizada para ${orderStatus}.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível salvar a ordem de serviço.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "order" && orderStatus === "Entrega" && canOperate) {
      // O checkout revisa o que a OS já tem, em vez de abrir sempre vazio.
      const items: ServiceOrderItem[] = [
        ...(currentOrder?.items ?? []),
        ...(extraOrderItem ? [{ id: `LAB-${Date.now()}`, type: "Mão de obra" as const, name: "Serviço adicional", price: 0 }] : []),
      ];
      setCheckoutItems(items);
      setTradeValue(String(items.reduce((sum, item) => sum + item.price, 0)));
      setPaymentMethod("PIX");
      return changeDialog("orderCheckout");
    }
    if (dialog === "orderCheckout") {
      setSaving(true);
      try {
        // O encerramento grava o que foi realmente executado e marca a OS como
        // concluída, para ela sair da fila de motos prontas aguardando retirada.
        if (currentOrder) {
          await saveFirestoreDoc("serviceOrders", currentOrder.id, {
            items: checkoutItems,
            total: checkoutTotal,
            status: "Entrega",
            tone: statusTone("Entrega"),
            paymentMethod,
            closed: true,
            closedAt: new Date().toLocaleDateString("pt-BR"),
          });
        }
      } catch (error) {
        setSaving(false);
        return setDialogError(error instanceof Error ? error.message : "Não foi possível encerrar a ordem de serviço.");
      }
      setSaving(false);
      return finish(paymentMethod === "Troca de serviços"
        ? `Troca registrada, saldo da OS compensado em ${formatBRL(tradeCompensated)} e 3 vias preparadas: mecânico, caixa e cliente.`
        : `Pagamento de ${formatBRL(checkoutTotal)} registrado, ordem de serviço encerrada e 3 vias preparadas: mecânico, caixa e cliente.`);
    }
    if (dialog === "catalog") {
      const chosen = products.find((product) => product.code === catalogSelection);
      if (!chosen) return setDialogError("Escolha um produto da lista.");
      if (chosen.stock <= 0) return setDialogError(`${chosen.name} está sem estoque.`);
      const alreadyInCart = cart.find((item) => item.code === chosen.code);
      if (alreadyInCart && alreadyInCart.quantity >= chosen.stock) return setDialogError(`${chosen.name} tem apenas ${chosen.stock} em estoque.`);
      setCart((current) => alreadyInCart
        ? current.map((item) => item.code === chosen.code ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { id: chosen.id, code: chosen.code, name: chosen.name, unit: parseBRL(chosen.price), quantity: 1, stock: chosen.stock, cost: parseBRL(chosen.cost) }]);
      setCatalogSelection("");
      setCatalogSearch("");
      return finish(`${chosen.name} adicionado à venda.`);
    }

    if (dialog === "payment") {
      if (!cart.length) return setDialogError("Adicione ao menos um item antes de receber.");
      const semEstoque = cart.find((item) => item.quantity > item.stock);
      if (semEstoque) return setDialogError(`${semEstoque.name} tem apenas ${semEstoque.stock} em estoque.`);
      setSaving(true);
      try {
        const saleId = await registerSale({
          origin: "PDV",
          method: paymentMethod,
          total: cartTotal,
          items: cart.map((item) => ({
            id: item.id,
            type: "Peça" as const,
            name: item.name,
            price: item.unit * item.quantity,
            quantity: item.quantity,
            cost: item.cost * item.quantity,
          })),
          stockUpdates: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        });
        setCart([]);
        return finish(`Venda ${saleId} de ${formatBRL(cartTotal)} registrada e estoque baixado.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível registrar a venda.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "quick") {
      const parts = quickProduct === "Sem produto" ? [] : products.filter((product) => product.name === quickProduct);
      const part = parts[0];
      if (quickProduct !== "Sem produto" && !part) return setDialogError("Produto não encontrado no estoque.");
      if (part && quickQuantity > part.stock) return setDialogError(`${part.name} tem apenas ${part.stock} em estoque.`);
      const mechanic = activeMechanics.find((item) => item.id === selectedQuickMechanicId) ?? activeMechanics[0];
      if (quickTotal <= 0) return setDialogError("Escolha o serviço e informe o valor antes de lançar.");
      setSaving(true);
      try {
        const saleId = await registerSale({
          origin: "Serviço rápido",
          method: quickPayment,
          account: currentAccount,
          total: quickTotal,
          mechanicId: mechanic?.id,
          mechanicName: mechanic?.name,
          items: [
            { id: `SRV-${Date.now()}`, type: "Mão de obra" as const, name: quickService, price: Number(quickServiceValue || 0) },
            ...(part ? [{
              id: part.id,
              type: "Peça" as const,
              name: part.name,
              price: Number(quickPartValue || 0) * quickQuantity,
              quantity: quickQuantity,
              cost: parseBRL(part.cost) * quickQuantity,
            }] : []),
          ],
          stockUpdates: part ? [{ productId: part.id, quantity: quickQuantity }] : [],
        });
        return finish(`Serviço rápido ${saleId} de ${formatBRL(quickTotal)} registrado${part ? " e estoque baixado" : ""}.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível registrar o serviço rápido.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "expense") {
      const isPartPurchase = expenseCategory === "Peça comprada fora do estoque";
      const isEmployeePayment = expenseCategory === "Pagamento de funcionário";
      onAddExpense({
        description: isPartPurchase ? `${expensePart} comprado para a ${expenseOrder || "OS"}` : isEmployeePayment ? `Pagamento de ${selectedEmployee?.name ?? "funcionário"}` : expenseDescription || expenseCategory,
        category: expenseCategory,
        amount: expenseCost,
        dueDate: expensePaymentMode === "Pagar depois" ? expenseDueDate.split("-").reverse().join("/") : new Date().toLocaleDateString("pt-BR"),
        status: expensePaymentMode === "Pagar depois" ? "Agendado" : "Pago",
        method: expensePaymentMode === "Caixa" ? "Dinheiro" : expensePaymentMode === "Banco" ? "Banco Inter" : "A definir",
        order: isPartPurchase ? expenseOrder : undefined,
        charged: isPartPurchase ? expenseCharged : undefined,
        employeeId: isEmployeePayment ? selectedEmployee?.id : undefined,
      });
      return finish(expensePaymentMode === "Pagar depois" ? "Gasto agendado e incluído nas contas a pagar." : "Gasto registrado e descontado do saldo da oficina.");
    }
    const messages: Record<Exclude<DialogKind, null>, string> = {
      changePassword: "Senha atualizada.",
      osChoice: "Atendimento selecionado.",
      os: "Nova ordem de serviço aberta com sucesso.",
      quick: "Serviço rápido lançado e pronto para recebimento.",
      product: "Produto adicionado ao estoque.",
      import: "Planilha recebida e pronta para importação.",
      payment: "Pagamento recebido e comprovante gerado.",
      catalog: "Produto selecionado e adicionado à venda.",
      client: "Cliente selecionado para o atendimento.",
      motorcycle: "Motocicleta cadastrada e vinculada ao proprietário.",
      employee: "Funcionário salvo e acesso atualizado.",
      supplier: "Fornecedor salvo com sucesso.",
      purchase: "Entrada registrada e estoque atualizado.",
      finance: "Movimentação registrada no caixa.",
      order: "Alterações da ordem de serviço salvas.",
      orderCheckout: "Ordem de serviço finalizada e recebimento confirmado.",
      settings: "Configurações salvas para a oficina.",
      cash: "Movimentação do caixa concluída.",
      expense: "Gasto registrado com sucesso.",
      receivable: "Conta a receber adicionada com sucesso.",
      payable: "Conta a pagar adicionada com sucesso.",
      settleReceivable: "Recebimento confirmado e saldo atualizado.",
      settlePayable: "Pagamento confirmado e conta atualizada.",
      record: "Registro atualizado com sucesso.",
    };
    finish(messages[dialog]);
  };
  const primaryLabels: Partial<Record<Exclude<DialogKind, null>, string>> = {
    quick: "Finalizar e receber",
    import: "Importar e conferir",
    payment: "Confirmar recebimento",
    catalog: "Adicionar selecionado",
    client: showQuickCustomer ? "Salvar cliente" : "Usar selecionado",
    motorcycle: "Cadastrar moto",
    employee: "Salvar funcionário",
    supplier: "Salvar fornecedor",
    purchase: "Confirmar entrada",
    finance: "Salvar movimentação",
    order: "Salvar alterações",
    orderCheckout: "Receber e finalizar OS",
    settings: "Salvar configurações",
    cash: `Confirmar ${cashAction.toLowerCase()}`,
    expense: expensePaymentMode === "Pagar depois" ? "Agendar conta a pagar" : "Registrar gasto",
    receivable: "Criar conta a receber",
    payable: "Criar conta a pagar",
    settleReceivable: "Confirmar recebimento",
    settlePayable: "Confirmar pagamento",
    record: "Concluir",
  };

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={`dialog ${["os", "order", "orderCheckout", "payment", "catalog", "settings", "expense"].includes(dialog) ? "dialog-wide" : ""} ${dialog === "orderCheckout" ? "dialog-checkout" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className="dialog-header">
          <div><span>{dialog === "os" ? `Etapa ${step} de 5` : dialog === "osChoice" ? "Novo atendimento" : ["order", "orderCheckout", "payment", "cash", "expense", "settleReceivable", "settlePayable", "record"].includes(dialog) ? "Operação" : "Cadastro e configuração"}</span><h2 id="dialog-title">{titles[dialog]}</h2><p>{subtitles[dialog]}</p></div>
          <button aria-label="Fechar" onClick={close}>×</button>
        </header>

        {dialog === "osChoice" ? (
          <div className="dialog-body attendance-choice">
            <button onClick={() => changeDialog("quick")}><span className="attendance-icon fast"><Icon name="clock"/></span><div><b>É um serviço rápido</b><strong>Atendimento expresso</strong><small>Troca de óleo, lâmpada, regulagem ou ajuste concluído na hora. Cliente e moto são opcionais.</small><em>Ir para Serviço Rápido <Icon name="arrow" size={16}/></em></div></button>
            <button onClick={() => { setStep(1); setOsOrigin("direct"); setOsItems([]); setPieceSearch(""); setLaborDescription(""); setLaborValue(""); setSelectedMechanicIds(activeMechanics.slice(0, 1).map((m) => m.id)); setCustomerLookup(""); setSelectedCustomerId(""); setSelectedMotorcycleId(""); setOsPlate(""); setNewVehicleMode(false); setOsMileage(""); setOsProblem(""); setOsPriority("Normal"); setOsFuel(""); setOsDelivery(""); setNewCustomerName(""); setNewVehicleModel(""); setNewVehicleYear(""); setDialogError(""); changeDialog("os"); }}><span className="attendance-icon full"><Icon name="wrench"/></span><div><b>É uma OS completa</b><strong>Moto ficará na oficina</strong><small>Entrada com cliente, proprietário real, origem, recepção, peças, mão de obra e acompanhamento.</small><em>Abrir OS completa <Icon name="arrow" size={16}/></em></div></button>
          </div>
        ) : null}

        {dialog === "os" ? (
          <>
            <div className="stepper" aria-label="Etapas da nova ordem de serviço">
              {["Moto e cliente", "Origem", "Recepção", "Itens", "Revisão"].map((label, index) => (
                <div className={index + 1 <= step ? "step active" : "step"} key={label}><b>{index + 1 < step ? "✓" : index + 1}</b><span>{label}</span></div>
              ))}
            </div>
            <div className="dialog-body">
              {step === 1 ? (
                <div className="form-section">
                  <div className="form-intro"><span className="form-icon"><Icon name="bike"/></span><div><h3>Localize o cliente e a moto</h3><p>WhatsApp e placa puxam automaticamente os cadastros já existentes.</p></div></div>
                  <div className="lookup-grid">
                    <section className="lookup-panel"><label className="field"><span>WhatsApp ou nome do cliente</span><div className="input-with-icon"><Icon name="search" size={17}/><input value={customerLookup} onChange={(event) => handleCustomerLookup(event.target.value)} placeholder="(34) 99999-9999 ou nome"/></div></label>{customerLookupMatch ? <div className="lookup-found"><span className="registry-avatar">{customerLookupMatch.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{customerLookupMatch.name}</strong><small>{customerLookupMatch.phone} · {customerLookupMatch.motorcycleIds.length} moto{customerLookupMatch.motorcycleIds.length === 1 ? "" : "s"} cadastrada{customerLookupMatch.motorcycleIds.length === 1 ? "" : "s"}</small></div><i>Encontrado</i></div> : <div className="lookup-empty"><Icon name="users" size={18}/><span>Nenhum cliente localizado. Você poderá cadastrá-lo sem sair da OS.</span></div>}</section>
                    <section className="lookup-panel"><label className="field"><span>Placa</span><input value={osPlate} onChange={(event) => handleOsPlate(event.target.value)} placeholder="ABC-1234 ou ABC-1D23" maxLength={8}/><small className="field-help">{platePattern(osPlate)} · formatação automática</small></label>{selectedMotorcycle && normalizePlate(selectedMotorcycle.plate) === normalizePlate(osPlate) && !newVehicleMode ? <div className="lookup-found vehicle"><span className="registry-avatar">MT</span><div><strong>{selectedMotorcycle.model}</strong><small>{selectedMotorcycle.plate} · {selectedMotorcycle.year} · {selectedMotorcycle.color}</small></div><i>Cadastro encontrado</i></div> : <div className="lookup-empty"><Icon name="bike" size={18}/><span>Placa não cadastrada. Preencha os dados da nova moto abaixo.</span></div>}</section>
                  </div>
                  {customerLookupMatch && customerMotorcycles.length > 1 && !newVehicleMode ? <div className="vehicle-choice-block"><div><strong>Qual moto está entrando?</strong><small>Este cliente possui mais de um veículo.</small></div><div className="vehicle-choice-list">{customerMotorcycles.map((motorcycle) => <button className={selectedMotorcycleId === motorcycle.id ? "selected" : ""} key={motorcycle.id} onClick={() => selectMotorcycle(motorcycle.id)}><span className="catalog-code">{motorcycle.model.includes("Biz") ? "BZ" : "CG"}</span><div><strong>{motorcycle.model}</strong><small>{motorcycle.plate} · {motorcycle.year}</small></div>{selectedMotorcycleId === motorcycle.id ? <i>✓</i> : null}</button>)}<button className="new-vehicle-choice" onClick={() => { setNewVehicleMode(true); setSelectedMotorcycleId(""); setOsPlate(""); }}><span className="catalog-code">+</span><div><strong>Nenhuma dessas</strong><small>Cadastrar uma nova moto para {selectedCustomer?.name || "cliente"}</small></div></button></div></div> : null}
                  {newVehicleMode || !customerLookupMatch ? <div className="inline-create new-vehicle-form"><label className="field"><span>Nome completo do cliente</span><input value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} placeholder="Nome do cliente"/></label><label className="field"><span>WhatsApp</span><input value={onlyDigits(customerLookup) ? customerLookup : ""} onChange={(event) => setCustomerLookup(formatPhone(event.target.value))} placeholder="(34) 99999-9999"/></label><label className="field"><span>Marca e modelo</span><input value={newVehicleModel} onChange={(event) => setNewVehicleModel(event.target.value)} placeholder="Ex.: Honda CG 160 Fan"/></label><label className="field"><span>Ano / modelo</span><input value={newVehicleYear} onChange={(event) => setNewVehicleYear(event.target.value)} placeholder="2024 / 2025"/></label><label className="field"><span>Cor</span><input placeholder="Ex.: Vermelha"/></label></div> : null}
                  {!newVehicleMode && customerLookupMatch ? <button className="soft-action" onClick={() => { setNewVehicleMode(true); setSelectedMotorcycleId(""); setOsPlate(""); }}><Icon name="plus" size={17}/>Cadastrar outro veículo para este cliente</button> : null}
                </div>
              ) : null}
              {step === 2 ? (
                <div className="form-section">
                  <div className="form-intro"><span className="form-icon"><Icon name="users"/></span><div><h3>Como esta moto chegou?</h3><p>O proprietário real continua vinculado à moto.</p></div></div>
                  <div className="choice-grid">
                    <label className={`choice-card ${osOrigin === "direct" ? "selected" : ""}`}><input type="radio" name="origin" checked={osOrigin === "direct"} onChange={() => setOsOrigin("direct")}/><span className="choice-radio"/><div><strong>Cliente direto</strong><small>O próprio cliente trouxe a moto</small></div></label>
                    <label className={`choice-card ${osOrigin === "partner" ? "selected" : ""}`}><input type="radio" name="origin" checked={osOrigin === "partner"} onChange={() => setOsOrigin("partner")}/><span className="choice-radio"/><div><strong>Encaminhado por parceiro</strong><small>Empresa cadastrada encaminhou a moto</small></div></label>
                  </div>
                  <div className="form-grid">
                    <label className="field"><span>Responsável pelo pagamento</span><select defaultValue={osOrigin === "partner" ? "partner" : "owner"}><option value="owner">Proprietário da moto</option><option value="partner">Empresa parceira</option><option value="other">Outro responsável</option></select></label>
                    {osOrigin === "partner" ? <label className="field"><span>Parceiro responsável</span><select value={selectedPartnerId} onChange={(event) => setSelectedPartnerId(event.target.value)}>{activePartners.map((partner) => <option value={partner.id} key={partner.id}>{partner.name} · {partner.laborDiscount}% mão de obra</option>)}</select></label> : <label className="field"><span>Origem</span><input value="Atendimento direto" readOnly/></label>}
                    {osOrigin === "partner" ? <><label className="field"><span>Entregador / condutor</span><input placeholder="Nome de quem trouxe a moto"/></label><label className="field"><span>Contato do entregador</span><input placeholder="(34) 99999-9999"/></label></> : null}
                  </div>
                  <div className="info-strip"><Icon name="check" size={18}/><span>{osOrigin === "partner" ? `${selectedPartner?.name ?? "O parceiro"} recebe ${selectedPartner?.laborDiscount ?? 0}% de desconto somente na mão de obra. Peças permanecem com o preço fixo.` : "O cliente será o responsável financeiro desta OS. Isso pode ser alterado depois."}</span></div>
                </div>
              ) : null}
              {step === 3 ? (
                <div className="form-section">
                  <div className="form-intro"><span className="form-icon"><Icon name="wrench"/></span><div><h3>Dados da recepção</h3><p>Registre a reclamação e escolha um ou mais mecânicos responsáveis.</p></div></div>
                  <div className="form-grid">
                    <label className="field"><span>Quilometragem</span><input value={osMileage} onChange={(event) => setOsMileage(event.target.value)} placeholder="Ex.: 38.420 km"/></label>
                    <label className="field"><span>Nível de combustível</span><select value={currentFuel} onChange={(event) => setOsFuel(event.target.value)}>{fuelLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
                    <label className="field field-full"><span>Problema relatado pelo cliente</span><textarea value={osProblem} onChange={(event) => setOsProblem(event.target.value)} placeholder="Descreva o problema relatado ou serviço solicitado"/></label>
                    <label className="field"><span>Prioridade</span><select value={currentPriority} onChange={(event) => setOsPriority(event.target.value)}>{orderPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                    <label className="field"><span>Previsão de entrega</span><input type="date" value={osDelivery} onChange={(event) => setOsDelivery(event.target.value)}/></label>
                    <label className="field"><span>Odômetro conferido?</span><select><option>Sim</option><option>Não</option></select></label>
                  </div>
                  <div className="mechanic-assignment">
                    <div><strong>Mecânicos responsáveis</strong><small>Todos os selecionados poderão atualizar a situação desta OS.</small></div>
                    {activeMechanics.length > 0 ? (
                      <div className="mechanic-picker">
                        {activeMechanics.map((mechanic) => (
                          <button className={selectedMechanicIds.includes(mechanic.id) ? "selected" : ""} key={mechanic.id} onClick={() => toggleMechanic(mechanic.id, "new")}>
                            <span className="mechanic-avatar">{mechanic.name[0]}</span>
                            <div><strong>{mechanic.name}</strong><small>{mechanic.position} · {mechanic.currentOrders || 0} OS</small></div>
                            <i>{selectedMechanicIds.includes(mechanic.id) ? "✓" : "+"}</i>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="lookup-empty" style={{ padding: "12px" }}>
                        <Icon name="wrench" size={18}/>
                        <span>Nenhum funcionário com função Mecânico ativo. Cadastre um mecânico na aba "Funcionários".</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              {step === 4 ? (
                <div className="form-section">
                  <div className="form-intro"><span className="form-icon"><Icon name="box"/></span><div><h3>Peças e mão de obra</h3><p>Peças usam o preço fixo do cadastro. A mão de obra é informada manualmente.</p></div></div>
                  <div className="os-items-builder">
                    <section className="os-catalog-panel"><div className="os-builder-title"><div><strong>Adicionar peças</strong><small>Preço de venda bloqueado pelo cadastro</small></div><span>{products.filter((product) => product.stock > 0).length} disponíveis</span></div><label className="mini-search"><Icon name="search" size={16}/><input value={pieceSearch} onChange={(event) => setPieceSearch(event.target.value)} placeholder="Buscar peça ou código"/></label><div className="os-piece-list">{products.filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(pieceSearch.toLowerCase())).map((product) => { const added = osItems.some((item) => item.id === product.code); return <button className={added ? "added" : ""} key={product.code} disabled={product.stock === 0} onClick={() => setOsItems((current) => added ? current : [...current, { id: product.code, type: "Peça", name: product.name, price: parseBRL(product.price), cost: parseBRL(product.cost) }])}><span className="catalog-code">{product.code.slice(-2)}</span><div><strong>{product.name}</strong><small>{product.code} · {product.stock} em estoque</small></div><b>{product.price}</b><i>{product.stock === 0 ? "Sem estoque" : added ? "Adicionada" : "+"}</i></button>; })}</div></section>
                    <section className="os-labor-panel"><div className="os-builder-title"><div><strong>Adicionar mão de obra</strong><small>Descrição e valor digitados para esta OS</small></div></div><div className="form-grid"><label className="field field-full"><span>Descrição</span><input value={laborDescription} onChange={(event) => setLaborDescription(event.target.value)} placeholder="Ex.: Troca do kit relação"/></label><label className="field"><span>Valor da mão de obra</span><input type="number" value={laborValue} onChange={(event) => setLaborValue(event.target.value)}/></label><button className="primary-button labor-add-button" onClick={() => { if (!laborDescription.trim() || Number(laborValue) <= 0) return; setOsItems((current) => [...current, { id: `LAB-${Date.now()}`, type: "Mão de obra", name: laborDescription.trim(), price: Number(laborValue) }]); setLaborDescription(""); setLaborValue(""); }}><Icon name="plus" size={16}/>Adicionar mão de obra</button></div><div className="labor-rule"><Icon name="check" size={17}/><span>O valor vale somente para esta OS e não altera o cadastro de serviços.</span></div></section>
                  </div>
                  <div className="selected-os-items"><div className="os-builder-title"><div><strong>Itens incluídos</strong><small>{osItems.length ? `${osItems.length} item${osItems.length === 1 ? "" : "s"} nesta OS` : "Nenhum item adicionado ainda"}</small></div></div>{osItems.length ? osItems.map((item) => <div className="selected-os-item" key={item.id}><span className={`item-type ${item.type === "Peça" ? "part" : "labor"}`}>{item.type}</span><div><strong>{item.name}</strong><small>{item.type === "Peça" ? "Preço fixo do cadastro" : "Valor manual desta OS"}</small></div><b>{formatBRL(item.price)}</b><button aria-label={`Remover ${item.name}`} onClick={() => setOsItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}>×</button></div>) : <div className="empty-os-items"><Icon name="box"/><span>Adicione as peças e a mão de obra que já souber. Você poderá completar depois.</span></div>}<div className="os-items-total"><span>Peças <b>{formatBRL(partsTotal)}</b></span><span>Mão de obra <b>{formatBRL(laborTotal)}</b></span>{partnerDiscount > 0 ? <span className="discount">Desconto parceiro <b>− {formatBRL(partnerDiscount)}</b></span> : null}<strong>Total inicial {formatBRL(osTotal)}</strong></div></div>
                </div>
              ) : null}
              {step === 5 ? (
                <div className="review-card">
                  <div className="review-success"><Icon name="check"/><div><strong>Tudo pronto para abrir a OS</strong><span>Confira os dados, responsáveis e valores antes de confirmar.</span></div></div>
                  <div className="review-grid">
                    <div><span>Cliente</span><strong>{customerLookupMatch?.name ?? "Novo cliente"}</strong><small>{customerLookupMatch?.phone ?? customerLookup}</small></div>
                    <div><span>Motocicleta</span><strong>{selectedMotorcycle && !newVehicleMode ? selectedMotorcycle.model : "Nova motocicleta"}</strong><small>{osPlate || "Placa a informar"}{selectedMotorcycle && !newVehicleMode ? ` · ${selectedMotorcycle.year}` : ""}</small></div>
                    <div><span>Origem / Pagador</span><strong>{osOrigin === "partner" ? selectedPartner?.name : "Cliente direto"}</strong><small>{osOrigin === "partner" ? `${selectedPartner?.billingCycle} · ${selectedPartner?.laborDiscount}% na mão de obra` : "Proprietário da moto"}</small></div>
                    <div><span>Mecânicos responsáveis</span><strong>{selectedMechanics.length ? selectedMechanics.map((mechanic) => mechanic.name).join(" + ") : "Não definido"}</strong><small>{selectedMechanics.length === 1 ? "1 mecânico poderá atualizar a OS" : `${selectedMechanics.length} mecânicos poderão atualizar a OS`}</small></div>
                  </div>
                  <div className="review-problem"><span>Problema relatado</span><p>{customerLookupMatch ? "Conforme informado na recepção da motocicleta." : "Aguardando preenchimento na recepção."}</p></div>
                  <div className="review-items-summary"><div><span>Peças com preço fixo</span><strong>{formatBRL(partsTotal)}</strong></div><div><span>Mão de obra manual</span><strong>{formatBRL(laborTotal)}</strong></div>{partnerDiscount > 0 ? <div><span>Desconto do parceiro</span><strong>− {formatBRL(partnerDiscount)}</strong></div> : null}<div className="review-grand-total"><span>Total inicial</span><strong>{formatBRL(osTotal)}</strong></div></div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {dialog === "quick" ? (
          <div className="dialog-body form-section">
            <div className="quick-service-banner"><span><Icon name="clock"/></span><div><strong>Atendimento sem cadastro completo</strong><small>Ideal para serviços concluídos na hora.</small></div></div>
            <div className="quick-service-options">
              {enabledQuickServices.map((service) => <button className={quickService === service.name ? "selected" : ""} key={service.id} onClick={() => { setQuickService(service.name); setQuickServiceValue(String(service.laborPrice)); if (!service.productRequired) setQuickProduct("Sem produto"); }}><Icon name={service.name.toLowerCase().includes("óleo") ? "wallet" : "wrench"} size={17}/><span>{service.name}</span><small>{service.duration} min</small>{quickService === service.name ? <i>✓</i> : null}</button>)}
            </div>
            <div className="form-grid">
              <label className="field"><span>Valor do serviço</span><input type="number" value={quickServiceValue} onChange={(event) => setQuickServiceValue(event.target.value)}/></label>
              <label className="field"><span>Mecânico</span><select value={activeMechanics.some((mechanic) => mechanic.id === selectedQuickMechanicId) ? selectedQuickMechanicId : activeMechanics[0]?.id ?? ""} onChange={(event) => setSelectedQuickMechanicId(event.target.value)}>{activeMechanics.map((mechanic) => <option value={mechanic.id} key={mechanic.id}>{mechanic.name} · {mechanic.currentOrders} OS</option>)}</select></label>
              <label className="field field-full"><span>Produto ou peça utilizada</span><select value={quickProduct} onChange={(event) => setQuickProduct(event.target.value)}><option value="Sem produto">Sem produto</option>{products.map((p) => <option value={p.name} key={p.id}>{p.name}</option>)}</select></label>
              {quickProduct !== "Sem produto" ? <><label className="field"><span>Quantidade</span><input type="number" min="1" value={quickQuantity} onChange={(event) => setQuickQuantity(Math.max(1, Number(event.target.value)))}/></label><label className="field"><span>Preço cobrado da peça</span><input type="number" value={quickPartValue} onChange={(event) => setQuickPartValue(event.target.value)}/></label></> : null}
              <label className="field"><span>Cliente (opcional)</span><input placeholder="Nome ou telefone"/></label>
              <label className="field"><span>Moto / placa (opcional)</span><input placeholder="Ex.: CG 160 · ABC-1234"/></label>
              <label className="field"><span>Pagamento</span><select value={quickPayment} onChange={(event) => setQuickPayment(event.target.value)}>{activePaymentMethods.filter((method) => method.name !== "Faturamento parceiro").map((method) => <option key={method.id}>{method.name}</option>)}</select></label>
              <label className="field"><span>Conta de entrada</span><select value={currentAccount} onChange={(event) => setQuickAccount(event.target.value)}>{cashAccounts.map((account) => <option key={account}>{account}</option>)}{activePaymentMachines.map((machine) => <option key={machine.id}>{machine.name}</option>)}</select></label>
            </div>
            <div className="quick-service-total"><div><span>{quickService}</span><small>{quickProduct === "Sem produto" ? "Somente mão de obra" : `${quickQuantity}x ${quickProduct} · ${quickPayment}`}</small></div><strong>{formatBRL(quickTotal)}</strong></div>
            <div className="info-strip"><Icon name="check" size={18}/><span>Ao finalizar, o produto será baixado do estoque, o recebimento entra no caixa e um cupom não fiscal fica pronto para impressão.</span></div>
          </div>
        ) : null}

        {dialog === "import" ? (
          <div className="dialog-body form-section">
            <div className="upload-zone">
              <span className="upload-icon"><Icon name="file"/></span>
              <strong>Selecione a planilha preenchida</strong>
              <p>Formato CSV exportado pelo Google Sheets, até 5 MB.</p>
              <label className="outline-button large file-picker">Escolher arquivo<input type="file" accept=".csv,text/csv"/></label>
            </div>
            <button className="template-link" onClick={downloadStockTemplate}><Icon name="arrow" size={16}/>Ainda não tem o modelo? Baixar planilha de exemplo</button>
            <div className="info-strip"><Icon name="check" size={18}/><span>Antes de cadastrar, o sistema mostrará os itens com erro ou dados duplicados para você conferir.</span></div>
          </div>
        ) : null}

        {dialog === "catalog" ? (
          <div className="dialog-body">
            <label className="pdv-search modal-search"><Icon name="search"/><input autoFocus value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar produto, código de barras ou SKU"/><kbd>F2</kbd></label>
            <div className="catalog-filters">{["Todos", ...productCategoryNames].map((category) => <button className={catalogCategory === category ? "selected" : ""} key={category} onClick={() => setCatalogCategory(category)}>{category}</button>)}</div>
            <div className="catalog-list">{products.filter((product) => (catalogCategory === "Todos" || product.category === catalogCategory) && `${product.name} ${product.code} ${product.barcode ?? ""}`.toLowerCase().includes(catalogSearch.toLowerCase())).map((product) => (
              <button className={catalogSelection === product.code ? "catalog-row selected" : "catalog-row"} key={product.code} onClick={() => setCatalogSelection(product.code)} disabled={product.stock === 0}>
                <span className="catalog-code">{product.code.slice(-2)}</span>
                <span><strong>{product.name}</strong><small>{product.code} · {product.category}</small></span>
                <span><small>Disponível</small><b className={product.stock <= product.minimum ? "danger-text" : ""}>{product.stock} un.</b></span>
                <strong>{product.price}</strong>
                <i>{catalogSelection === product.code ? "✓" : "+"}</i>
              </button>
            ))}</div>
          </div>
        ) : null}

        {dialog === "payment" ? (
          <div className="dialog-body payment-body">
            <div className="payment-total-card"><span>Total da venda</span><strong>{formatBRL(paymentGross)}</strong><small>Pagamento no PDV</small></div>
            <div className="form-label">Escolha a forma de pagamento</div>
            <div className="payment-methods">{activePaymentMethods.map((methodConfig) => { const method = methodConfig.name; return (
              <button className={paymentMethod === method ? "selected" : ""} key={method} onClick={() => setPaymentMethod(method)}><span>{method === "PIX" ? "PX" : method.slice(0, 2).toUpperCase()}</span><strong>{method}</strong>{paymentMethod === method ? <i>✓</i> : null}</button>
            ); })}</div>
            <label className="toggle-row"><input type="checkbox" checked={splitPayment} onChange={(event) => setSplitPayment(event.target.checked)}/><span/><div><strong>Dividir pagamento</strong><small>Use duas ou mais formas na mesma venda</small></div></label>
            {splitPayment ? <div className="split-payment-grid"><label className="field"><span>Primeira forma</span><select><option>PIX</option><option>Dinheiro</option><option>Débito</option></select></label><label className="field"><span>Valor</span><input placeholder="R$ 0,00"/></label><label className="field"><span>Segunda forma</span><select><option>Crédito</option><option>PIX</option><option>Dinheiro</option></select></label><label className="field"><span>Restante</span><input placeholder="R$ 0,00"/></label></div> : null}
            {["Débito", "Crédito"].includes(paymentMethod) ? <><div className="form-grid payment-extra"><label className="field"><span>Maquininha utilizada</span><select value={selectedMachine?.id ?? ""} onChange={(event) => setSelectedMachineId(event.target.value)}>{activePaymentMachines.map((machine) => <option value={machine.id} key={machine.id}>{machine.name}{machine.primary ? " · principal" : ""}</option>)}</select></label>{paymentMethod === "Crédito" ? <label className="field"><span>Parcelas</span><select value={paymentInstallments} onChange={(event) => setPaymentInstallments(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((installment) => <option value={installment} key={installment}>{installment}x</option>)}</select></label> : <label className="field"><span>Recebimento</span><input value={selectedMachine?.settlementDays === 0 ? "Na hora" : `D+${selectedMachine?.settlementDays ?? 1}`} readOnly/></label>}</div><div className="machine-fee-summary"><div><span>Valor bruto</span><strong>{formatBRL(paymentGross)}</strong></div><div><span>Taxa da {selectedMachine?.name ?? "máquina"}</span><strong>− {formatBRL(paymentFeeAmount)}</strong><small>{paymentFeeRate.toFixed(2).replace(".", ",")}%</small></div><div><span>Valor líquido</span><strong>{formatBRL(paymentGross - paymentFeeAmount)}</strong></div></div></> : null}
            {paymentMethod === "Dinheiro" ? <div className="form-grid payment-extra"><label className="field"><span>Valor recebido</span><input placeholder="R$ 0,00"/></label><div className="change-box"><span>Troco</span><strong>R$ 0,00</strong></div></div> : null}
            {paymentMethod === "Nota a prazo" ? <div className="credit-warning"><Icon name="alert" size={18}/><div><strong>Venda a prazo</strong><small>Cliente obrigatório. Vencimento registrado no contas a receber.</small></div></div> : null}
            {paymentMethod === "Troca de serviços" ? <div className="trade-payment-card"><div className="trade-payment-head"><span><Icon name="users" size={18}/></span><div><strong>Compensar com trabalho ou serviço</strong><small>Quita o débito sem lançar entrada em dinheiro no caixa.</small></div></div><div className="form-grid"><label className="field field-full"><span>Serviço recebido do cliente</span><input value={tradeServiceDescription} onChange={(event) => setTradeServiceDescription(event.target.value)} placeholder="Ex.: Serviço combinado com o cliente"/></label><label className="field"><span>Valor acordado</span><input type="number" min="0" value={tradeValue} onChange={(event) => setTradeValue(event.target.value)}/></label><label className="field"><span>Valor compensado agora</span><input value={formatBRL(Math.min(Number(tradeValue) || 0, paymentGross))} readOnly/></label></div><div className="trade-cash-note"><Icon name="check" size={16}/><span>Entrada em caixa: <strong>R$ 0,00</strong>. A movimentação ficará no histórico financeiro como compensação.</span></div></div> : null}
          </div>
        ) : null}

        {dialog === "purchase" ? (
          <div className="dialog-body form-section">
            <div className="form-grid">
              <label className="field field-full"><span>Fornecedor</span><select>{activeSuppliers.length ? activeSuppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name} · {supplier.deliveryDays === 0 ? "entrega no dia" : `${supplier.deliveryDays} dia${supplier.deliveryDays === 1 ? "" : "s"}`}</option>) : <option value="">Nenhum fornecedor cadastrado</option>}</select></label>
              <label className="field"><span>Data da entrada</span><input type="date" defaultValue={new Date().toISOString().split("T")[0]}/></label><label className="field"><span>Pagamento</span><select><option>À vista</option><option>A prazo</option><option>Parcial</option></select></label>
            </div>
            <div className="purchase-items"><div className="purchase-head"><strong>Produtos da entrada</strong><button onClick={() => setExtraPurchaseItem(true)}><Icon name="plus" size={16}/>Adicionar produto</button></div><div className="purchase-row"><select>{products.length ? products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>) : <option>Selecione um produto</option>}</select><input type="number" defaultValue="1" placeholder="Qtd"/><input placeholder="R$ Custo"/><strong>R$ 0,00</strong></div>{extraPurchaseItem ? <div className="purchase-row"><select>{products.length ? products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>) : <option>Selecione um produto</option>}</select><input type="number" defaultValue="1" placeholder="Qtd"/><input placeholder="R$ Custo"/><strong>R$ 0,00</strong></div> : null}</div>
            <div className="purchase-total"><span>Total da entrada</span><strong>R$ 0,00</strong></div>
            <div className="info-strip"><Icon name="check" size={18}/><span>Ao salvar, a quantidade entra no estoque e o custo médio será recalculado. Nenhuma nota fiscal será emitida.</span></div>
          </div>
        ) : null}

        {dialog === "finance" ? (
          <div className="dialog-body form-section">
            <div className="choice-grid">
              <label className="choice-card selected"><input type="radio" name="movement" defaultChecked/><span className="choice-radio"/><div><strong>Entrada</strong><small>Dinheiro recebido</small></div></label>
              <label className="choice-card"><input type="radio" name="movement"/><span className="choice-radio"/><div><strong>Saída</strong><small>Despesa ou retirada</small></div></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Valor</span><input placeholder="R$ 0,00"/></label><label className="field"><span>Categoria</span><select><option>Venda balcão</option><option>Serviço</option><option>Compra de peças</option><option>Sangria</option><option>Suprimento</option></select></label>
              <label className="field"><span>Forma</span><select><option>PIX</option><option>Dinheiro</option><option>Débito</option><option>Crédito</option><option>Transferência</option></select></label><label className="field"><span>Data</span><input type="date" defaultValue={new Date().toISOString().split("T")[0]}/></label>
              <label className="field field-full"><span>Descrição</span><textarea placeholder="Motivo ou observação da movimentação"/></label>
            </div>
          </div>
        ) : null}

        {dialog === "expense" ? (
          <div className="dialog-body expense-body">
            <div className="expense-mode-grid">
              {[{name:"Caixa", detail:"Pagar em dinheiro agora", icon:"wallet" as IconName},{name:"Banco", detail:"PIX, débito ou transferência", icon:"arrow" as IconName},{name:"Pagar depois", detail:"Gerar conta a pagar", icon:"clock" as IconName}].map((mode) => <button className={expensePaymentMode === mode.name ? "selected" : ""} key={mode.name} onClick={() => setExpensePaymentMode(mode.name)}><span><Icon name={mode.icon}/></span><div><strong>{mode.name}</strong><small>{mode.detail}</small></div>{expensePaymentMode === mode.name ? <i>✓</i> : null}</button>)}
            </div>
            <div className="form-section form-top-gap">
              <div className="form-grid">
                <label className="field field-full"><span>Categoria do gasto</span><select value={expenseCategory} onChange={(event) => { const category = event.target.value; setExpenseCategory(category); if (category === "Pagamento de funcionário") setExpenseAmount(String(selectedEmployee?.baseSalary || 0)); }}>{expenseCategoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label>
                {expenseCategory === "Peça comprada fora do estoque" ? <>
                  <label className="field field-full"><span>Nome da peça comprada</span><input value={expensePart} onChange={(event) => setExpensePart(event.target.value)} placeholder="Ex.: Retificador CG 160"/></label>
                  <label className="field"><span>Ordem de serviço</span><select value={expenseOrder} onChange={(event) => setExpenseOrder(event.target.value)}>{orders?.length ? orders.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.customer}</option>) : null}<option value="Sem vínculo">Sem vínculo com OS</option></select></label>
                  <label className="field"><span>Fornecedor / onde comprou</span><select>{activeSuppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}<option>Outro fornecedor</option></select></label>
                  <label className="field"><span>Preço de custo</span><input type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0,00"/></label>
                  <label className="field"><span>Preço cobrado do cliente</span><input type="number" value={expenseSale} onChange={(event) => setExpenseSale(event.target.value)} placeholder="0,00"/></label>
                </> : expenseCategory === "Pagamento de funcionário" ? <>
                  <label className="field field-full"><span>Funcionário que receberá</span><select value={expenseEmployeeId} onChange={(event) => { const employeeId = event.target.value; setExpenseEmployeeId(employeeId); const employee = users.find((user) => user.id === employeeId); setExpenseAmount(String(employee?.baseSalary || 0)); }}>{users.filter((user) => user.active).map((user) => <option value={user.id} key={user.id}>{user.name} · {user.position}</option>)}</select></label>
                  <label className="field"><span>Vínculo</span><input value={selectedEmployee?.employmentType ?? ""} readOnly/></label><label className="field"><span>Salário padrão cadastrado</span><input value={formatBRL(selectedEmployee?.baseSalary ?? 0)} readOnly/></label>
                  <label className="field"><span>Valor deste pagamento</span><input type="number" min="0" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)}/></label><label className="field"><span>Referência</span><input defaultValue={new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}/></label>
                </> : <>
                  <label className="field field-full"><span>Descrição do gasto</span><input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Ex.: Frete urgente de motopeças"/></label>
                  <label className="field"><span>Valor do gasto</span><input type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0,00"/></label>
                  <label className="field"><span>Fornecedor ou favorecido</span><input placeholder="Opcional"/></label>
                </>}
                {expensePaymentMode === "Pagar depois" ? <><label className="field"><span>Data de vencimento</span><input type="date" value={expenseDueDate} onChange={(event) => setExpenseDueDate(event.target.value)}/></label><label className="field"><span>Forma prevista</span><select><option>PIX</option><option>Boleto</option><option>Transferência</option><option>A definir</option></select></label></> : <><label className="field"><span>{expensePaymentMode === "Caixa" ? "Caixa de saída" : "Conta bancária"}</span><select><option>{expensePaymentMode === "Caixa" ? "Caixa balcão" : "Banco Inter PJ"}</option><option>Banco Bradesco PJ</option></select></label><label className="field"><span>Data do pagamento</span><input type="date" defaultValue={new Date().toISOString().split("T")[0]}/></label></>}
              </div>
            </div>
            {expenseCategory === "Peça comprada fora do estoque" ? <div className="emergency-part-summary"><div><span>Custo da peça</span><strong>{formatBRL(expenseCost)}</strong></div><div><span>Cobrado do cliente</span><strong>{formatBRL(expenseCharged)}</strong></div><div className={expenseMargin >= 0 ? "positive" : "negative"}><span>Margem bruta</span><strong>{formatBRL(expenseMargin)}</strong><small>{expenseCost > 0 ? `${((expenseMargin / expenseCost) * 100).toFixed(1).replace(".", ",")}% sobre o custo` : "Informe o custo"}</small></div></div> : null}
            {expenseCategory === "Pagamento de funcionário" ? <div className="employee-payment-summary"><span className="registry-avatar">{selectedEmployee?.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span><div><span>Pagamento para</span><strong>{selectedEmployee?.name}</strong><small>{selectedEmployee?.position} · {selectedEmployee?.employmentType}</small></div><b>{formatBRL(expenseCost)}</b></div> : null}
            <div className="info-strip"><Icon name="check" size={18}/><span>{expensePaymentMode === "Pagar depois" ? "Este gasto aparecerá automaticamente em Contas a Pagar." : "O valor será lançado no caixa e aparecerá no financeiro e nos relatórios."}{expenseCategory === "Peça comprada fora do estoque" ? " A peça fica vinculada à OS sem precisar entrar no estoque." : expenseCategory === "Pagamento de funcionário" ? " O funcionário selecionado ficará identificado no histórico e no cálculo do lucro líquido." : ""}</span></div>
          </div>
        ) : null}

        {dialog === "receivable" || dialog === "payable" ? (
          <div className="dialog-body form-section">
            <div className="form-grid">
              <label className="field field-full"><span>{dialog === "receivable" ? "Cliente ou pagador" : "Fornecedor ou favorecido"}</span><select>{dialog === "receivable" ? clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>) : activeSuppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}<option>Cadastro avulso</option></select></label>
              <label className="field field-full"><span>Descrição</span><input placeholder={dialog === "receivable" ? "Ex.: Parcela de peças e serviço" : "Ex.: Compra de peças · parcela 1/2"}/></label>
              <label className="field"><span>Valor total</span><input placeholder="R$ 0,00"/></label><label className="field"><span>Vencimento</span><input type="date" defaultValue={new Date().toISOString().split("T")[0]}/></label>
              <label className="field"><span>Categoria</span><select><option>{dialog === "receivable" ? "Serviços de oficina" : "Fornecedor de peças"}</option><option>{dialog === "receivable" ? "Venda de peças" : "Despesa operacional"}</option><option>Outros</option></select></label><label className="field"><span>Parcelas</span><select><option>Parcela única</option><option>2 parcelas</option><option>3 parcelas</option></select></label>
              <label className="field field-full"><span>Observações</span><textarea placeholder="Informações opcionais sobre cobrança ou pagamento"/></label>
            </div>
          </div>
        ) : null}

        {dialog === "settleReceivable" || dialog === "settlePayable" ? (
          <div className="dialog-body form-section">
            <div className={`settlement-card ${dialog === "settleReceivable" ? "receive" : "pay"}`}><span>{dialog === "settleReceivable" ? "Saldo a receber" : "Saldo a pagar"}</span><strong>R$ 0,00</strong><small>{dialog === "settleReceivable" ? "Conta a receber" : "Conta a pagar"}</small></div>
            <div className="form-grid form-top-gap"><label className="field"><span>Valor desta baixa</span><input placeholder="R$ 0,00"/></label><label className="field"><span>Data</span><input type="date" defaultValue={new Date().toISOString().split("T")[0]}/></label><label className="field"><span>Forma de pagamento</span><select><option>PIX</option><option>Dinheiro</option><option>Débito</option><option>Crédito</option><option>Transferência</option></select></label><label className="field"><span>{dialog === "settleReceivable" ? "Conta de entrada" : "Conta de saída"}</span><select>{cashAccounts.map((account) => <option key={account}>{account}</option>)}{activePaymentMachines.map((machine) => <option key={machine.id}>{machine.name}</option>)}</select></label></div>
            <label className="toggle-row"><input type="checkbox" defaultChecked/><span/><div><strong>Quitar este lançamento</strong><small>Desative para registrar apenas um pagamento parcial</small></div></label>
          </div>
        ) : null}

        {dialog === "cash" ? (
          <div className="dialog-body form-section">
            <div className="cash-balance"><span>Saldo atual do caixa</span><strong>{formatBRL(dialogSummary.cashBalance)}</strong><small>Recebido menos gastos pagos</small></div>
            <div className="cash-actions">{[{name:"Suprimento", detail:"Adicionar dinheiro", icon:"plus" as IconName},{name:"Sangria", detail:"Retirar dinheiro", icon:"arrow" as IconName},{name:"Fechar caixa", detail:"Conferir o dia", icon:"check" as IconName}].map((action) => <button className={cashAction === action.name ? "selected" : ""} key={action.name} onClick={() => setCashAction(action.name)}><Icon name={action.icon}/><strong>{action.name}</strong><small>{action.detail}</small></button>)}</div>
            <div className="form-grid form-top-gap"><label className="field"><span>Valor</span><input placeholder="R$ 0,00"/></label><label className="field"><span>Motivo</span><input placeholder="Ex.: Troco para o caixa"/></label></div>
          </div>
        ) : null}

        {dialog === "order" ? (
          <div className="dialog-body order-detail">
            {currentOrder ? (
              <>
                <div className="order-detail-top"><span className={`status ${orderStatusTone}`}><i/>{orderStatus === "Entrega" ? "Pronta para entrega" : orderStatus}</span><div className="order-actions"><button onClick={() => finish(`3 vias da ${currentOrder.id} preparadas: mecânico, caixa e cliente.`)}><Icon name="file" size={16}/>Imprimir 3 vias</button><button onClick={() => finish(`Link da ${currentOrder.id} preparado para envio no WhatsApp.`)}><Icon name="arrow" size={16}/>WhatsApp</button></div></div>
                <section className="order-status-control"><div><span>Situação atual da OS</span><strong>{orderStatus === "Entrega" ? "Serviço pronto — aguardando entrega" : orderStatus}</strong><small>Os mecânicos atribuídos podem atualizar esta situação.</small></div><label className="field"><span>Alterar situação</span><select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as ServiceOrderStatus)}>{serviceOrderStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><button className={orderStatus === "Entrega" ? "ready-action done" : "ready-action"} onClick={() => setOrderStatus(orderStatus === "Entrega" ? "Em serviço" : "Entrega")}><Icon name={orderStatus === "Entrega" ? "wrench" : "check"} size={17}/>{orderStatus === "Entrega" ? "Voltar para em serviço" : "Marcar como pronta"}</button></section>
                <div className="order-info-grid"><div><span>Cliente / pagador</span><strong>{currentOrder.customer}</strong><small>{currentOrder.origin}</small></div><div><span>Motocicleta</span><strong>{currentOrder.bike}</strong><small>{currentOrder.plate}</small></div><div><span>Mecânicos</span><strong>{orderMechanics.map((mechanic) => mechanic.name).join(" + ") || currentOrder.mechanic}</strong><small>{orderMechanics.length || 1} responsável(is)</small></div><div><span>Previsão</span><strong>{currentOrder.delivery}</strong><small>Prioridade {currentOrder.priority}</small></div></div>
                {canOperate ? (
                  <div className="mechanic-assignment compact">
                    <div><strong>Equipe responsável</strong><small>Selecione mais de um mecânico quando o serviço for compartilhado.</small></div>
                    {activeMechanics.length > 0 ? (
                      <div className="mechanic-picker">
                        {activeMechanics.map((mechanic) => (
                          <button className={orderMechanicIds.includes(mechanic.id) ? "selected" : ""} key={mechanic.id} onClick={() => toggleMechanic(mechanic.id, "existing")}>
                            <span className="mechanic-avatar">{mechanic.name[0]}</span>
                            <div><strong>{mechanic.name}</strong><small>{mechanic.currentOrders || 0} OS agora</small></div>
                            <i>{orderMechanicIds.includes(mechanic.id) ? "✓" : "+"}</i>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="lookup-empty" style={{ padding: "10px" }}>
                        <span>Nenhum mecânico ativo cadastrado.</span>
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="order-section"><div className="order-section-title"><div><strong>Peças e serviços aprovados</strong><small>A baixa ocorre somente quando a peça for usada</small></div>{canOperate ? <button onClick={() => setExtraOrderItem(true)}><Icon name="plus" size={15}/>Adicionar item</button> : <span className="status blue"><i/>Somente leitura</span>}</div><div className="order-item"><span className="catalog-code">01</span><div><strong>{currentOrder.service}</strong><small>Mão de obra · {currentOrder.mechanic}</small></div><b>{formatBRL(currentOrder.total ?? 0)}</b></div>{extraOrderItem ? <div className="order-item"><span className="catalog-code">02</span><div><strong>Ajuste complementar</strong><small>Serviço adicional</small></div><b>R$ 0,00</b></div> : null}<div className="order-total"><span>Total aprovado</span><strong>{currentOrder.total}</strong></div></div>
                <div className="order-progress interactive">{serviceOrderStatuses.map((item, index) => { const currentIndex = serviceOrderStatuses.indexOf(orderStatus); return <button className={index <= currentIndex ? "done" : ""} key={item} onClick={() => setOrderStatus(item)}><i>{index < currentIndex ? "✓" : index + 1}</i><span>{item}</span></button>; })}</div>
              </>
            ) : (
              <div className="empty-panel"><Icon name="wrench" size={24}/><span>Nenhuma ordem de serviço ativa.</span></div>
            )}
          </div>
        ) : null}

        {dialog === "orderCheckout" ? (
          <div className="dialog-body order-checkout">
            <div className="checkout-ready-banner"><span><Icon name="check" size={20}/></span><div><strong>Moto pronta para entrega</strong><small>Revise somente o que foi executado ou utilizado. Depois do recebimento, a OS será encerrada.</small></div><b>{currentOrder ? currentOrder.id : "OS"}</b></div>
            <div className="order-checkout-layout">
              <section className="checkout-items-panel">
                <div className="checkout-panel-title"><div><strong>Peças e mão de obra finais</strong><small>Você ainda pode corrigir os itens antes de cobrar.</small></div><span>{checkoutItems.length} itens</span></div>
                <div className="checkout-item-list">{checkoutItems.length ? checkoutItems.map((item, index) => <div className="checkout-item" key={item.id}><span className={`item-type ${item.type === "Peça" ? "part" : "labor"}`}>{item.type}</span><div><strong>{item.name}</strong><small>{item.type === "Peça" ? "Preço fixo do produto" : "Valor informado nesta OS"}</small></div><b>{formatBRL(item.price)}</b><button aria-label={`Remover ${item.name}`} onClick={() => setCheckoutItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>) : <div className="empty-panel"><Icon name="box" size={20}/><span>Nenhum item adicionado ao fechamento.</span></div>}</div>
                <div className="checkout-totals"><span>Peças <b>{formatBRL(checkoutPartsTotal)}</b></span><span>Mão de obra <b>{formatBRL(checkoutLaborTotal)}</b></span><strong>Total da OS <b>{formatBRL(checkoutTotal)}</b></strong></div>

                <div className="checkout-add-block"><div className="checkout-add-title"><Icon name="box" size={17}/><div><strong>Adicionar outra peça</strong><small>O valor de venda vem bloqueado do cadastro.</small></div></div><label className="mini-search"><Icon name="search" size={16}/><input value={checkoutPieceSearch} onChange={(event) => setCheckoutPieceSearch(event.target.value)} placeholder="Buscar peça ou código"/></label><div className="checkout-product-results">{products.filter((product) => product.stock > 0 && `${product.name} ${product.code}`.toLowerCase().includes(checkoutPieceSearch.toLowerCase())).slice(0, 3).map((product) => { const added = checkoutItems.some((item) => item.id === product.code); return <button className={added ? "added" : ""} key={product.code} disabled={added} onClick={() => setCheckoutItems((current) => [...current, { id: product.code, type: "Peça", name: product.name, price: parseBRL(product.price) }])}><span className="catalog-code">{product.code.slice(-2)}</span><div><strong>{product.name}</strong><small>{product.stock} em estoque · preço fixo</small></div><b>{product.price}</b><i>{added ? "✓" : "+"}</i></button>; })}</div></div>

                <div className="checkout-add-block labor"><div className="checkout-add-title"><Icon name="wrench" size={17}/><div><strong>Adicionar mão de obra</strong><small>Descrição e valor são manuais para esta OS.</small></div></div><div className="checkout-labor-row"><label className="field"><span>Descrição</span><input value={checkoutLaborDescription} onChange={(event) => setCheckoutLaborDescription(event.target.value)} placeholder="Ex.: Regulagem final"/></label><label className="field compact-field"><span>Valor</span><input type="number" min="0" value={checkoutLaborValue} onChange={(event) => setCheckoutLaborValue(event.target.value)}/></label><button className="outline-button large" onClick={() => { if (!checkoutLaborDescription.trim() || Number(checkoutLaborValue) <= 0) return; setCheckoutItems((current) => [...current, { id: `LAB-CHECKOUT-${Date.now()}`, type: "Mão de obra", name: checkoutLaborDescription.trim(), price: Number(checkoutLaborValue) }]); setCheckoutLaborDescription(""); setCheckoutLaborValue(""); }}><Icon name="plus" size={16}/>Adicionar</button></div></div>
                <div className="approval-note"><Icon name="alert" size={17}/><span>Qualquer item adicional deve estar aprovado pelo cliente antes do fechamento. Itens não executados ou não usados não devem ser cobrados.</span></div>
              </section>

              <section className="checkout-payment-panel">
                <div className="payment-total-card checkout-total-card"><span>Total a receber</span><strong>{formatBRL(checkoutTotal)}</strong><small>{checkoutItems.length} itens · {currentOrder ? currentOrder.customer : "Cliente"}</small></div>
                <div className="form-label">Como o cliente vai acertar?</div>
                <div className="payment-methods checkout-methods">{activePaymentMethods.map((methodConfig) => { const method = methodConfig.name; return <button className={paymentMethod === method ? "selected" : ""} key={method} onClick={() => setPaymentMethod(method)}><span>{method === "PIX" ? "PX" : method === "Troca de serviços" ? "TS" : method.slice(0, 2).toUpperCase()}</span><strong>{method}</strong>{paymentMethod === method ? <i>✓</i> : null}</button>; })}</div>
                <label className="toggle-row checkout-split"><input type="checkbox" checked={splitPayment} onChange={(event) => setSplitPayment(event.target.checked)}/><span/><div><strong>Dividir ou receber parcialmente</strong><small>O saldo restante pode virar uma conta a receber.</small></div></label>
                {splitPayment ? <div className="split-payment-grid"><label className="field"><span>Primeira forma</span><select><option>PIX</option><option>Dinheiro</option><option>Débito</option><option>Troca de serviços</option></select></label><label className="field"><span>Valor recebido</span><input defaultValue={formatBRL(checkoutTotal / 2)}/></label><label className="field"><span>Segunda forma</span><select><option>Crédito</option><option>PIX</option><option>Dinheiro</option><option>Deixar saldo pendente</option></select></label><label className="field"><span>Restante</span><input defaultValue={formatBRL(checkoutTotal / 2)}/></label></div> : null}
                {["Débito", "Crédito"].includes(paymentMethod) ? <><div className="form-grid payment-extra"><label className="field"><span>Maquininha utilizada</span><select value={selectedMachine?.id ?? ""} onChange={(event) => setSelectedMachineId(event.target.value)}>{activePaymentMachines.map((machine) => <option value={machine.id} key={machine.id}>{machine.name}{machine.primary ? " · principal" : ""}</option>)}</select></label>{paymentMethod === "Crédito" ? <label className="field"><span>Parcelas</span><select value={paymentInstallments} onChange={(event) => setPaymentInstallments(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((installment) => <option value={installment} key={installment}>{installment}x</option>)}</select></label> : <label className="field"><span>Recebimento</span><input value={selectedMachine?.settlementDays === 0 ? "Na hora" : `D+${selectedMachine?.settlementDays ?? 1}`} readOnly/></label>}</div><div className="machine-fee-summary"><div><span>Valor bruto</span><strong>{formatBRL(paymentGross)}</strong></div><div><span>Taxa da {selectedMachine?.name ?? "máquina"}</span><strong>− {formatBRL(paymentFeeAmount)}</strong><small>{paymentFeeRate.toFixed(2).replace(".", ",")}%</small></div><div><span>Valor líquido</span><strong>{formatBRL(paymentGross - paymentFeeAmount)}</strong></div></div></> : null}
                {paymentMethod === "Dinheiro" ? <div className="form-grid payment-extra"><label className="field"><span>Valor entregue pelo cliente</span><input defaultValue={formatBRL(checkoutTotal)}/></label><div className="change-box"><span>Troco calculado</span><strong>R$ 0,00</strong></div></div> : null}
                {paymentMethod === "Nota a prazo" ? <div className="credit-warning"><Icon name="alert" size={18}/><div><strong>Registrar saldo a receber</strong><small>Defina o vencimento e mantenha a OS tecnicamente encerrada.</small></div></div> : null}
                {paymentMethod === "Troca de serviços" ? <div className="trade-payment-card"><div className="trade-payment-head"><span><Icon name="users" size={18}/></span><div><strong>Compensação por troca de serviços</strong><small>O combinado quita a OS sem entrar como dinheiro recebido.</small></div></div><div className="form-grid"><label className="field field-full"><span>Trabalho ou serviço recebido</span><input value={tradeServiceDescription} onChange={(event) => setTradeServiceDescription(event.target.value)} placeholder="Ex.: Desenvolvimento do sistema da oficina"/></label><label className="field"><span>Valor acordado / crédito disponível</span><input type="number" min="0" value={tradeValue} onChange={(event) => setTradeValue(event.target.value)}/></label><label className="field"><span>Compensado nesta OS</span><input value={formatBRL(tradeCompensated)} readOnly/></label><label className="field field-full"><span>Observações</span><textarea value={tradeNotes} onChange={(event) => setTradeNotes(event.target.value)} placeholder="Descreva o acordo e o que ainda falta entregar, se houver."/></label></div><div className="trade-balance-grid"><div><span>Total da OS</span><strong>{formatBRL(checkoutTotal)}</strong></div><div><span>Entrada em dinheiro</span><strong>R$ 0,00</strong></div><div><span>{tradeRemaining > 0 ? "Saldo ainda devido" : "Crédito restante da troca"}</span><strong>{formatBRL(tradeRemaining > 0 ? tradeRemaining : tradeCreditRemaining)}</strong></div></div><div className="trade-cash-note"><Icon name="check" size={16}/><span>A baixa será identificada como <strong>Troca de serviços</strong> no financeiro e no histórico do cliente.</span></div></div> : null}
                <div className="print-ready-strip"><Icon name="file" size={19}/><div><strong>Impressão automática em 3 vias</strong><small>1 · Mecânico &nbsp; 2 · Caixa &nbsp; 3 · Cliente</small></div><span>80mm</span></div>
              </section>
            </div>
          </div>
        ) : null}

        {dialog === "record" ? (
          <div className="dialog-body record-detail">
            <div className="record-header"><span className="registry-avatar">FR</span><div><strong>Faturamento e resultado</strong><small>Relatório consolidado</small></div><span className="status green"><i/>Atualizado</span></div>
            <div className="record-metrics"><article><span>Faturamento</span><strong>{formatBRL(orders ? orders.reduce((sum, o) => sum + (o.total ?? 0), 0) : 0)}</strong></article><article><span>Custos e gastos</span><strong>{formatBRL(expenses ? expenses.reduce((sum, e) => sum + e.amount, 0) : 0)}</strong></article><article><span>Lucro líquido</span><strong>{formatBRL((orders ? orders.reduce((sum, o) => sum + (o.total ?? 0), 0) : 0) - (expenses ? expenses.reduce((sum, e) => sum + e.amount, 0) : 0))}</strong></article></div><div className="net-profit-note"><Icon name="check" size={17}/><span>O resultado desconta peças, despesas, pagamentos de funcionários e taxas de cartão configuradas.</span></div>
            <div className="history-list"><strong>Últimas atualizações</strong><div><i/><span><b>Hoje</b>Nenhuma movimentação anterior registrada.</span></div></div>
          </div>
        ) : null}

        {dialogError ? <div className="dialog-error-strip" role="alert"><Icon name="alert" size={17}/><span>{dialogError}</span></div> : null}

        {dialog !== "osChoice" ? <footer className="dialog-footer">
          <button className="ghost-button" onClick={close} disabled={saving}>Cancelar</button>
          <div>
            {dialog === "os" && step > 1 ? <button className="outline-button large" onClick={() => setStep(step - 1)} disabled={saving}>Voltar</button> : null}
            <button className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? "Salvando..." : dialog === "os" ? (step < 5 ? "Continuar" : "Abrir Ordem de Serviço") : dialog === "order" && !canOperate ? "Salvar situação" : dialog === "order" && orderStatus === "Entrega" ? "Finalizar OS e receber" : primaryLabels[dialog] ?? "Salvar"}<Icon name="arrow" size={16}/></button>
          </div>
        </footer> : <footer className="dialog-footer choice-footer"><button className="ghost-button" onClick={close}>Cancelar</button></footer>}
      </section>
    </div>
  );
}

// Primeiro acesso (ou logo após o Super Admin redefinir a senha): o servidor
// grava mustChangePassword no perfil e o app não abre até a pessoa escolher uma
// senha própria. Sem esta tela, a senha temporária de 6 dígitos entregue pelo
// administrador virava a senha definitiva do funcionário — a flag era gravada
// no Firestore e nunca lida por ninguém.
function ForcePasswordChange({ session }: { session: ReturnType<typeof useFirebaseSession> }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  const submit = async () => {
    if (!currentPassword || !newPassword) return setLocalError("Preencha a senha atual e a nova senha.");
    if (newPassword !== confirmPassword) return setLocalError("A confirmação não é igual à nova senha.");
    setSubmitting(true);
    setLocalError("");
    try {
      await session.changePassword(currentPassword, newPassword);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível trocar a senha.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitOnEnter = (event: React.KeyboardEvent) => { if (event.key === "Enter") void submit(); };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><div className="auth-brand-mark">PP</div><div><strong>Pica Pau Motos</strong><span>Gestão da oficina</span></div></div>
        <div className="auth-copy"><span>Primeiro acesso</span><h1>Crie a sua senha</h1><p>Você entrou com a senha temporária cadastrada pelo administrador. Escolha agora uma senha só sua para continuar.</p></div>
        <div className="auth-account"><span>Conta</span><strong>{session.user?.email}</strong></div>
        <div className="auth-form">
          <label><span>Senha temporária</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} onKeyDown={submitOnEnter} autoComplete="current-password" placeholder="A senha que o administrador passou" autoFocus/></label>
          <label><span>Nova senha</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onKeyDown={submitOnEnter} autoComplete="new-password" placeholder={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`}/></label>
          <label><span>Repita a nova senha</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={submitOnEnter} autoComplete="new-password" placeholder="Digite a nova senha de novo"/></label>
          {localError || session.error ? <div className="auth-alert error"><Icon name="alert" size={17}/><span>{localError || session.error}</span></div> : null}
          <button className="auth-primary" disabled={submitting} onClick={() => void submit()}><Icon name="check" size={18}/>{submitting ? "Salvando..." : "Salvar e entrar no sistema"}</button>
          <small className="auth-help">Use pelo menos {MIN_PASSWORD_LENGTH} caracteres, misturando letras e números. Não use apenas números.</small>
          <button className="auth-link-button" onClick={() => void session.logout()}>Sair desta conta</button>
        </div>
      </section>
    </main>
  );
}

function AuthGate({ session }: { session: ReturnType<typeof useFirebaseSession> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const submitLogin = async () => {
    if (!email.trim() || !password) {
      setLocalError("Informe seu e-mail e sua senha.");
      return;
    }
    setSubmitting(true);
    setLocalError("");
    setMessage("");
    try {
      await session.login(email, password);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setLocalError("Digite seu e-mail acima para recuperar a senha.");
      return;
    }
    setResetting(true);
    setLocalError("");
    setMessage("");
    try {
      await session.resetPassword(email);
      setMessage("Enviamos um e-mail de recuperação de senha.");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setResetting(false);
    }
  };

  const bootstrap = async () => {
    setBootstrapping(true);
    setLocalError("");
    setMessage("");
    try {
      await session.bootstrapAdmin();
      setMessage("Administrador configurado. Finalizando seu acesso...");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível concluir a configuração inicial.");
    } finally {
      setBootstrapping(false);
    }
  };

  if (session.state === "checking") {
    return <main className="auth-shell"><section className="auth-loading"><div className="auth-brand-mark">PP</div><span className="auth-spinner"/><strong>Carregando Pica Pau Motos</strong><small>Validando sua sessão...</small></section></main>;
  }

  if (session.state === "needs-profile" && session.user) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-card-state">
          <div className="auth-brand"><div className="auth-brand-mark">PP</div><div><strong>Pica Pau Motos</strong><span>Gestão da oficina</span></div></div>
          <div className="auth-state-icon"><Icon name="shield" size={28}/></div>
          <h1>Conta autenticada</h1>
          <p>Seu login existe no Firebase, mas ainda não possui um perfil de acesso no sistema.</p>
          <div className="auth-account"><span>Conta</span><strong>{session.user.email}</strong><small>{session.user.uid}</small></div>
          {localError || session.error ? <div className="auth-alert error"><Icon name="alert" size={17}/><span>{localError || session.error}</span></div> : null}
          {message ? <div className="auth-alert success"><Icon name="check" size={17}/><span>{message}</span></div> : null}
          <button className="auth-primary" disabled={bootstrapping} onClick={() => void bootstrap()}><Icon name="shield" size={18}/>{bootstrapping ? "Configurando..." : "Configurar primeiro administrador"}</button>
          <small className="auth-help">Este botão só funciona para o e-mail definido em <b>INITIAL_SUPER_ADMIN_EMAIL</b> e somente enquanto ainda não existir nenhum administrador.</small>
          <button className="auth-link-button" onClick={() => void session.logout()}>Sair desta conta</button>
        </section>
      </main>
    );
  }

  if ((session.state === "disabled" || session.state === "error") && session.user) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-card-state">
          <div className="auth-brand"><div className="auth-brand-mark">PP</div><div><strong>Pica Pau Motos</strong><span>Gestão da oficina</span></div></div>
          <div className="auth-state-icon danger"><Icon name="alert" size={28}/></div>
          <h1>{session.state === "disabled" ? "Acesso desativado" : "Não foi possível liberar o sistema"}</h1>
          <p>{session.error || "Ocorreu um erro ao validar suas permissões."}</p>
          <div className="auth-account"><span>Conta conectada</span><strong>{session.user.email}</strong></div>
          <button className="auth-secondary" onClick={() => void session.logout()}>Voltar para o login</button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><div className="auth-brand-mark">PP</div><div><strong>Pica Pau Motos</strong><span>Gestão da oficina</span></div></div>
        <div className="auth-copy"><span>Acesso seguro</span><h1>Entrar no sistema</h1><p>Use o e-mail e a senha cadastrados pelo administrador da oficina.</p></div>
        <div className="auth-form">
          <label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="seuemail@exemplo.com" autoFocus/></label>
          <label><span>Senha</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitLogin(); }} autoComplete="current-password" placeholder="Digite sua senha"/></label>
          {localError || session.error ? <div className="auth-alert error"><Icon name="alert" size={17}/><span>{localError || session.error}</span></div> : null}
          {message ? <div className="auth-alert success"><Icon name="check" size={17}/><span>{message}</span></div> : null}
          <button className="auth-primary" disabled={submitting} onClick={() => void submitLogin()}><Icon name="shield" size={18}/>{submitting ? "Entrando..." : "Entrar"}</button>
          <button className="auth-link-button" disabled={resetting} onClick={() => void resetPassword()}>{resetting ? "Enviando..." : "Esqueci minha senha"}</button>
        </div>
        <footer className="auth-footer"><span><i/>Conexão protegida pelo Firebase Authentication</span><small>O cadastro de novos usuários é feito pelo Super Admin dentro do sistema.</small></footer>
      </section>
    </main>
  );
}

function WorkshopApp({ firebaseSession }: { firebaseSession: ReturnType<typeof useFirebaseSession> }) {
  const currentUserName = firebaseSession.profile?.name?.trim() || firebaseSession.user?.displayName?.trim() || "Usuário";
  const currentUserInitials = currentUserName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US";
  const firebaseEnabled = firebaseSession.state === "connected" && Boolean(firebaseSession.profile);
  const firebaseAdmin = firebaseSession.profile?.role === "Super Admin";
  const firebasePermissions = firebaseSession.profile?.permissions ?? defaultFirebasePermissions(firebaseSession.profile?.role ?? "Mecânico", firebaseSession.profile?.employeeId);
  const hasPermission = (permission: FirebasePermission) => firebaseAdmin || firebasePermissions.includes(permission);
  const canViewOrders = hasPermission("orders.view");
  const canCreateOrders = hasPermission("orders.create");
  const canUpdateOrders = hasPermission("orders.update");
  const canUsePdv = hasPermission("pos.use");
  const canUseQuickService = hasPermission("quickService.use");
  const canViewInventory = hasPermission("inventory.view");
  const canManageInventory = hasPermission("inventory.manage");
  const canViewCustomers = hasPermission("customers.view");
  const canManageCustomers = hasPermission("customers.manage");
  const canSeeFinance = hasPermission("finance.view");
  const canManageFinance = hasPermission("finance.manage");
  const canViewTeam = hasPermission("team.view");
  const canManageSettings = firebaseAdmin;
  const [mobileMenu, setMobileMenu] = useState(false);
  // A tela inicial sai da URL de forma síncrona, no primeiro render: decidir
  // isso em um efeito faria o endereço piscar /admin -> / -> /admin.
  const [active, setActive] = useState(() => (canManageSettings && isAdminPath() ? "Administração" : "Visão geral"));
  const [dialog, setDialog] = useState<DialogKind>(null);
  // Qual OS o diálogo de detalhe deve abrir. Vazio = nenhuma selecionada.
  const [selectedOrderId, setSelectedOrderId] = useState("");
  // Carrinho do PDV: mora aqui porque a tela do balcão monta a venda e o
  // diálogo de pagamento a recebe.
  const [cart, setCart] = useState<CartItem[]>([]);
  // Aba de Configurações a abrir. O painel /admin usa isto para levar direto
  // ao grupo escolhido em vez de sempre cair na primeira aba.
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const openSettings = useCallback((tab: SettingsTab) => {
    setSettingsTab(tab);
    setActive("Configurações");
  }, []);
  const [osStep, setOsStep] = useState(1);
  const [toast, setToast] = useState("");
  const [openGroup, setOpenGroup] = useState("Oficina");
  const [globalSearch, setGlobalSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
    const canOperate = firebaseAdmin
    || (["Ordens de serviço", "Orçamentos"].includes(active) && (canUpdateOrders || canCreateOrders))
    || (["PDV Balcão", "Vendas do balcão"].includes(active) && canUsePdv)
    || (active === "Serviço rápido" && canUseQuickService)
    || (["Produtos e estoque", "Compras e entradas", "Fornecedores"].includes(active) && canManageInventory)
    || (["Clientes", "Motocicletas"].includes(active) && canManageCustomers)
    || (["Financeiro", "Contas a receber", "Contas a pagar", "Relatórios"].includes(active) && canManageFinance);
  const canOperateDialog = firebaseAdmin
    || (["osChoice", "os"].includes(dialog ?? "") && canCreateOrders)
    || (dialog === "order" && canUpdateOrders)
    || (["quick", "payment", "cash"].includes(dialog ?? "") && (canUseQuickService || canUsePdv))
    || (["product", "import", "catalog", "supplier", "purchase"].includes(dialog ?? "") && canManageInventory)
    || (["client", "motorcycle"].includes(dialog ?? "") && canManageCustomers)
    || (["finance", "expense", "receivable", "payable", "settleReceivable", "settlePayable", "orderCheckout"].includes(dialog ?? "") && canManageFinance);
  const [orders] = useFirebaseSyncedCollection("serviceOrders", initialOrders, firebaseEnabled && canViewOrders, canCreateOrders || canUpdateOrders, firebaseSession.reportSyncError);
  const [products] = useFirebaseSyncedCollection("products", initialProducts, firebaseEnabled && canViewInventory, canManageInventory, firebaseSession.reportSyncError);
  const [clients] = useFirebaseSyncedCollection("clients", initialClients, firebaseEnabled && canViewCustomers, canManageCustomers, firebaseSession.reportSyncError);
  const [motorcycles] = useFirebaseSyncedCollection("motorcycles", initialMotorcycles, firebaseEnabled && canViewCustomers, canManageCustomers, firebaseSession.reportSyncError);
  const [expenses, setExpenses] = useFirebaseSyncedCollection("expenses", initialExpenses, firebaseEnabled && canSeeFinance, canManageFinance, firebaseSession.reportSyncError);
  const [users, setUsers] = useFirebaseSyncedEmployees(initialUsers, firebaseEnabled && (canViewTeam || canCreateOrders || canUpdateOrders), firebaseAdmin, firebaseSession.reportSyncError);
  const [partners, setPartners] = useFirebaseSyncedCollection("partners", initialPartners, firebaseEnabled && (canViewCustomers || canCreateOrders), firebaseAdmin, firebaseSession.reportSyncError);
  const [quickServices, setQuickServices] = useFirebaseSyncedCollection("quickServices", initialQuickServices, firebaseEnabled && (canUseQuickService || canCreateOrders), firebaseAdmin, firebaseSession.reportSyncError);
  const [categories, setCategories] = useFirebaseSyncedCollection("categories", initialCategories, firebaseEnabled && canViewInventory, firebaseAdmin, firebaseSession.reportSyncError);
  const [suppliers, setSuppliers] = useFirebaseSyncedCollection("suppliers", initialSuppliers, firebaseEnabled && canManageInventory, firebaseAdmin, firebaseSession.reportSyncError);
  const [paymentMachines, setPaymentMachines] = useFirebaseSyncedCollection("paymentMachines", initialPaymentMachines, firebaseEnabled && canSeeFinance, firebaseAdmin, firebaseSession.reportSyncError);
  const [paymentMethods, setPaymentMethods] = useFirebaseSyncedCollection("paymentMethods", initialPaymentMethods, firebaseEnabled && (canSeeFinance || canUsePdv), firebaseAdmin, firebaseSession.reportSyncError);
  const [sales] = useFirebaseSyncedCollection<SaleRecord>("sales", initialSales, firebaseEnabled && (canSeeFinance || canUsePdv || canUseQuickService), false, firebaseSession.reportSyncError);
  const [workshopSettings, setWorkshopSettings] = useState<Partial<SettingsConfig> | null>(null);
  useEffect(() => {
    if (!firebaseEnabled) return setWorkshopSettings(null);
    return observeFirestoreDoc<Partial<SettingsConfig>>("settings", "global", setWorkshopSettings);
  }, [firebaseEnabled]);
  // Listas configuráveis (unidades, marcas, contas, prioridades...). Alimentam
  // os selects que antes traziam a lista fixa no próprio JSX.
  const [systemLists, setSystemLists] = useState<Partial<SystemLists> | null>(null);
  useEffect(() => {
    if (!firebaseEnabled) return setSystemLists(null);
    return observeFirestoreDoc<Partial<SystemLists>>("settings", "lists", setSystemLists);
  }, [firebaseEnabled]);

  const visibleNavGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (firebaseAdmin) return true;
      const required = destinationPermissions[item.label] ?? [];
      return required.some((permission) => firebasePermissions.includes(permission));
    }),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    if (firebaseAdmin || active === "Visão geral") return;
    const required = destinationPermissions[active];
    const allowed = Boolean(required?.some((permission) => firebasePermissions.includes(permission)));
    if (!allowed) {
      const timer = window.setTimeout(() => setActive("Visão geral"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [active, firebaseAdmin, firebaseEnabled, firebasePermissions]);

  // Os cartões de dinheiro da Visão geral eram "R$ 0,00" escritos no código.
  const summary = useMemo(() => financeSummary(sales, orders, expenses), [sales, orders, expenses]);

  // A barra de endereços acompanha a navegação: /admin no painel administrativo,
  // / no resto. Quem abre /admin sem ser Super Admin volta para a raiz, em vez
  // de ficar com a URL prometendo uma tela que não vai abrir.
  useEffect(() => {
    const path = active === "Administração" && canManageSettings ? "/admin" : "/";
    if (currentPath() !== path) window.history.replaceState(null, "", path + window.location.search);
  }, [active, canManageSettings]);

  // A topbar sempre anunciou o atalho no badge "Ctrl K", mas nada o escutava.
  // Esc fecha a busca sem precisar do mouse.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
        return;
      }
      if (event.key === "Escape" && document.activeElement === searchInput.current) {
        setGlobalSearch("");
        searchInput.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openDialog = (next: Exclude<DialogKind, null>, recordId?: string) => {
    setOsStep(1);
    setSelectedOrderId(recordId ?? "");
    setDialog(next);
  };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const finishDialog = (message: string) => {
    setDialog(null);
    notify(message);
  };
  const addExpense = (expense: Omit<ExpenseRecord, "id">) => {
    setExpenses((current) => [{ ...expense, id: `GST-${String(185 + current.length).padStart(4, "0")}` }, ...current]);
  };
  const globalResults = [
    ...(canViewOrders ? orders : []).map((order) => ({ title: order.id, detail: `${order.customer} · ${order.bike} · ${order.plate}`, destination: "Ordens de serviço" })),
    ...(canViewInventory ? products : []).map((product) => ({ title: product.name, detail: `${product.code} · ${product.stock} em estoque`, destination: "Produtos e estoque" })),
    ...(canViewCustomers ? clients : []).map((client) => ({ title: client.name, detail: `${client.phone} · ${client.detail}`, destination: "Clientes" })),
  ].filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 6);
  const goToSearchResult = (destination: string) => {
    setActive(destination);
    setGlobalSearch("");
    setShowNotifications(false);
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">PP</div>
          <div>
            <strong>Pica Pau Motos</strong>
            <span>Gestão da oficina</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          <p className="nav-label">Menu principal</p>
          <button className={`nav-item ${active === "Visão geral" ? "active" : ""}`} onClick={() => { setActive("Visão geral"); setMobileMenu(false); }}>
            <Icon name="home" /><span>Visão geral</span>
          </button>
          {visibleNavGroups.map((group) => {
            const containsActive = group.items.some((item) => item.label === active);
            const expanded = openGroup === group.label || containsActive;
            return (
              <div className={`nav-group ${expanded ? "expanded" : ""}`} key={group.label}>
                <button className={`nav-group-trigger ${containsActive ? "has-active" : ""}`} onClick={() => setOpenGroup(openGroup === group.label ? "" : group.label)} aria-expanded={expanded}>
                  <Icon name={group.icon}/><span>{group.label}</span><em>⌄</em>
                </button>
                {expanded ? <div className="nav-subitems">{group.items.map((item) => (
                  <button className={`nav-subitem ${active === item.label ? "active" : ""}`} key={item.label} onClick={() => { setActive(item.label); setMobileMenu(false); }}>
                    <span>{item.label}</span>
                    {item.badge ? <b className={item.label === "Produtos e estoque" ? "danger-badge" : ""}>{item.badge}</b> : null}
                  </button>
                ))}</div> : null}
              </div>
            );
          })}
          {canManageSettings ? <><div className="nav-divider"/>
            <button className={`nav-item ${active === "Usuários e acessos" ? "active" : ""}`} onClick={() => { setActive("Usuários e acessos"); setMobileMenu(false); }}>
              <Icon name="users"/><span>Usuários e acessos</span>
            </button>
            <button className={`nav-item ${active === "Configurações" ? "active" : ""}`} onClick={() => { setActive("Configurações"); setMobileMenu(false); }}>
              <Icon name="settings"/><span>Configurações</span>
            </button>
            <button className={`nav-item admin-link ${active === "Administração" ? "active" : ""}`} onClick={() => { setActive("Administração"); setMobileMenu(false); }}>
              <Icon name="shield"/><span>Administração</span><b>Admin</b>
            </button>
          </> : null}
        </nav>

        <div className="sidebar-footer">
          <button className="support-card" onClick={() => notify("Central de ajuda aberta. Escolha: OS, estoque, PDV ou financeiro.")}>
            <span className="support-icon">?</span>
            <div><strong>Precisa de ajuda?</strong><small>Fale com o suporte</small></div>
            <Icon name="arrow" size={16} />
          </button>
          <div className="user-card">
            <div className="avatar">{currentUserInitials}</div>
            <div><strong>{currentUserName}</strong><span>{firebaseSession.profile?.role}</span></div>
            <button aria-label="Opções do perfil" onClick={() => setShowProfile(!showProfile)}>•••</button>
          </div>
          {showProfile ? <div className="profile-menu"><div><strong>{currentUserName}</strong><span>{firebaseSession.profile?.role}</span></div>{canManageSettings ? <button onClick={() => { setActive("Configurações"); setShowProfile(false); }}>Configurações da oficina</button> : null}<button onClick={() => { setShowProfile(false); void firebaseSession.logout(); }}>Sair do sistema</button></div> : null}
        </div>
      </aside>

      {mobileMenu ? <button className="menu-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} /> : null}

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenu(true)}><Icon name="menu" /></button>
          <label className="search-box">
            <Icon name="search" size={19} />
            <input ref={searchInput} aria-label="Buscar" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && globalResults[0]) goToSearchResult(globalResults[0].destination); }} placeholder="Buscar OS, cliente, placa ou peça..." />
            <kbd>Ctrl K</kbd>
            {globalSearch ? <div className="global-results">{globalResults.length ? globalResults.map((result) => <button key={`${result.destination}-${result.title}`} onClick={() => goToSearchResult(result.destination)}><span className="registry-avatar">{result.destination.slice(0,2).toUpperCase()}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div><Icon name="arrow" size={16}/></button>) : <div className="no-results">Nenhum resultado encontrado.</div>}</div> : null}
          </label>
          <div className="topbar-actions">
            <span className="system-online-badge"><i/><span>Sistema online</span></span>
            <div className="notification-wrap"><button className="icon-button" aria-label="Notificações" onClick={() => setShowNotifications(!showNotifications)}><Icon name="bell" /><span className="notification-dot" /></button>{showNotifications ? <div className="notification-menu"><div className="notification-head"><strong>Notificações</strong><button onClick={() => notify("Todas as notificações foram marcadas como lidas.")}>Marcar como lidas</button></div>{canViewOrders ? <button onClick={() => goToSearchResult("Ordens de serviço")}><span className="notice-icon red"><Icon name="clock" size={17}/></span><div><strong>{orders.filter((o) => o.status === "Aprovação").length > 0 ? `${orders.filter((o) => o.status === "Aprovação").length} orçamento(s) aguardando` : "Nenhum orçamento pendente"}</strong><small>{orders.filter((o) => o.status === "Aprovação").length > 0 ? "Aguardando aprovação de clientes" : "Tudo em dia na oficina"}</small></div></button> : null}{canViewInventory ? <button onClick={() => goToSearchResult("Produtos e estoque")}><span className="notice-icon amber"><Icon name="alert" size={17}/></span><div><strong>{products.filter((p) => p.stock <= p.minimum).length > 0 ? `${products.filter((p) => p.stock <= p.minimum).length} produto(s) com estoque baixo` : "Estoque em dia"}</strong><small>{products.filter((p) => p.stock <= p.minimum).length > 0 ? "Revisar compras de reposição" : "Nenhum item com estoque crítico"}</small></div></button> : null}{canSeeFinance ? <button onClick={() => goToSearchResult("Financeiro")}><span className="notice-icon green"><Icon name="wallet" size={17}/></span><div><strong>Controle do caixa</strong><small>Conferência e movimentações</small></div></button> : null}{!canViewOrders && !canViewInventory && !canSeeFinance ? <div className="no-results">Nenhuma notificação para os módulos liberados.</div> : null}</div> : null}</div>
            {canCreateOrders ? <button className="primary-button" onClick={() => openDialog("osChoice")}><Icon name="plus" size={18} />Abrir nova OS</button> : null}
          </div>
        </header>

        <div className="content">
          {active === "Visão geral" ? (
          <>
          <div className="page-heading">
            <div>
              <p>{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).replace(/^[a-z]/, (c) => c.toUpperCase())}</p>
              <h1>Bem-vindo, {currentUserName}.</h1>
              <span>Veja o que precisa da sua atenção hoje.</span>
            </div>
            {canCreateOrders ? <button className="primary-button heading-button" onClick={() => openDialog("osChoice")}><Icon name="plus" size={18} />Abrir nova OS</button> : <span className="system-healthy"><i/><b>Acesso personalizado</b></span>}
          </div>

          <section className="dashboard-shortcuts" aria-label="Acessos rápidos">
            {canCreateOrders ? <button className="dashboard-shortcut primary-shortcut" onClick={() => openDialog("osChoice")}><span><Icon name="plus"/></span><div><strong>Nova OS</strong><small>Rápida ou completa</small></div><Icon name="arrow" size={17}/></button> : null}
            {canUsePdv ? <button className="dashboard-shortcut" onClick={() => setActive("PDV Balcão")}><span><Icon name="wallet"/></span><div><strong>Abrir PDV</strong><small>Venda no balcão</small></div><Icon name="arrow" size={17}/></button> : null}
            {canViewInventory ? <button className="dashboard-shortcut" onClick={() => setActive("Produtos e estoque")}><span><Icon name="box"/></span><div><strong>Produtos</strong><small>Estoque e preços</small></div><Icon name="arrow" size={17}/></button> : null}
            {canViewCustomers ? <button className="dashboard-shortcut" onClick={() => setActive("Clientes")}><span><Icon name="users"/></span><div><strong>Clientes</strong><small>Cadastro e histórico</small></div><Icon name="arrow" size={17}/></button> : null}
            {canUseQuickService ? <button className="dashboard-shortcut" onClick={() => openDialog("quick")}><span><Icon name="clock"/></span><div><strong>Serviço rápido</strong><small>Atendimento expresso</small></div><Icon name="arrow" size={17}/></button> : null}
            {canManageFinance ? <button className="dashboard-shortcut" onClick={() => openDialog("expense")}><span><Icon name="file"/></span><div><strong>Adicionar gasto</strong><small>Agora ou a pagar</small></div><Icon name="arrow" size={17}/></button> : null}
          </section>

          <section className={`stats-grid ${!canViewOrders ? "limited" : ""}`} aria-label="Resumo da oficina">
            {canViewOrders ? <>
            <button className="stat-card" onClick={() => setActive("Ordens de serviço")}>
              <div className="stat-icon red"><Icon name="wrench" /></div>
              <div className="stat-info"><span>OS ativas</span><strong>{orders.filter((o) => o.status !== "Entrega" && !o.closed).length}</strong><small>{orders.length} total registrada(s)</small></div>
            </button>
            <button className="stat-card" onClick={() => setActive("Orçamentos")}>
              <div className="stat-icon amber"><Icon name="clock" /></div>
              <div className="stat-info"><span>Aguardando aprovação</span><strong>{orders.filter((o) => o.status === "Aprovação").length}</strong><small>Orçamentos pendentes</small></div>
            </button>
            <button className="stat-card" onClick={() => setActive("Ordens de serviço")}>
              <div className="stat-icon green"><Icon name="check" /></div>
              <div className="stat-info"><span>Prontas para entrega</span><strong>{orders.filter((o) => o.status === "Entrega" && !o.closed).length}</strong><small>Aguardando retirada</small></div>
            </button>
            </> : <div className="stat-card access-stat"><div className="stat-icon red"><Icon name="shield"/></div><div className="stat-info"><span>Seu perfil de acesso</span><strong>{firebaseSession.profile?.role ?? "Usuário"}</strong><small>{firebasePermissions.length} permissões liberadas pelo Super Admin</small></div></div>}
            {canSeeFinance ? <button className="stat-card" onClick={() => setActive("Financeiro")}>
              <div className="stat-icon blue"><Icon name="wallet" /></div>
              <div className="stat-info"><span>Recebido hoje</span><strong className="money">{formatBRL(summary.receivedToday)}</strong><small>{summary.salesTodayCount} {summary.salesTodayCount === 1 ? "movimentação" : "movimentações"} do dia</small></div>
            </button> : null}
          </section>

          {canSeeFinance ? <section className="dashboard-finance-grid" aria-label="Valores financeiros">
            <button className="dashboard-money-card receive" onClick={() => setActive("Contas a receber")}><span className="money-card-icon"><Icon name="arrow"/></span><div><small>A receber</small><strong>{formatBRL(summary.receivableTotal)}</strong><em>{summary.receivableTotal ? "Vendas e OS a prazo" : "Nenhum valor em aberto"}</em></div><Icon name="arrow" size={18}/></button>
            <button className="dashboard-money-card pay" onClick={() => setActive("Contas a pagar")}><span className="money-card-icon"><Icon name="file"/></span><div><small>A pagar</small><strong>{formatBRL(expenses.filter((e) => e.status === "Agendado").reduce((sum, e) => sum + e.amount, 0))}</strong><em>{expenses.filter((e) => e.status === "Agendado").length} conta(s) agendada(s)</em></div><Icon name="arrow" size={18}/></button>
            <button className="dashboard-money-card cash" onClick={() => openDialog("cash")}><span className="money-card-icon"><Icon name="wallet"/></span><div><small>Saldo do caixa</small><strong>{formatBRL(summary.cashBalance)}</strong><em>Recebido menos gastos pagos</em></div><Icon name="arrow" size={18}/></button>
          </section> : null}

          {canViewOrders ? <section className="flow-section">
            <div className="section-title">
              <div><h2>Fluxo da oficina</h2><p>Acompanhe cada etapa do serviço</p></div>
              <button className="text-button" onClick={() => setActive("Ordens de serviço")}>Ver todas as OS <Icon name="arrow" size={16} /></button>
            </div>
            <div className="flow-grid">
              {[
                { label: "Recepção", value: String(orders.filter((o) => o.status === "Recepção").length), helper: "Entrada e triagem", tone: "blue" },
                { label: "Avaliação", value: String(orders.filter((o) => o.status === "Avaliação").length), helper: "Orçamento e diagnóstico", tone: "violet" },
                { label: "Aprovação", value: String(orders.filter((o) => o.status === "Aprovação").length), helper: "Aguardando cliente", tone: "red" },
                { label: "Em serviço", value: String(orders.filter((o) => o.status === "Em serviço").length), helper: "Execução na oficina", tone: "amber" },
                { label: "Prontas", value: String(orders.filter((o) => o.status === "Entrega" && !o.closed).length), helper: "Aguardando retirada", tone: "green" },
              ].map((item) => (
                <button className="flow-card" key={item.label} onClick={() => setActive("Ordens de serviço")}>
                  <span className={`flow-dot ${item.tone}`} />
                  <div><strong>{item.value}</strong><span>{item.label}</span></div>
                  <small>{item.helper}</small>
                  <Icon name="arrow" size={18} />
                </button>
              ))}
            </div>
          </section> : null}

          <div className="main-grid">
            {canViewOrders ? <section className="panel orders-panel">
              <div className="panel-header">
                <div><h2>Ordens recentes</h2><p>Últimas movimentações da oficina</p></div>
                <button className="outline-button" onClick={() => setActive("Ordens de serviço")}>Ver todas</button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>OS / Cliente</th><th>Motocicleta</th><th>Mecânico</th><th>Entrada</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {orders.length ? orders.map((order) => (
                      <tr key={order.id}>
                        <td><strong className="order-id">{order.id}</strong><span>{order.customer}</span></td>
                        <td><strong>{order.bike}</strong><span className="plate">{order.plate}</span></td>
                        <td><span className="mechanic-avatar">{order.mechanic ? order.mechanic.slice(0, 1) : "M"}</span>{order.mechanic || "Não definido"}</td>
                        <td>{order.time}</td>
                        <td><span className={`status ${statusTone(order.status)}`}><i />{order.status}</span></td>
                        <td><button className="row-button" aria-label={`Abrir ${order.id}`} onClick={() => openDialog("order", order.id)}><Icon name="arrow" size={17} /></button></td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>Nenhuma ordem de serviço cadastrada no momento.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section> : <section className="panel access-scope-card"><span><Icon name="shield" size={25}/></span><div><small>Acesso personalizado</small><h2>Você vê somente os módulos liberados</h2><p>O Super Admin pode alterar suas permissões a qualquer momento em Usuários e acessos.</p></div></section>}

            <aside className="side-stack">
              {canViewInventory ? <section className="alert-card">
                <div className="alert-top"><span><Icon name="alert" size={19} /></span><b>Atenção necessária</b></div>
                <strong>{products.filter((p) => p.stock <= p.minimum).length > 0 ? `${products.filter((p) => p.stock <= p.minimum).length} item(ns) com estoque crítico` : "Estoque regularizado"}</strong>
                <p>{products.filter((p) => p.stock <= p.minimum).length > 0 ? `${products.filter((p) => p.stock === 0).length} item(ns) totalmente zerados no momento.` : "Todos os produtos cadastrados estão dentro do nível seguro."}</p>
                <button onClick={() => setActive("Produtos e estoque")}>Ver itens do estoque <Icon name="arrow" size={16} /></button>
              </section> : null}

              {canSeeFinance ? <section className="panel quick-panel">
                <div className="panel-header"><div><h2>Financeiro rápido</h2><p>Sem sair do painel</p></div></div>
                <button onClick={() => openDialog("expense")}><span className="quick-icon red"><Icon name="file" /></span><div><strong>Adicionar gasto</strong><small>Peça, frete ou despesa</small></div><Icon name="arrow" size={17} /></button>
                <button onClick={() => setActive("Contas a receber")}><span className="quick-icon green"><Icon name="arrow" /></span><div><strong>Contas a receber</strong><small>{formatBRL(summary.receivableTotal)} em aberto</small></div><Icon name="arrow" size={17} /></button>
                <button onClick={() => setActive("Contas a pagar")}><span className="quick-icon dark"><Icon name="wallet" /></span><div><strong>Contas a pagar</strong><small>{formatBRL(expenses.filter((e) => e.status === "Agendado").reduce((sum, e) => sum + e.amount, 0))} em aberto</small></div><Icon name="arrow" size={17} /></button>
              </section> : null}
            </aside>
          </div>
          </>
          ) : (
            <ModuleWorkspace active={active} canOperate={canOperate} canCreateOrders={canCreateOrders} firebaseConnected={firebaseEnabled} currentFirebaseUser={firebaseSession.user} openFirebaseAccess={() => notify("Sua sessão está conectada ao Firebase.")} openDialog={openDialog} notify={notify} navigate={setActive} expenses={expenses} users={users} setUsers={setUsers} partners={partners} setPartners={setPartners} quickServices={quickServices} setQuickServices={setQuickServices} categories={categories} setCategories={setCategories} suppliers={suppliers} setSuppliers={setSuppliers} paymentMachines={paymentMachines} setPaymentMachines={setPaymentMachines} paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods} orders={orders} products={products} clients={clients} motorcycles={motorcycles} cart={cart} setCart={setCart} sales={sales} openSettings={openSettings} settingsTab={settingsTab} settings={workshopSettings}/>
          )}
        </div>
      </section>
      <AppDialog dialog={dialog} canOperate={canOperateDialog} step={osStep} setStep={setOsStep} close={() => setDialog(null)} finish={finishDialog} changeDialog={openDialog} onAddExpense={addExpense} users={users} partners={partners} quickServices={quickServices} categories={categories} suppliers={suppliers} paymentMachines={paymentMachines} paymentMethods={paymentMethods} products={products} clients={clients} motorcycles={motorcycles} orders={orders} expenses={expenses} notify={notify} cart={cart} setCart={setCart} sales={sales} lists={systemLists} currentUser={firebaseSession.user} selectedOrderId={selectedOrderId} osPrefix={workshopSettings?.osPrefix ?? "OS"} canManageCustomers={canManageCustomers}/>
      {toast ? <div className="toast" role="status"><span><Icon name="check" size={17}/></span>{toast}</div> : null}
    </main>
  );
}

export default function Home() {
  const firebaseSession = useFirebaseSession();
  if (firebaseSession.state !== "connected" || !firebaseSession.user || !firebaseSession.profile) {
    return <AuthGate session={firebaseSession}/>;
  }
  if (firebaseSession.profile.mustChangePassword) {
    return <ForcePasswordChange session={firebaseSession}/>;
  }
  return <WorkshopApp firebaseSession={firebaseSession}/>;
}

"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultPaymentMachines, defaultPaymentMethods, defaultProductCategories, isMechanicUser, orDefault, serviceOrderStatuses, statusTone, systemList } from "../src/types";
import { NumberField } from "../src/components/NumberField";
import { MoneyField } from "../src/components/MoneyField";
import { formatTyped, valorDigitado } from "../src/number-input";
import { billingDescription, isPartnerBilled, motorcycleLabel, nextBillingDate, partnerTotals, PARTNER_PAYMENT_METHOD } from "../src/partner";
import { fullModelName, modelsOf, versionsOf } from "../src/motorcycle-catalog";
import { formatPlate, motorcycleIdFor, normalizePlate, platePattern } from "../src/plate";
import { avisoDeMotoDeFora, buscarMotos, estaNaFrota } from "../src/fleet";
import { somenteAtivos, type BaseDaOficina } from "../src/removal";
import { ajusteProblema, diferencaDoAjuste, motivosDeAjuste, resumoDoAjuste, valorDoAjuste, type Ajuste, type MotivoDeAjuste } from "../src/stock-adjust";
import { atalhosDePeriodo, nomeDoArquivo, paraCSV, pecasMaisVendidas, periodoDe, periodoEmTexto, porFormaDePagamento, resultadoDoPeriodo, servicosMaisFeitos, type AtalhoDePeriodo } from "../src/report";
import { emMaiusculo } from "../src/text-case";
import { clientHistory, motorcycleHistory } from "../src/history";
import { employeeFromAccount, mechanicsForOrders, mechanicsWithoutEmployee, type AccessAccount } from "../src/team-link";
import { nextSequentialId, withoutUndefined } from "../src/firestore-data";
import { addToList } from "../src/quick-list";
import { helpTopic, searchHelp } from "../src/help-topics";
import { conferirNota, custoUnitario, fatorProblema, lerNfe, quantidadeQueEntra, resumoDaConferencia, type ItemConferido, type NfeNota } from "../src/nfe";
import { HistoryPanel } from "../src/components/HistoryPanel";
import { accountOpen, accountStatus, openAccounts, changeFor, creditTotal, settledTotal, discountPercent, discountProblem, drawerTotal, financeSummary, isCreditPayment, movementProblem as manualMovementProblem, payableEntries, paymentLabel, receivableAccountEntries, splitInstallments, splitProblem, totalAfterDiscount } from "../src/finance";
import { buildMovement, cashDifference, cashSummary, closedSessions, differenceLabel, drawerEntries, movementProblem, nonDrawerTotal, openSession, sessionIsStale } from "../src/cash";
import { mergeParts, priceFromMarkup, shouldReserveStock, stockDeltas, toAmount, type ReservedPart } from "../src/inventory";
import { boardRow, mechanicBoard, mechanicSummary, mechanicsAfterTaking, resumoDoServico } from "../src/mechanic";
import { decodeSheetBytes, newProductPayload, parseStockSheet, planStockImport, updatedProductPayload, type ImportPlan } from "../src/import";
import { buildOrderDocument, buildOrderWhatsappMessage, buildSaleDocument, whatsappUrl } from "../src/documents";
import { openWhatsapp, printDocument } from "./printing";
import { clearReloadMark, ErrorBoundary } from "./ErrorBoundary";
import { downloadFile } from "./download";
import { backupCount, backupFileName, backupIsDue, backupReminder, backupSummary, buildBackup } from "../src/backup";
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
  saveAccounts,
  settleAccount,
  addCashMovement,
  closeCashSession,
  openCashSession,
  readAllCollections,
  recordMovement,
  recordStockAdjustment,
  recordStockEntry,
  saveImportedProducts,
  saveOrderWithStock,
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
  AccountRecord,
  CartItem,
  CashSession,
  CategoryConfig,
  ClientRecord,
  DialogKind,
  ExpenseRecord,
  IconName,
  MotorcycleRecord,
  MovementRecord,
  OpenDialog,
  OrderRecord,
  PartnerConfig,
  PaymentMachineConfig,
  PaymentMethodConfig,
  ProductRecord,
  QuickServiceConfig,
  SaleRecord,
  ServiceOrderStatus,
  StockAdjustmentRecord,
  StockEntryRecord,
  SystemLists,
  ServiceOrderItem,
  SettingsConfig,
  SupplierConfig,
  UserConfig,
} from "../src/types";

type FirebaseConnectionState = "checking" | "signed-out" | "needs-profile" | "connected" | "disabled" | "error";

const formatBRL = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Aceita número além de texto: o custo do produto é gravado como "R$ 12,50",
// mas registros antigos podem ter vindo numéricos, e `.replace` em número
// derruba a tela inteira.
const parseBRL = (value: string | number) => typeof value === "number"
  ? (Number.isFinite(value) ? value : 0)
  : Number(String(value ?? "").replace(/[^\d,]/g, "").replace(",", ".")) || 0;
const onlyDigits = (value: string) => value.replace(/\D/g, "");

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

const initialStockEntries: StockEntryRecord[] = [];
const initialStockAdjustments: StockAdjustmentRecord[] = [];

const initialAccounts: AccountRecord[] = [];
const initialCashSessions: CashSession[] = [];
const initialMovements: MovementRecord[] = [];

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
      { label: "Ajuste de estoque", icon: "check" },
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
  "Ajuste de estoque": ["inventory.view"],
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
    // A linha de exemplo fica marcada com "EXEMPLO" no nome: ela mostra o
    // formato de cada coluna e a importação a ignora, para ninguém acabar com
    // um óleo fantasma no estoque por ter esquecido de apagá-la.
    ["EXEMPLO - Óleo 20W50 (pode apagar esta linha)", "7890000000000", "", "10", "Óleos", "Marca", "UN", "25,00", "39,90", "5", "CG 125 / CG 150", "Prateleira A1", "Fornecedor"],
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
  discount,
  setDiscount,
  products = [],
  clients = [],
  blockZeroStockSale = true,
}: {
  notify: (message: string) => void;
  openDialog: OpenDialog;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  discount: number;
  setDiscount: (value: number) => void;
  products?: ProductRecord[];
  clients?: ClientRecord[];
  blockZeroStockSale?: boolean;
}) {
  const [pdvSearch, setPdvSearch] = useState("");
  // O texto digitado fica separado do número para a pessoa poder apagar tudo e
  // recomeçar sem o campo pular para "0" a cada tecla.
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountText, setDiscountText] = useState("");
  // Antes recalculado em toda renderização (inclusive a cada tecla digitada em
  // qualquer outro campo da tela), mesmo quando `products`/`cart` não mudaram.
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.unit * item.quantity, 0), [cart]);
  const addToCart = useCallback((product: Omit<CartItem, "quantity">) => {
    // "Bloquear venda sem estoque" (Configurações → Estoque & Reposição).
    // Desligado, a oficina consegue vender a peça que está chegando e acertar o
    // estoque depois.
    if (blockZeroStockSale && product.stock <= 0) return notify(`${product.name} está sem estoque.`);
    setCart((current) => {
      const inCart = current.find((item) => item.code === product.code);
      if (blockZeroStockSale && inCart && inCart.quantity >= product.stock) {
        notify(`${product.name} tem apenas ${product.stock} em estoque.`);
        return current;
      }
      return inCart
        ? current.map((item) => item.code === product.code ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setPdvSearch("");
  }, [notify, setCart, blockZeroStockSale]);
  // Peça desativada não é oferecida na venda: quem digita o nome dela não pode
  // continuar somando ao carrinho uma peça que a oficina tirou de linha.
  const pdvCatalog = useMemo(() => somenteAtivos(products).map((p) => ({
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
      .map((item) => item.code === code
        ? { ...item, quantity: Math.max(0, blockZeroStockSale ? Math.min(item.stock, item.quantity + difference) : item.quantity + difference) }
        : item)
      .filter((item) => item.quantity > 0));
  }, [setCart, blockZeroStockSale]);

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
            <div><span>Subtotal</span><b>{formatBRL(total)}</b></div>
            {/* O botão de desconto abria o diálogo de movimentação financeira,
                que nunca teve nada a ver com a venda: o desconto não era
                aplicado em lugar nenhum e o total nunca mudava. Agora o valor
                é digitado aqui e desce até o pagamento e a venda gravada. */}
            <div><span>Desconto</span>{showDiscount || discount > 0
              ? <input className="summary-discount-input" inputMode="decimal" autoFocus value={discountText} onChange={(event) => { setDiscountText(event.target.value); setDiscount(toAmount(event.target.value)); }} placeholder="R$ 0,00"/>
              : <button onClick={() => setShowDiscount(true)}>Adicionar</button>}</div>
            {discount > 0 ? <div><span>{discountProblem(total, discount) ? "Desconto inválido" : `Desconto de ${discountPercent(total, discount).toString().replace(".", ",")}%`}</span><b>− {formatBRL(discount)}</b></div> : null}
          </div>
          {discountProblem(total, discount) ? <div className="dialog-error-strip" role="alert"><Icon name="alert" size={17}/><span>{discountProblem(total, discount)}</span></div> : null}
          <div className="grand-total"><span>Total a receber</span><strong>{formatBRL(totalAfterDiscount(total, discount))}</strong></div>
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
        <div className="table-scroll"><table><thead><tr><th className="col-secondary">Horário</th><th>Serviço</th><th className="col-secondary">Produto</th><th className="col-secondary">Pagamento</th><th>Valor</th><th>Status</th></tr></thead><tbody>
          <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }} className="col-secondary">Nenhum atendimento expresso realizado hoje.</td></tr>
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
  accounts,
  cashSessions,
  movements,
}: {
  openDialog: OpenDialog;
  navigate: (destination: string) => void;
  expenses: ExpenseRecord[];
  users: UserConfig[];
  sales: SaleRecord[];
  orders: OrderRecord[];
  accounts: AccountRecord[];
  cashSessions: CashSession[];
  movements: MovementRecord[];
}) {
  // grossRevenue, partsCost e cardRevenue eram constantes 0 escritas no código,
  // então o lucro líquido era sempre o negativo dos gastos.
  const summary = useMemo(() => financeSummary(sales, orders, expenses, accounts, movements), [sales, orders, expenses, accounts, movements]);
  const { grossTotal: grossRevenue, cardFees, paidExpenses, pendingExpenses, netProfit } = summary;
  // O botão precisa dizer a verdade: com o caixa aberto, o que se faz é
  // movimentar e fechar, não "abrir" de novo.
  const openCash = openSession(cashSessions);
  const drawerExpected = cashSummary(openCash, { sales, orders, expenses, accounts }).expected;
  const payrollPaid = expenses.filter((expense) => expense.status === "Pago" && expense.category === "Pagamento de funcionário").reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <>
      <div className="module-heading">
        <div><p>Controle financeiro</p><h1>Financeiro</h1><span>Caixa, recebimentos, pagamentos e gastos da oficina em um só lugar.</span></div>
        <div className="heading-actions"><button className="outline-button large" onClick={() => openDialog("cash")}>{openCash ? "Movimentar caixa" : "Abrir caixa"}</button><button className="primary-button" onClick={() => openDialog("expense")}><Icon name="plus" size={18}/>Adicionar gasto</button></div>
      </div>
      <div className="finance-kpi-grid">
        <button className="finance-kpi receive" onClick={() => navigate("Contas a receber")}><span className="finance-kpi-icon"><Icon name="arrow"/></span><div><small>Total a receber</small><strong>{formatBRL(summary.receivableTotal)}</strong><em>{summary.receivableTotal ? "Vendas e OS a prazo" : "Nenhum valor em aberto"}</em></div><Icon name="arrow" size={18}/></button>
        <button className="finance-kpi pay" onClick={() => navigate("Contas a pagar")}><span className="finance-kpi-icon"><Icon name="file"/></span><div><small>Total a pagar</small><strong>{formatBRL(pendingExpenses)}</strong><em>{expenses.filter((e) => e.status === "Agendado").length} contas agendadas</em></div><Icon name="arrow" size={18}/></button>
        <button className="finance-kpi balance" onClick={() => openDialog("cash")}><span className="finance-kpi-icon"><Icon name="wallet"/></span><div><small>{openCash ? `Dinheiro na gaveta · ${openCash.id}` : "Saldo disponível hoje"}</small><strong>{formatBRL(openCash ? drawerExpected : summary.cashBalance)}</strong><em>{openCash ? `Caixa aberto ${openCash.openedDate}` : "Caixa fechado · abra para começar o dia"}</em></div><Icon name="arrow" size={18}/></button>
      </div>
      <section className="finance-result-strip panel"><div className="result-strip-head"><div><small>Resultado real da oficina</small><h2>Lucro líquido estimado</h2></div><strong>{formatBRL(netProfit)}</strong></div><div className="result-breakdown"><span><small>Faturamento</small><b>{formatBRL(grossRevenue)}</b></span><span><small>Custo das peças</small><b>− {formatBRL(summary.partsCost)}</b></span><span><small>Gastos pagos</small><b>− {formatBRL(paidExpenses)}</b></span><span><small>Taxas de maquininha</small><b>− {formatBRL(cardFees)}</b></span></div><p>Considera vendas, custo das peças, gastos lançados, pagamentos de funcionários ({formatBRL(payrollPaid)}) e as taxas de maquininha já descontadas das vendas no cartão.</p></section>
      <div className="finance-body-grid">
        <section className="panel finance-movements">
          <div className="panel-header"><div><h2>Últimos gastos</h2><p>Lançamentos manuais e despesas agendadas</p></div><button className="outline-button" onClick={() => openDialog("expense")}>Novo gasto</button></div>
          <div className="table-scroll"><table><thead><tr><th>Gasto</th><th className="col-secondary">Categoria</th><th className="col-secondary">Pagamento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{expenses.length ? expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><span>{expense.id}{expense.order ? ` · ${expense.order}` : ""}</span></td><td className="col-secondary">{expense.category}</td><td className="col-secondary">{expense.method}<span>{expense.dueDate}</span></td><td><strong className="mono">{formatBRL(expense.amount)}</strong>{expense.charged ? <span className="margin-caption">Cobrado {formatBRL(expense.charged)}</span> : null}</td><td><span className={`status ${expense.status === "Pago" ? "green" : "amber"}`}><i/>{expense.status}</span></td></tr>) : <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>Nenhum gasto registrado no momento.</td></tr>}</tbody></table></div>
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
  accounts,
}: {
  kind: "receber" | "pagar";
  openDialog: OpenDialog;
  expenses: ExpenseRecord[];
  accounts: AccountRecord[];
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("Todos");
  const isReceivable = kind === "receber";
  // A receber saía sempre vazio e nunca quitava; a pagar marcava tudo como
  // "A vencer", então uma conta vencida nunca aparecia como atrasada.
  const records = useMemo(
    () => (isReceivable ? receivableAccountEntries(accounts) : payableEntries(expenses, accounts)),
    [isReceivable, expenses, accounts],
  );
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
        <div className="table-scroll"><table><thead><tr><th>{isReceivable ? "Cliente / Pagador" : "Fornecedor / Favorecido"}</th><th className="col-secondary">Descrição</th><th>Vencimento</th><th className="col-secondary">Valor original</th><th>Saldo</th><th>Status</th><th>Ação</th></tr></thead><tbody>{filteredRecords.length ? filteredRecords.map((record) => <tr key={record.id}><td><strong>{record.person}</strong><span className="mono">{record.id}</span></td><td className="col-secondary"><strong>{record.description}</strong><span>{isReceivable ? "Receita operacional" : "Despesa da oficina"}</span></td><td>{record.dueDate}</td><td className="col-secondary mono">{formatBRL(record.original)}</td><td><strong className="mono">{formatBRL(record.open)}</strong></td><td><span className={`status ${record.status === "Atrasado" ? "red" : record.status === "Vence hoje" ? "amber" : record.status === "Parcial" ? "violet" : record.status === "Quitado" ? "green" : "blue"}`}><i/>{record.status}</span></td><td><button className="account-action" onClick={() => openDialog(isReceivable ? "settleReceivable" : "settlePayable", record.id)}>{isReceivable ? "Receber" : "Pagar"}</button></td></tr>) : <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>Nenhuma conta {isReceivable ? "a receber" : "a pagar"} cadastrada no momento.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}

/**
 * Relatórios do período.
 *
 * A aba era uma casca: a lista nascia vazia e o botão "Exportar relatório" só
 * disparava um aviso dizendo "Relatório exportado em formato PDF", sem gerar
 * arquivo nenhum. Mentir que gerou é pior que não ter o botão.
 *
 * O resto do financeiro só sabia responder "hoje" e "acumulado", e nenhuma
 * pergunta que o dono faz de verdade cabe nesses dois. Aqui tudo é por período,
 * e a conta é de src/report.ts.
 */
function ReportWorkspace({ sales, orders, expenses, movements, accounts, notify }: {
  sales: SaleRecord[]; orders: OrderRecord[]; expenses: ExpenseRecord[];
  movements: MovementRecord[]; accounts: AccountRecord[]; notify: (mensagem: string) => void;
}) {
  const [atalho, setAtalho] = useState<AtalhoDePeriodo | "Personalizado">("Este mês");
  const [de, setDe] = useState(() => periodoDe("Este mês").de);
  const [ate, setAte] = useState(() => periodoDe("Este mês").ate);
  const periodo = useMemo(() => ({ de, ate }), [de, ate]);

  const escolherAtalho = (novo: AtalhoDePeriodo) => {
    const calculado = periodoDe(novo);
    setAtalho(novo); setDe(calculado.de); setAte(calculado.ate);
  };

  const resultado = useMemo(() => resultadoDoPeriodo(periodo, { sales, orders, expenses, movements }),
    [periodo, sales, orders, expenses, movements]);
  const formas = useMemo(() => porFormaDePagamento(periodo, sales, orders), [periodo, sales, orders]);
  const pecas = useMemo(() => pecasMaisVendidas(periodo, sales, orders), [periodo, sales, orders]);
  const servicos = useMemo(() => servicosMaisFeitos(periodo, sales, orders), [periodo, sales, orders]);
  const aReceber = useMemo(() => openAccounts(accounts, "receber").reduce((s, c) => s + accountOpen(c), 0), [accounts]);
  const aPagar = useMemo(() => openAccounts(accounts, "pagar").reduce((s, c) => s + accountOpen(c), 0), [accounts]);

  /**
   * O botão entrega um arquivo de verdade.
   *
   * CSV e não PDF: é o formato que abre no Excel e no Google Sheets, que o
   * contador aceita, e que dá para somar por cima. PDF seria bonito e inútil
   * para o que a oficina faz com isso.
   */
  const exportar = () => {
    const linhas: Array<Array<string | number>> = [
      ["Resultado", "", ""],
      ["Faturamento", resultado.faturamento, ""],
      ["Custo das peças", -resultado.custoDasPecas, ""],
      ["Taxas de maquininha", -resultado.taxas, ""],
      ["Despesas pagas", -resultado.despesas, ""],
      ["Entradas avulsas", resultado.entradasAvulsas, ""],
      ["Saídas avulsas", -resultado.saidasAvulsas, ""],
      ["Lucro do período", resultado.lucro, `${resultado.margem}%`],
      ["Atendimentos", resultado.atendimentos, ""],
      ["Ticket médio", resultado.ticketMedio, ""],
      ["Desconto concedido", resultado.descontos, ""],
      ["", "", ""],
      ["Forma de pagamento", "Atendimentos", "Total", "Taxa", "Líquido"],
      ...formas.map((linha) => [linha.forma, linha.atendimentos, linha.total, linha.taxa, linha.liquido]),
      ["", "", ""],
      ["Peça", "Quantidade", "Faturamento", "Custo", "Lucro"],
      ...pecas.map((linha) => [linha.nome, linha.quantidade, linha.total, linha.custo, linha.lucro]),
      ["", "", ""],
      ["Serviço", "Quantidade", "Faturamento", "", ""],
      ...servicos.map((linha) => [linha.nome, linha.quantidade, linha.total, "", ""]),
    ];
    const csv = paraCSV([`Relatório da oficina — ${periodoEmTexto(periodo)}`, "", "", "", ""], linhas);
    // BOM na frente: sem ele o Excel em português abre "ÓLEO" como "Ã“LEO".
    const arquivo = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url; link.download = nomeDoArquivo("relatorio", periodo);
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
    notify(`Relatório de ${periodoEmTexto(periodo)} baixado.`);
  };

  const linha = (rotulo: string, valor: number, tom?: "menos" | "total") => (
    <div className={`dre-linha ${tom ?? ""}`}><span>{rotulo}</span><strong>{tom === "menos" ? `− ${formatBRL(valor)}` : formatBRL(valor)}</strong></div>
  );

  return (
    <>
      <div className="module-heading">
        <div><p>Indicadores</p><h1>Relatórios</h1><span>O resultado da oficina no período que você escolher.</span></div>
        <button className="primary-button" onClick={exportar}><Icon name="file" size={18}/>Baixar planilha</button>
      </div>

      <div className="report-period panel">
        <div className="filter-pills">
          {atalhosDePeriodo.map((nome) => (
            <button className={atalho === nome ? "selected" : ""} key={nome} onClick={() => escolherAtalho(nome)}>{nome}</button>
          ))}
        </div>
        <label className="field"><span>De</span><input type="date" value={de} onChange={(e) => { setDe(e.target.value); setAtalho("Personalizado"); }}/></label>
        <label className="field"><span>Até</span><input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setAtalho("Personalizado"); }}/></label>
        <span className="report-period-label">{periodoEmTexto(periodo)}</span>
      </div>

      <div className="report-grid">
        {/* O resultado na ordem em que se lê um DRE: o que entrou, o que saiu,
            e o que sobrou. O custo das peças entra porque sem ele o "lucro" é
            fantasia — vender R$ 1.000 de peça que custou R$ 700 não são
            R$ 1.000 de resultado. */}
        <section className="panel report-dre">
          <div className="panel-header"><div><h2>Resultado do período</h2><p>{periodoEmTexto(periodo)}</p></div></div>
          <div className="dre">
            {linha("Faturamento", resultado.faturamento)}
            {linha("Custo das peças vendidas", resultado.custoDasPecas, "menos")}
            {linha("Taxas de maquininha", resultado.taxas, "menos")}
            {linha("Despesas pagas", resultado.despesas, "menos")}
            {resultado.entradasAvulsas ? linha("Entradas avulsas", resultado.entradasAvulsas) : null}
            {resultado.saidasAvulsas ? linha("Saídas avulsas", resultado.saidasAvulsas, "menos") : null}
            {linha("Lucro do período", resultado.lucro, "total")}
          </div>
          <div className="report-mini">
            <article><span>Margem</span><strong>{resultado.margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></article>
            <article><span>Atendimentos</span><strong>{resultado.atendimentos}</strong></article>
            <article><span>Ticket médio</span><strong>{formatBRL(resultado.ticketMedio)}</strong></article>
            <article><span>Desconto dado</span><strong>{formatBRL(resultado.descontos)}</strong></article>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>Como entrou o dinheiro</h2><p>A taxa da maquininha ao lado do total, não diluída no mês</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Forma</th><th className="num">Atend.</th><th className="num">Total</th><th className="num">Taxa</th><th className="num">Líquido</th></tr></thead>
            <tbody>{formas.length ? formas.map((l) => (
              <tr key={l.forma}><td><strong>{l.forma}</strong></td><td className="num">{l.atendimentos}</td><td className="num mono">{formatBRL(l.total)}</td>
                <td className="num mono">{l.taxa ? `− ${formatBRL(l.taxa)}` : "—"}</td><td className="num mono"><strong>{formatBRL(l.liquido)}</strong></td></tr>
            )) : <tr><td colSpan={5} className="report-vazio">Nenhuma entrada neste período.</td></tr>}</tbody></table></div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>Peças que mais saíram</h2><p>Ordenado pelo que faturou, com o lucro de cada uma</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Peça</th><th className="num">Qtd.</th><th className="num">Faturou</th><th className="num">Lucro</th></tr></thead>
            <tbody>{pecas.length ? pecas.map((l) => (
              <tr key={l.nome}><td><strong>{l.nome}</strong></td><td className="num">{l.quantidade}</td><td className="num mono">{formatBRL(l.total)}</td>
                <td className="num mono"><strong className={l.lucro >= 0 ? "lucro-bom" : "lucro-ruim"}>{formatBRL(l.lucro)}</strong></td></tr>
            )) : <tr><td colSpan={4} className="report-vazio">Nenhuma peça vendida neste período.</td></tr>}</tbody></table></div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>Serviços mais feitos</h2><p>A mão de obra que sustenta a oficina</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Serviço</th><th className="num">Qtd.</th><th className="num">Faturou</th></tr></thead>
            <tbody>{servicos.length ? servicos.map((l) => (
              <tr key={l.nome}><td><strong>{l.nome}</strong></td><td className="num">{l.quantidade}</td><td className="num mono">{formatBRL(l.total)}</td></tr>
            )) : <tr><td colSpan={3} className="report-vazio">Nenhum serviço neste período.</td></tr>}</tbody></table></div>
        </section>

        {/* Em aberto não é do período: é o que está de pé hoje, e é a conta que
            decide se dá para comprar peça esta semana. */}
        <section className="panel report-aberto">
          <div className="panel-header"><div><h2>Em aberto hoje</h2><p>Independe do período escolhido</p></div></div>
          <div className="report-mini">
            <article><span>A receber</span><strong className="lucro-bom">{formatBRL(aReceber)}</strong></article>
            <article><span>A pagar</span><strong className="lucro-ruim">{formatBRL(aPagar)}</strong></article>
            <article><span>Diferença</span><strong>{formatBRL(aReceber - aPagar)}</strong></article>
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Ajuste de estoque.
 *
 * O estoque só se mexia por compra, venda, OS, planilha ou XML. Quem precisava
 * corrigir uma contagem — peça quebrada na bancada, óleo usado na moto da
 * própria oficina, item lançado em dobro, ou o saldo do dia em que se começou a
 * usar o sistema — inventava uma compra que não existiu. Aí o custo médio da
 * peça mudava, aparecia um fornecedor que ninguém reconhece, e o relatório de
 * compras do mês passava a mentir.
 *
 * A conta e as travas são de src/stock-adjust.ts. Aqui é só a tela.
 */
function StockAdjustWorkspace({ products, adjustments, currentUser, notify, canManage }: {
  products: ProductRecord[]; adjustments: StockAdjustmentRecord[];
  currentUser: FirebaseUserSummary | null; notify: (mensagem: string) => void; canManage: boolean;
}) {
  const [linhas, setLinhas] = useState<Ajuste[]>([]);
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState<MotivoDeAjuste | "">("");
  const [observacao, setObservacao] = useState("");
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");

  const ativos = useMemo(() => somenteAtivos(products), [products]);
  const achados = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    if (!texto) return [];
    return ativos.filter((peca) => `${peca.name} ${peca.code} ${peca.barcode ?? ""}`.toLowerCase().includes(texto))
      .filter((peca) => !linhas.some((linha) => linha.productId === peca.id)).slice(0, 8);
  }, [ativos, busca, linhas]);

  // O motivo e a observação valem para o lote inteiro: uma contagem de
  // prateleira é uma contagem só, ainda que corrija doze peças.
  const comMotivo = useMemo(() => linhas.map((linha) => ({ ...linha, motivo, observacao })), [linhas, motivo, observacao]);
  const resumo = useMemo(() => resumoDoAjuste(comMotivo), [comMotivo]);
  const primeiroProblema = comMotivo.map((linha) => ajusteProblema(linha)).find(Boolean) ?? "";

  const acrescentar = (peca: ProductRecord) => {
    setLinhas((atual) => [...atual, {
      productId: peca.id, nome: peca.name, saldoAtual: peca.stock ?? 0, contado: peca.stock ?? 0,
      motivo: "", custoUnitario: parseBRL(peca.cost),
    }]);
    setBusca("");
  };
  const mexer = (id: string, contado: number) =>
    setLinhas((atual) => atual.map((linha) => linha.productId === id ? { ...linha, contado } : linha));
  const tirar = (id: string) => setLinhas((atual) => atual.filter((linha) => linha.productId !== id));

  const confirmar = async () => {
    if (!canManage) return setErro("Seu perfil pode consultar o estoque, mas não ajustar.");
    if (!linhas.length) return setErro("Acrescente pelo menos uma peça.");
    if (primeiroProblema) return setErro(primeiroProblema);
    setGravando(true); setErro("");
    try {
      const id = `AJU-${String(highestSequence(adjustments, "AJU") + 1).padStart(4, "0")}`;
      await recordStockAdjustment(id, {
        id,
        date: new Date().toLocaleDateString("pt-BR"),
        adjustedAt: new Date().toISOString(),
        motivo, observacao: observacao.trim(), valor: resumo.valor,
        items: comMotivo.map((linha) => ({
          productId: linha.productId, name: linha.nome, saldoAtual: linha.saldoAtual,
          contado: linha.contado, diferenca: diferencaDoAjuste(linha), custoUnitario: linha.custoUnitario ?? 0,
        })),
        operatorUid: currentUser?.uid ?? "", operatorName: currentUser?.displayName ?? "",
      }, comMotivo.map((linha) => ({ productId: linha.productId, contado: linha.contado })));
      setLinhas([]); setMotivo(""); setObservacao("");
      notify(`Ajuste ${id} gravado: ${resumo.itens} peça(s), ${resumo.entram > 0 ? `+${resumo.entram}` : "0"} entrando e ${resumo.saem} saindo.`);
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível gravar o ajuste.");
    } finally {
      setGravando(false);
    }
  };

  return (
    <>
      <div className="module-heading">
        <div><p>Estoque</p><h1>Ajuste de estoque</h1><span>Corrija o saldo contado na prateleira, sem inventar uma compra.</span></div>
        <span className="system-healthy"><i/><b>{adjustments.length} ajuste(s) no histórico</b></span>
      </div>

      <section className="panel module-panel adjust-panel">
        <div className="panel-header"><div><h2>Nova conferência</h2><p>Procure a peça, digite o que existe de verdade e diga o motivo</p></div></div>

        <div className="adjust-form">
          <label className="field field-full"><span>Peça</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou código de barras"/>
          </label>
          {achados.length ? (
            <div className="adjust-results">
              {achados.map((peca) => (
                <button key={peca.id} onClick={() => acrescentar(peca)}>
                  <span className="catalog-code">{peca.code.slice(-2)}</span>
                  <div><strong>{peca.name}</strong><small>{peca.code} · {peca.stock} em estoque</small></div>
                  <i>+</i>
                </button>
              ))}
            </div>
          ) : busca.trim() ? <div className="os-search-hint"><Icon name="box" size={17}/><span>Nenhuma peça com "{busca.trim()}".</span></div> : null}

          {linhas.length ? (
            <div className="table-scroll adjust-table">
              <table><thead><tr><th>Peça</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferença</th><th className="num">Em dinheiro</th><th></th></tr></thead>
                <tbody>{comMotivo.map((linha) => {
                  const diferenca = diferencaDoAjuste(linha);
                  return (
                    <tr key={linha.productId}>
                      <td><strong>{linha.nome}</strong></td>
                      <td className="num mono">{linha.saldoAtual}</td>
                      <td className="num"><NumberField min={0} fallback={linha.saldoAtual} value={linha.contado} onChange={(valor) => mexer(linha.productId, valor)} className="adjust-input"/></td>
                      <td className="num mono"><strong className={diferenca > 0 ? "lucro-bom" : diferenca < 0 ? "lucro-ruim" : ""}>{diferenca > 0 ? `+${diferenca}` : diferenca}</strong></td>
                      <td className="num mono">{formatBRL(valorDoAjuste(linha))}</td>
                      <td><button className="remove-item" onClick={() => tirar(linha.productId)} aria-label="Tirar da lista">×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <div className="pdv-empty"><span><Icon name="box" size={20}/></span><strong>Nenhuma peça na conferência</strong><p>Procure a peça acima para começar.</p></div>}

          {/* O motivo é obrigatório de propósito: ajuste sem motivo é
              indistinguível de erro, e um estoque cheio de correções anônimas é
              um estoque em que ninguém confia. */}
          <label className="field"><span>Motivo <b className="req">*</b></span>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDeAjuste)}>
              <option value="">Escolha o motivo</option>
              {motivosDeAjuste.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
            </select>
          </label>
          <label className="field"><span>Observação{motivo === "Correção de lançamento" ? <b className="req"> *</b> : null}</span>
            <input value={observacao} onChange={(e) => setObservacao(emMaiusculo(e.target.value))} placeholder="Ex.: ENTRADA ENT-0003 LANÇADA EM DOBRO"/>
          </label>
        </div>

        {erro ? <div className="dialog-error-strip" role="alert"><b>!</b><span>{erro}</span></div> : null}

        <div className="adjust-footer">
          <div className="adjust-resumo">
            <span>Peças<b>{resumo.itens}</b></span>
            <span>Entrando<b className="lucro-bom">+{resumo.entram}</b></span>
            <span>Saindo<b className="lucro-ruim">−{resumo.saem}</b></span>
            <span>Impacto<b>{formatBRL(resumo.valor)}</b></span>
          </div>
          <button className="primary-button" disabled={gravando || !linhas.length} onClick={() => void confirmar()}>
            {gravando ? "Gravando..." : "Confirmar ajuste"}
          </button>
        </div>
      </section>

      <section className="panel module-panel">
        <div className="summary-title"><span>Ajustes anteriores</span><b>{adjustments.length} NO HISTÓRICO</b></div>
        <div className="table-scroll">
          <table><thead><tr><th>Ajuste</th><th>Data</th><th>Motivo</th><th className="num">Peças</th><th className="num">Em dinheiro</th><th>Quem fez</th></tr></thead>
            <tbody>{adjustments.length ? [...adjustments].sort((a, b) => String(b.adjustedAt).localeCompare(String(a.adjustedAt))).map((ajuste) => (
              <tr key={ajuste.id}>
                <td><strong className="order-id">{ajuste.id}</strong>{ajuste.observacao ? <span>{ajuste.observacao}</span> : null}</td>
                <td>{ajuste.date}</td>
                <td>{ajuste.motivo}</td>
                <td className="num mono">{(ajuste.items ?? []).length}</td>
                <td className="num mono"><strong className={ajuste.valor >= 0 ? "lucro-bom" : "lucro-ruim"}>{formatBRL(ajuste.valor)}</strong></td>
                <td>{ajuste.operatorName || "—"}</td>
              </tr>
            )) : <tr><td colSpan={6} className="report-vazio">Nenhum ajuste registrado ainda.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TeamWorkspace({ users, setUsers, openDialog, notify, orders, sales, expenses, canManageTeam }: { users: UserConfig[]; setUsers: React.Dispatch<React.SetStateAction<UserConfig[]>>; openDialog: OpenDialog; notify: (message: string) => void; orders: OrderRecord[]; sales: SaleRecord[]; expenses: ExpenseRecord[]; canManageTeam: boolean }) {
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

      <ErrorBoundary area="este formulário"><Suspense fallback={null}>
        <EmployeeFormModal
          isOpen={isEmployeeModalOpen}
          onClose={() => { setIsEmployeeModalOpen(false); setSelectedEmployeeForEdit(null); }}
          onSaved={handleEmployeeSaved}
          editingEmployee={selectedEmployeeForEdit}
          notify={notify}
          allEmployees={users}
          removal={{
            // As contas de acesso saem do próprio cadastro: funcionário com
            // login gravado tem `userId`. Apagar quem ainda entra no sistema
            // deixaria uma conta sem cadastro nenhum na oficina.
            base: { orders, sales, expenses, access: users.filter((item) => item.userId).map((item) => ({ employeeId: item.id })) },
            podeExcluir: canManageTeam,
            notify,
            onRemoved: () => { setIsEmployeeModalOpen(false); setSelectedEmployeeForEdit(null); },
          }}
        />
      </Suspense></ErrorBoundary>
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
      { key: "team.manage", label: "Cadastrar e editar funcionários", help: "Inclui mecânicos, cargos e comissões." },
    ],
  },
  {
    title: "Configurações da oficina",
    detail: "Categorias, formas de pagamento, serviços rápidos, parceiras e impressão.",
    permissions: [
      { key: "settings.view", label: "Abrir as Configurações", help: "Consulta categorias, formas de pagamento e serviços rápidos." },
      { key: "settings.manage", label: "Alterar as Configurações", help: "Cria e edita categorias, marcas, parceiras e formas de pagamento." },
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
  setEmployees,
  notify,
  openFirebaseAccess,
}: {
  currentUser: FirebaseUserSummary | null;
  firebaseConnected: boolean;
  employees: UserConfig[];
  setEmployees: React.Dispatch<React.SetStateAction<UserConfig[]>>;
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
      permissions: user.permissions.length ? user.permissions : defaultFirebasePermissions(user.role),
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
      if (!removing && permission === "team.manage") next = Array.from(new Set([...next, "team.view"]));
      if (!removing && permission === "settings.manage") next = Array.from(new Set([...next, "settings.view"]));
      if (removing && permission === "orders.view") next = next.filter((item) => item !== "orders.create" && item !== "orders.update");
      if (removing && permission === "inventory.view") next = next.filter((item) => item !== "inventory.manage" && item !== "orders.create");
      if (removing && permission === "customers.view") next = next.filter((item) => item !== "customers.manage" && item !== "orders.create");
      if (removing && permission === "finance.view") next = next.filter((item) => item !== "finance.manage");
      if (removing && permission === "team.view") next = next.filter((item) => item !== "team.manage");
      if (removing && permission === "settings.view") next = next.filter((item) => item !== "settings.manage");
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
        // Mecânico novo já nasce com cadastro de funcionário: sem isso ele
        // entra no sistema e não existe para a oficina — não aparece no
        // seletor da OS, não recebe serviço e não entra em comissão.
        const contaNova: AccessAccount = { uid: result.user?.uid ?? "", name: form.name, phone: formatPhone(form.phone), role: form.role, employeeId: form.employeeId, active: form.active, permissions: form.permissions };
        if (!form.employeeId && mechanicsWithoutEmployee([contaNova], employees).length) {
          await criarFuncionarioDaConta(contaNova, employees);
        }
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

  /*
    Mecânico que existe como LOGIN mas não como FUNCIONÁRIO.

    São duas coleções: `users` guarda a conta e a permissão, `employees` guarda
    quem trabalha na oficina. A OS lê `employees`. Cadastrar alguém como
    Mecânico só aqui criava uma pessoa que entra no sistema e não existe para a
    oficina: não aparecia no seletor de mecânicos da OS, não recebia serviço e
    não entrava em comissão — e nada avisava, o seletor simplesmente não tinha
    aquele nome.

    Agora a tela aponta quem está assim e resolve com um clique.
  */
  const contasDeAcesso: AccessAccount[] = managedUsers
    .filter((user) => user.hasAccessProfile)
    .map((user) => ({ uid: user.uid, name: user.name, email: user.email, phone: user.phone, role: user.role, employeeId: user.employeeId, active: user.active, permissions: user.permissions }));
  const semCadastro = mechanicsWithoutEmployee(contasDeAcesso, employees);

  const criarFuncionarioDaConta = async (conta: AccessAccount, jaCadastrados: UserConfig[]) => {
    const id = nextSequentialId(jaCadastrados, "USR");
    const funcionario = employeeFromAccount(conta, id);
    await saveFirestoreDoc("employees", id, withoutUndefined(funcionario as unknown as Record<string, unknown>));
    setEmployees((atual) => [...atual, funcionario]);
    // O vínculo volta para a conta: sem ele, o próximo carregamento casaria
    // pelo nome outra vez e criaria um segundo cadastro da mesma pessoa.
    //
    // Gravado direto no perfil, e não pela rota administrativa: o vínculo
    // precisa valer mesmo quando o backend administrativo está fora do ar —
    // que é justamente quando esta tela mais é usada para arrumar as coisas.
    if (conta.uid) await saveFirestoreDoc("userAccess", conta.uid, { employeeId: id });
    return funcionario;
  };

  const criarCadastrosPendentes = async () => {
    setBusy(true);
    setError("");
    try {
      // Um de cada vez, e somando à lista local: dois cadastros criados no
      // mesmo instante pegariam o mesmo número sequencial e um sobrescreveria
      // o outro.
      let acumulado = employees;
      const criados: string[] = [];
      for (const conta of semCadastro) {
        const funcionario = await criarFuncionarioDaConta(conta, acumulado);
        acumulado = [...acumulado, funcionario];
        criados.push(funcionario.name);
      }
      notify(criados.length === 1
        ? `${criados[0]} agora aparece como mecânico na abertura de OS.`
        : `${criados.length} mecânicos agora aparecem na abertura de OS.`);
      await refreshUsers();
    } catch (erro) {
      setError(erro instanceof Error ? erro.message : "Não foi possível criar o cadastro de funcionário.");
    } finally {
      setBusy(false);
    }
  };

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

      {semCadastro.length ? (
        <section className="access-fix-banner">
          <span><Icon name="alert" size={19}/></span>
          <div>
            <strong>{semCadastro.length === 1 ? "1 mecânico não aparece na abertura de OS" : `${semCadastro.length} mecânicos não aparecem na abertura de OS`}</strong>
            <p>{semCadastro.map((conta) => conta.name).join(", ")} {semCadastro.length === 1 ? "tem login" : "têm login"} no sistema, mas ainda não {semCadastro.length === 1 ? "tem" : "têm"} cadastro de funcionário — e é o cadastro de funcionário que a OS usa para distribuir o serviço.</p>
          </div>
          <button disabled={busy} onClick={() => void criarCadastrosPendentes()}>
            {busy ? "Criando..." : semCadastro.length === 1 ? "Criar cadastro" : "Criar os cadastros"}
          </button>
        </section>
      ) : null}
      {credentials ? <section className="access-credentials-banner"><span><Icon name="check" size={19}/></span><div><small>Credenciais temporárias prontas</small><strong>{credentials.name} · {credentials.email}</strong><p>Senha: <b>{credentials.password}</b> · entregue ao funcionário por um canal seguro.</p></div><button onClick={() => void copyText(`E-mail: ${credentials.email}\nSenha temporária: ${credentials.password}`, "Credenciais copiadas.")}>Copiar credenciais</button><button className="credentials-close" aria-label="Fechar aviso" onClick={() => setCredentials(null)}>×</button></section> : null}
      {sourceMode === "checking" ? <div className="auth-sync-state checking"><Icon name="clock" size={17}/><span>Consultando as contas do Firebase Authentication...</span></div> : sourceMode === "fallback" ? <div className="access-mode-note"><Icon name="alert" size={17}/><span>O backend administrativo ainda não está configurado neste ambiente. Por segurança, o sistema carregou apenas os perfis já liberados no Firestore. Configure a variável FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON para trazer também as contas sem perfil.</span></div> : sourceMode === "cloud" ? <div className="auth-sync-state"><Icon name="check" size={17}/><span>Authentication sincronizado: contas novas ou antigas aparecem automaticamente nesta lista.</span></div> : null}
      {error ? <div className="firebase-error access-error"><Icon name="alert" size={17}/><span>{error}</span></div> : null}

      <section className="panel module-panel access-panel">
        <div className="list-toolbar access-toolbar"><label className="mini-search"><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, telefone ou funcionário"/></label><div className="access-filters"><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar por perfil"><option>Todos</option><option>Super Admin</option><option>Balcão</option><option>Mecânico</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por situação"><option>Ativos</option><option>Sem perfil</option><option>Inativos</option><option>Todos</option></select></div></div>
        <div className="table-scroll">
          <table className="access-table">
            <thead><tr><th>Usuário</th><th>Perfil</th><th className="col-secondary">Funcionário</th><th className="col-secondary">Permissões</th><th className="col-secondary">Último acesso</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{loading && !managedUsers.length ? <tr><td colSpan={7}><div className="access-empty">Buscando contas do Authentication...</div></td></tr> : filteredUsers.length ? filteredUsers.map((user) => {
              const employee = employees.find((item) => item.id === user.employeeId);
              const initials = user.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const lastAccess = user.lastSignInAt ? new Date(user.lastSignInAt) : null;
              return <tr key={user.uid} className={user.hasAccessProfile && !user.active ? "access-inactive" : ""}>
                <td><div className="access-user-cell"><span className="registry-avatar">{initials || "US"}</span><div><strong>{user.name}{user.uid === currentUser?.uid ? <em>Você</em> : null}{!user.hasAccessProfile ? <em className="auth-only">Authentication</em> : null}</strong><small>{user.email || "E-mail não informado"}{user.phone ? ` · ${user.phone}` : ""}</small></div></div></td>
                <td className="col-secondary">{user.hasAccessProfile ? <span className={`access-role ${user.role === "Super Admin" ? "admin" : user.role === "Balcão" ? "counter" : "mechanic"}`}>{user.role}</span> : <span className="access-role pending">Definir perfil</span>}</td>
                <td className="col-secondary"><strong>{employee?.name || user.employeeId || "Não vinculado"}</strong><span>{employee?.position || (user.employeeId ? "Cadastro da equipe" : "Acesso independente")}</span></td>
                <td className="col-secondary"><strong>{user.hasAccessProfile ? user.role === "Super Admin" ? "Acesso total" : `${user.permissions.length} permissões` : "Nenhuma ainda"}</strong><span>{user.permissions.includes("orders.create") && user.hasAccessProfile ? "Pode abrir OS" : "Não abre nova OS"}</span></td>
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
              <label className="field"><span>Perfil de acesso</span><select value={form.role} onChange={(event) => { const role = event.target.value as FirebaseAccessProfile["role"]; setForm({ ...form, role, permissions: defaultFirebasePermissions(role) }); }}><option>Super Admin</option><option>Balcão</option><option>Mecânico</option></select></label>
              {/* Vincular ao funcionário não mexe mais nas permissões: antes, escolher o funcionário "USR-003" acrescentava permissões sozinho. Quem decide o acesso é a lista abaixo, e só ela. */}
              <label className="field"><span>Vincular ao funcionário</span><select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Sem vínculo</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name} · {employee.position}</option>)}</select></label>
              {dialogMode === "create" ? <label className="field field-full"><span>Senha temporária de 6 números</span><div className="password-builder"><input inputMode="numeric" maxLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: onlyDigits(event.target.value).slice(0, 6) })}/><button onClick={() => setForm({ ...form, password: emptyAccessForm().password })}>Gerar outra</button><button onClick={() => void copyText(form.password, "Senha copiada.")}>Copiar</button></div><small className="field-help">Entregue essa senha ao funcionário. Ele poderá usá-la no primeiro acesso.</small></label> : null}
            </div>
            <label className="toggle-row"><input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })}/><span/><div><strong>Usuário ativo</strong><small>Pode entrar no sistema e usar somente as permissões marcadas abaixo.</small></div></label>
            <div className="permission-editor">
              <div className="permission-editor-head"><div><span className="form-eyebrow">Controle individual</span><h3>O que este usuário pode acessar?</h3><p>Marque exatamente o que esta pessoa poderá fazer. Nada é liberado sozinho: um mecânico que precisa abrir OS recebe a permissão marcada aqui.</p></div>{form.role !== "Super Admin" ? <button onClick={() => setForm({ ...form, permissions: defaultFirebasePermissions(form.role) })}>Aplicar padrão do perfil</button> : null}</div>
              {form.role === "Super Admin" ? <div className="permission-admin-all"><Icon name="shield" size={20}/><div><strong>Acesso completo</strong><small>Super Admin possui automaticamente todos os módulos, configurações e gestão de usuários.</small></div></div> : <div className="permission-groups">{accessPermissionGroups.map((group) => <section key={group.title}><header><div><strong>{group.title}</strong><small>{group.detail}</small></div><b>{group.permissions.filter((permission) => form.permissions.includes(permission.key)).length}/{group.permissions.length}</b></header><div>{group.permissions.map((permission) => <label className="permission-row" key={permission.key}><input type="checkbox" checked={form.permissions.includes(permission.key)} onChange={() => togglePermission(permission.key)}/><span><i/></span><div><strong>{permission.label}</strong><small>{permission.help}</small></div></label>)}</div></section>)}</div>}
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
  currentFirebaseUser,
  products,
  orders,
  clients,
  motorcycles,
  sales,
  expenses,
  accounts,
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
  currentFirebaseUser: FirebaseUserSummary | null;
  products: ProductRecord[];
  orders: OrderRecord[];
  clients: ClientRecord[];
  motorcycles: MotorcycleRecord[];
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  accounts: AccountRecord[];
  categories: CategoryConfig[];
  quickServices: QuickServiceConfig[];
  partners: PartnerConfig[];
  paymentMachines: PaymentMachineConfig[];
  paymentMethods: PaymentMethodConfig[];
  suppliers: SupplierConfig[];
}) {
  const summary = useMemo(() => financeSummary(sales, orders, expenses, accounts), [sales, orders, expenses, accounts]);
  const activeUsers = users.filter((user) => user.active !== false);
  const lowStock = products.filter((product) => product.stock <= product.minimum);
  const openOrders = orders.filter((order) => !order.closed && order.status !== "Entrega");
  const activeMethods = paymentMethods.filter((method) => method.active);
  const activeMachines = paymentMachines.filter((machine) => machine.active);
  const activeQuickServices = quickServices.filter((service) => service.active);
  const activePartners = partners.filter((partner) => partner.active);
  const osPrefix = settings?.osPrefix || "OS";

  // --- Cópia de segurança ---
  // O Firestore no plano gratuito não guarda backup nenhum. O aviso existe
  // porque o problema real não é gerar o arquivo, é lembrar de gerar.
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNote, setBackupNote] = useState("");
  const lembrete = backupReminder(settings?.lastBackupAt);
  const backupAtrasado = backupIsDue(settings?.lastBackupAt);

  const baixarBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupNote("");
    try {
      const { data, failed } = await readAllCollections();
      const arquivo = buildBackup(data, {
        createdBy: currentFirebaseUser?.email ?? "",
        workshop: settings?.workshopName || "Pica Pau Motos",
      });
      downloadFile(backupFileName(), JSON.stringify(arquivo, null, 2));
      // A data fica em settings para valer em qualquer aparelho — guardar no
      // navegador faria o celular achar que nunca houve backup feito no
      // computador, e vice-versa.
      await saveFirestoreDoc("settings", "global", { lastBackupAt: arquivo.createdAt });
      const resumo = backupSummary(arquivo).slice(0, 3).map((item) => `${item.count} ${item.collection}`).join(", ");
      setBackupNote(failed.length
        ? `${backupCount(arquivo)} registros salvos, mas ${failed.join(", ")} não pôde ser lido. Essa parte NÃO está protegida.`
        : `${backupCount(arquivo)} registros salvos (${resumo}…). Guarde o arquivo fora do celular.`);
    } catch (error) {
      setBackupNote(error instanceof Error ? error.message : "Não foi possível gerar a cópia de segurança.");
    } finally {
      setBackupBusy(false);
    }
  };

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

      <div className={backupAtrasado ? "admin-pending" : "admin-pending backup-ok"} role="status">
        <Icon name={backupAtrasado ? "alert" : "check"} size={18}/>
        <div>
          <strong>{backupAtrasado ? "Cópia de segurança" : "Cópia de segurança em dia"}</strong>
          <small>{lembrete || "Baixada hoje. O arquivo traz produtos, clientes, OS, vendas, caixa e contas."}</small>
        </div>
        <div className="admin-pending-actions">
          <button onClick={() => void baixarBackup()} disabled={backupBusy}>{backupBusy ? "Gerando…" : "Baixar backup"}</button>
        </div>
      </div>
      {backupNote ? <div className="info-strip"><Icon name="check" size={18}/><span>{backupNote}</span></div> : null}

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

export function ModuleWorkspace({
  stockAdjustments,
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
  discount,
  setDiscount,
  sales,
  accounts,
  cashSessions,
  movements,
  viewerEmployeeId,
  viewerIsMechanic,
  onAdvanceOrder,
  openSettings,
  settingsTab,
  settings,
  motorcycles,
}: {
  stockAdjustments: StockAdjustmentRecord[];
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
  discount: number;
  setDiscount: (value: number) => void;
  sales: SaleRecord[];
  accounts: AccountRecord[];
  cashSessions: CashSession[];
  movements: MovementRecord[];
  viewerEmployeeId: string;
  viewerIsMechanic: boolean;
  onAdvanceOrder: (order: OrderRecord, status: ServiceOrderStatus, mechanicIds: string[]) => Promise<void>;
  openSettings: (tab: SettingsTab) => void;
  settingsTab: SettingsTab;
  settings: Partial<SettingsConfig> | null;
  motorcycles: MotorcycleRecord[];
}) {
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("Todos");
  // Qual cliente está com o histórico aberto na lista. Um de cada vez: abrir
  // todos empurraria a lista para longe e ninguém acha mais ninguém.
  const [historicoDe, setHistoricoDe] = useState("");
  // Filtro por grupo na lista de peças: a oficina procura "todos os óleos".
  const [productGroup, setProductGroup] = useState("");

  // Todo hook desta função precisa ficar acima dos returns antecipados abaixo.
  // Estes dois useMemo estavam depois deles: ao trocar de uma aba que retorna
  // cedo (PDV, Financeiro...) para uma que não retorna, o React via uma
  // quantidade diferente de hooks e derrubava a tela inteira
  // ("Rendered more hooks than during the previous render") — a tela branca
  // que aparecia em algumas abas.
  // Os KPIs de Financeiro, Relatórios e Vendas do balcão eram "R$ 0,00" e "0"
  // escritos direto no ternário.
  const moduleSummary = useMemo(() => financeSummary(sales, orders, expenses, accounts, movements), [sales, orders, expenses, accounts, movements]);
  const salesToday = useMemo(() => sales.filter((sale) => sale.date === new Date().toLocaleDateString("pt-BR")), [sales]);

  if (active === "PDV Balcão") return <PdvWorkspace notify={notify} openDialog={openDialog} cart={cart} setCart={setCart} discount={discount} setDiscount={setDiscount} products={products} clients={clients} blockZeroStockSale={settings?.blockZeroStockSale !== false} />;
  if (active === "Serviço rápido") return <QuickServiceWorkspace openDialog={(dialog) => openDialog(dialog)} quickServices={quickServices}/>;
  if (active === "Financeiro") return <FinanceWorkspace openDialog={openDialog} navigate={navigate} expenses={expenses} users={users} sales={sales} orders={orders} accounts={accounts} cashSessions={cashSessions} movements={movements}/>;
  if (active === "Contas a receber") return <AccountsWorkspace kind="receber" openDialog={openDialog} expenses={expenses} accounts={accounts}/>;
  if (active === "Contas a pagar") return <AccountsWorkspace kind="pagar" openDialog={openDialog} expenses={expenses} accounts={accounts}/>;
  if (active === "Ajuste de estoque") return <StockAdjustWorkspace products={products} adjustments={stockAdjustments} currentUser={currentFirebaseUser} notify={notify} canManage={canOperate}/>;
  if (active === "Relatórios") return <ReportWorkspace sales={sales} orders={orders} expenses={expenses} movements={movements} accounts={accounts} notify={notify}/>;
  if (active === "Funcionários") return <TeamWorkspace users={users} setUsers={setUsers} openDialog={openDialog} notify={notify} orders={orders} sales={sales} expenses={expenses} canManageTeam={canOperate}/>;
  if (active === "Usuários e acessos") return <UserAccessWorkspace currentUser={currentFirebaseUser} firebaseConnected={firebaseConnected} employees={users} setEmployees={setUsers} notify={notify} openFirebaseAccess={openFirebaseAccess}/>;
  if (active === "Configurações") return (
    <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
      <SettingsWorkspace quickServices={quickServices} setQuickServices={setQuickServices} categories={categories} setCategories={setCategories} paymentMachines={paymentMachines} setPaymentMachines={setPaymentMachines} paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods} partners={partners} setPartners={setPartners} notify={notify} initialTab={settingsTab}/>
    </Suspense></ErrorBoundary>
  );
  if (active === "Administração") return <AdminWorkspace navigate={navigate} openSettings={openSettings} settings={settings} users={users} currentFirebaseUser={currentFirebaseUser} products={products} orders={orders} clients={clients} motorcycles={motorcycles} sales={sales} expenses={expenses} accounts={accounts} categories={categories} quickServices={quickServices} partners={partners} paymentMachines={paymentMachines} paymentMethods={paymentMethods} suppliers={suppliers}/>;

  /**
   * O quadro do mecânico substitui a tabela de seis colunas.
   *
   * Só para quem é mecânico: o dono e o balcão precisam da visão da oficina
   * inteira. O mecânico precisa de duas respostas — o que é meu e o que tem
   * para pegar — em uma tela que funcione no celular, com uma mão.
   */
  if (active === "Ordens de serviço" && viewerIsMechanic) {
    const board = mechanicBoard(orders, viewerEmployeeId);
    const resumo = mechanicSummary(board);
    const allowMultiple = settings?.allowMultipleMechanics !== false;
    const busca = query.trim().toLowerCase();
    const filtrar = (list: OrderRecord[]) => list.filter((order) =>
      `${order.id} ${order.customer} ${order.bike} ${order.plate}`.toLowerCase().includes(busca));

    const linha = (order: OrderRecord) => {
      const row = boardRow(order, viewerEmployeeId);
      const equipe = users.filter((user) => (order.mechanicIds ?? []).includes(user.id)).map((user) => user.name);
      return (
        <div className="registry-row" key={order.id}>
          <span className="registry-avatar">{order.plate ? order.plate.slice(0, 2) : order.id.slice(-2)}</span>
          <span>
            <strong>{order.customer}</strong>
            <small>{order.id} · {order.bike}{order.plate ? ` · ${order.plate}` : ""}{!row.mine && equipe.length ? ` · ${equipe.join(" + ")}` : ""}</small>
            <small className="row-problem">{resumoDoServico(order)}</small>
            <span className={`status ${statusTone(order.status)}`}><i/>{order.status}</span>
          </span>
          <div className="order-actions">
            <button onClick={() => openDialog("order", order.id)}>Abrir</button>
            {row.actions.map((action) => (
              <button key={action.label} onClick={() => void onAdvanceOrder(order, action.target, mechanicsAfterTaking(order, viewerEmployeeId, allowMultiple))
                .then(() => notify(row.mine ? `${order.id}: ${action.target}.` : `${order.id} agora é sua.`))
                .catch((error) => notify(error instanceof Error ? error.message : "Não foi possível atualizar a OS."))}>{action.label}</button>
            ))}
          </div>
        </div>
      );
    };

    return (
      // O contêiner existe para o CSS: é ele que deixa o quadro se apertar no
      // celular sem mexer nas mesmas classes usadas pelo dono e pelo balcão.
      <div className="mechanic-board">
        <div className="module-heading">
          <div><p>Oficina</p><h1>Minhas ordens</h1><span>O que está com você e o que a oficina tem para pegar.</span></div>
          <span className="system-healthy"><i/><b>{resumo.working} na bancada agora</b></span>
        </div>

        {!viewerEmployeeId ? (
          <div className="admin-pending">
            <Icon name="alert" size={20}/>
            <div><strong>Sua conta não está ligada a um funcionário</strong><small>Por isso nenhuma OS aparece como sua. Peça ao administrador para vincular seu usuário ao seu cadastro de funcionário em Usuários e acessos.</small></div>
          </div>
        ) : null}

        <div className="module-summary">
          <article><span>Fazendo agora</span><strong>{resumo.working}</strong><small>{resumo.working > 0 ? "Na sua bancada" : "Nada em andamento"}</small></article>
          <article className={resumo.blocked > 0 ? "summary-danger" : ""}><span>Esperando peça</span><strong>{resumo.blocked}</strong><small>{resumo.blocked > 0 ? "Paradas até a peça chegar" : `${resumo.waiting} sua(s) a começar`}</small></article>
          <article><span>Na oficina</span><strong>{resumo.available}</strong><small>{resumo.available > 0 ? "Disponíveis para pegar" : "Nenhuma outra aberta"}</small></article>
        </div>

        <section className="panel module-panel">
          <div className="list-toolbar">
            <label className="mini-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar OS, cliente ou placa"/></label>
          </div>
          <div className="summary-title"><span>Minhas ordens</span><b>{board.mine.length} ABERTA(S)</b></div>
          <div className="registry-list">
            {filtrar(board.mine).length ? filtrar(board.mine).map(linha)
              : <div className="pdv-empty"><span><Icon name="wrench" size={20}/></span><strong>{board.mine.length ? "Nada bate com a busca" : "Nenhuma OS com você"}</strong><p>{board.mine.length ? "Apague a busca para ver as suas." : "Pegue uma da oficina, logo abaixo."}</p></div>}
          </div>
        </section>

        <section className="panel module-panel">
          <div className="summary-title"><span>Na oficina · para pegar</span><b>{board.shop.length} DISPONÍVEL(IS)</b></div>
          <div className="registry-list">
            {filtrar(board.shop).length ? filtrar(board.shop).map(linha)
              : <div className="pdv-empty"><span><Icon name="check" size={20}/></span><strong>{board.shop.length ? "Nada bate com a busca" : "Oficina em dia"}</strong><p>{board.shop.length ? "Apague a busca para ver todas." : "Nenhuma outra OS aberta agora."}</p></div>}
          </div>
        </section>
      </div>
    );
  }

  if (active === "Ordens de serviço" || active === "Orçamentos") {
    const isBudget = active === "Orçamentos";
    const filteredOrders = orders.filter((order) => {
      const text = `${order.id} ${order.customer} ${order.bike} ${order.plate}`.toLowerCase();
      const byText = text.includes(query.toLowerCase());
      const byStatus = listFilter === "Todos" || (listFilter === "Abertas" && ["Recepção", "Avaliação", "Aprovação"].includes(order.status)) || (listFilter === "Em andamento" && ["Em serviço", "Aguardando peça"].includes(order.status)) || (listFilter === "Concluídas" && order.status === "Entrega");
      return byText && byStatus;
    });
    const openCount = orders.filter((order) => ["Recepção", "Avaliação", "Aprovação"].includes(order.status)).length;
    const inServiceCount = orders.filter((order) => order.status === "Em serviço").length;
    const blockedCount = orders.filter((order) => order.status === "Aguardando peça").length;
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
          <article><span>{isBudget ? "Aguardando cliente" : "Em serviço"}</span><strong>{isBudget ? budgetPendingCount : inServiceCount}</strong><small>{isBudget ? (budgetPendingCount > 0 ? "Aguardando aprovação" : "Nenhum em andamento") : blockedCount > 0 ? `${blockedCount} parada(s) esperando peça` : inServiceCount > 0 ? "Mecânicos trabalhando" : "Nenhum em andamento"}</small></article>
          <article><span>{isBudget ? "Aprovados no mês" : "Prontas"}</span><strong>{isBudget ? budgetApprovedCount : readyCount}</strong><small>{(isBudget ? budgetApprovedCount : readyCount) > 0 ? (isBudget ? "Propostas aceitas" : "Aguardando retirada") : "Nenhum registro"}</small></article>
        </div>
        <section className="panel module-panel">
          <div className="list-toolbar">
            <label className="mini-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por OS, cliente ou placa"/></label>
            <div className="filter-pills">{["Todos", "Abertas", "Em andamento", "Concluídas"].map((filter) => <button className={listFilter === filter ? "selected" : ""} key={filter} onClick={() => setListFilter(filter)}>{filter}</button>)}</div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>OS / Cliente</th><th className="col-secondary">Motocicleta</th><th className="col-secondary">Responsável</th><th className="col-secondary">Entrada</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>{filteredOrders.length > 0 ? filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong className="order-id">{order.id}</strong><span>{order.customer}</span></td>
                  <td className="col-secondary"><strong>{order.bike}</strong><span className="plate">{order.plate}</span></td>
                  <td className="col-secondary"><span className="mechanic-avatar">{order.mechanic ? order.mechanic[0] : "M"}</span>{order.mechanic || "Não definido"}</td>
                  <td className="col-secondary">{order.time ? `Entrada: ${order.time}` : "Hoje"}</td>
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
    // A lista do balcão: procurar por código, referência de fábrica, código de
    // barras, descrição ou grupo — é por qualquer um deles que a peça é pedida.
    const buscaProduto = query.trim().toLowerCase();
    const filteredProducts = products.filter((product) => {
      const byText = !buscaProduto || `${product.code} ${product.partNumber ?? ""} ${product.barcode ?? ""} ${product.name} ${product.category} ${product.location ?? ""}`.toLowerCase().includes(buscaProduto);
      const byGroup = !productGroup || product.category === productGroup;
      const byStatus = listFilter === "Todos" || product.status === listFilter;
      return byText && byGroup && byStatus;
    });
    const gruposComProduto = Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort((um, outro) => um.localeCompare(outro, "pt-BR"));
    const criticalCount = products.filter((p) => p.stock > 0 && p.stock <= p.minimum).length;
    const zeroStockCount = products.filter((p) => p.stock === 0).length;

    return (
      <>
        <div className="module-heading">
          <div><p>Produtos e peças</p><h1>Controle de estoque</h1><span>Veja saldos, preços e itens que precisam de reposição.</span></div>
          {canOperate ? <div className="heading-actions">
            <button className="outline-button large" onClick={downloadStockTemplate}>Baixar modelo Sheets</button>
            <button className="outline-button large" onClick={() => openDialog("nfe")}>Importar nota (XML)</button>
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
          {/*
            A lista de peças no formato de quem trabalha com ela: uma linha por
            produto, com código, referência, código de barras, descrição, grupo,
            localização, preço, saldo e unidade — tudo à vista, sem abrir o
            cadastro para conferir. O preço, que é o que mais se olha, fica em
            destaque; o saldo carrega a bolinha de crítico/zerado.
          */}
          <div className="list-toolbar stock-toolbar">
            <label className="mini-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, referência, código de barras ou descrição"/></label>
            <label className="stock-group-filter">
              <span>Grupo</span>
              <select value={productGroup} onChange={(event) => setProductGroup(event.target.value)}>
                <option value="">Todos os grupos</option>
                {gruposComProduto.map((grupo) => <option value={grupo} key={grupo}>{grupo}</option>)}
              </select>
            </label>
            <button className="outline-button" onClick={() => { setQuery(""); setProductGroup(""); setListFilter("Todos"); }}>Limpar</button>
            <div className="filter-pills">{["Todos", "Crítico", "Sem estoque"].map((filter) => <button className={listFilter === filter ? "selected" : ""} key={filter} onClick={() => setListFilter(filter)}>{filter}</button>)}</div>
          </div>
          <div className="table-scroll">
            <table className="stock-table">
              <thead><tr>
                <th>Código</th><th className="col-secondary">Referência</th><th className="col-secondary">Cód. barras</th>
                <th>Descrição</th><th className="col-secondary">Grupo</th><th className="col-secondary">Local</th>
                <th className="num">Preço</th><th className="num">Estoque</th><th className="col-secondary">Un.</th><th></th>
              </tr></thead>
              <tbody>{filteredProducts.length > 0 ? filteredProducts.map((product) => (
                <tr key={product.code} onDoubleClick={() => canOperate ? openDialog("product", product.id) : undefined}>
                  <td className="mono">{product.code}</td>
                  <td className="col-secondary mono">{product.partNumber || "—"}</td>
                  <td className="col-secondary mono">{product.barcode || "SEM GTIN"}</td>
                  <td><strong>{product.name}</strong>{product.active === false ? <span className="inactive-tag">Inativo</span> : null}</td>
                  <td className="col-secondary">{product.category}</td>
                  <td className="col-secondary">{product.location || "—"}</td>
                  <td className="num"><strong className="stock-price">{product.price}</strong></td>
                  <td className="num">
                    <span className={`stock-dot ${product.stock === 0 ? "zero" : product.stock <= product.minimum ? "baixo" : "ok"}`}/>
                    <strong className={product.stock <= product.minimum ? "danger-text" : ""}>{product.stock}</strong>
                  </td>
                  <td className="col-secondary">{product.unit || "UN"}</td>
                  <td><button className="row-button" aria-label={`Abrir ${product.name}`} onClick={() => canOperate ? openDialog("product", product.id) : notify("Seu perfil pode consultar o estoque, mas não alterar produtos.")}><Icon name="arrow" size={17}/></button></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    {products.length ? "Nenhum produto encontrado com esses filtros." : "Nenhum produto cadastrado no estoque."}
                  </td>
                </tr>
              )}</tbody>
            </table>
          </div>
          <div className="stock-count">{filteredProducts.length === products.length ? `${products.length} registro${products.length === 1 ? "" : "s"}` : `${filteredProducts.length} de ${products.length} registro${products.length === 1 ? "" : "s"}`}</div>
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

  // A placa entra no registro do cliente porque é por ela que o balcão procura:
  // a moto chega no portão e ninguém pergunta o nome antes de ler a placa.
  const defaultRecords = clients.map((client) => {
    const placas = motorcycles.filter((moto) => moto.ownerId === client.id).map((moto) => formatPlate(moto.plate)).filter(Boolean);
    return {
      id: client.id,
      name: client.name,
      sub: [client.phone || "Sem telefone", ...placas.slice(0, 3)].join(" · "),
      meta: client.detail || "Cliente cadastrado",
      initials: (client.name.split(" ").slice(0, 2).map((word) => word[0]).join("") || "CL").toUpperCase(),
      inativo: client.active === false,
      busca: `${client.name} ${client.phone} ${client.detail ?? ""} ${placas.join(" ")} ${placas.map(normalizePlate).join(" ")}`,
    };
  });
  const motorcycleRecords = motorcycles.map((moto) => {
    const owner = clients.find((c) => c.id === moto.ownerId);
    return {
      id: moto.id,
      name: `${moto.brand} ${moto.model}`,
      sub: `${owner ? owner.name : "Proprietário não vinculado"} · ${moto.plate}`,
      meta: `${moto.year} · ${moto.color}`,
      initials: (moto.model.slice(0, 2) || "MT").toUpperCase(),
      inativo: moto.active === false,
    };
  });
  const supplierRecords = suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, sub: `${supplier.phone || "Sem telefone"} · ${supplier.deliveryDays === 0 ? "Entrega no dia" : `Entrega em ${supplier.deliveryDays} dia${supplier.deliveryDays === 1 ? "" : "s"}`}`, meta: supplier.categories, initials: (supplier.name.split(" ").slice(0, 2).map((word) => word[0]).join("") || "FN").toUpperCase(), inativo: supplier.active === false }));
  
  const records = active === "Fornecedores" ? supplierRecords : active === "Motocicletas" ? motorcycleRecords : active === "Clientes" ? defaultRecords : [];
  
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
  // Procurar "abc1d23" precisa achar a moto gravada como "ABC-1D23": o hífen
  // que a tela mostra não é o que a pessoa digita com a moto na frente.
  const buscaCrua = query.trim().toLowerCase();
  const buscaPlaca = normalizePlate(query);
  const filteredRecords = records.filter((record) => {
    const texto = `${record.name} ${record.sub} ${record.meta} ${(record as { busca?: string }).busca ?? ""}`.toLowerCase();
    if (!buscaCrua) return true;
    return texto.includes(buscaCrua) || (buscaPlaca.length >= 3 && texto.toUpperCase().includes(buscaPlaca));
  });

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
          filteredRecords.map((record) => {
            const abrirCadastro = () => canOperate
              ? openDialog(active === "Fornecedores" ? "supplier" : active === "Compras e entradas" ? "purchase" : active === "Financeiro" ? "finance" : active === "Motocicletas" ? "motorcycle" : active === "Clientes" ? "client" : "record", record.id)
              : notify("Seu perfil possui acesso de consulta a este cadastro.");
            // Só cliente e moto têm histórico de oficina: fornecedor e conta não
            // guardam "o que já foi feito nessa moto".
            const temHistorico = active === "Clientes" || active === "Motocicletas";
            if (!temHistorico) return (
              <button className={record.inativo ? "registry-row inativo" : "registry-row"} key={record.id} onClick={abrirCadastro}>
                <span className="registry-avatar">{record.initials}</span>
                <span><strong>{record.name}{record.inativo ? <span className="inactive-tag">Inativo</span> : null}</strong><small>{record.sub}</small></span>
                <span className="registry-meta">{record.meta}</span><Icon name="arrow" size={17}/>
              </button>
            );
            const aberto = historicoDe === record.id;
            const historico = active === "Clientes"
              ? clientHistory({ id: record.id }, orders, motorcycles)
              : motorcycleHistory(motorcycles.find((moto) => moto.id === record.id), orders);
            return (
              <div className={`registry-item ${aberto ? "aberto" : ""}`} key={record.id}>
                <div className="registry-row-wrap">
                  <button className={record.inativo ? "registry-row inativo" : "registry-row"} onClick={abrirCadastro}>
                    <span className="registry-avatar">{record.initials}</span>
                    <span><strong>{record.name}{record.inativo ? <span className="inactive-tag">Inativo</span> : null}</strong><small>{record.sub}</small></span>
                    <span className="registry-meta">{record.meta}</span><Icon name="arrow" size={17}/>
                  </button>
                  <button className="registry-history-button" onClick={() => setHistoricoDe(aberto ? "" : record.id)}>
                    <Icon name="clock" size={15}/>
                    {aberto ? "Ocultar" : "Histórico"}
                    {historico.visits ? <b>{historico.visits}</b> : null}
                  </button>
                </div>
                {aberto ? <HistoryPanel historico={historico} vazio={active === "Clientes" ? "Este cliente ainda não tem atendimento registrado." : "Esta moto ainda não passou pela oficina."} /> : null}
              </div>
            );
          })
        ) : (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
            Nenhum registro encontrado em {active.toLowerCase()}.
          </div>
        )}
      </section>
    </>
  );
}

export function AppDialog({
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
  selectedRecordId,
  osPrefix,
  canManageCustomers,
  cart,
  setCart,
  discount,
  setDiscount,
  sales,
  stockEntries,
  accounts,
  cashSessions,
  movements,
  lists,
  settings,
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
  selectedRecordId: string;
  osPrefix: string;
  canManageCustomers: boolean;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  discount: number;
  setDiscount: (value: number) => void;
  sales: SaleRecord[];
  stockEntries: StockEntryRecord[];
  accounts: AccountRecord[];
  cashSessions: CashSession[];
  movements: MovementRecord[];
  lists: Partial<SystemLists> | null;
  settings: Partial<SettingsConfig> | null;
  currentUser: FirebaseUserSummary | null;
}) {
  // Os modais de cadastro já sabiam editar; o que faltava era receber o
  // registro. Sem isto, clicar numa linha da lista abria um formulário em
  // branco e o "salvar" criava um registro novo em vez de atualizar.
  const editingProduct = products.find((product) => product.id === selectedRecordId) ?? null;
  const editingClient = clients.find((client) => client.id === selectedRecordId) ?? null;
  const editingMotorcycle = motorcycles.find((motorcycle) => motorcycle.id === selectedRecordId) ?? null;
  const editingSupplier = suppliers.find((supplier) => supplier.id === selectedRecordId) ?? null;

  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [splitPayment, setSplitPayment] = useState(false);
  // Duas partes: forma e valor de cada uma. A segunda é calculada como o
  // restante enquanto a pessoa não digita nada nela — que é como todo mundo
  // divide na prática ("R$ 50 no dinheiro, o resto no PIX").
  const [splitFirstMethod, setSplitFirstMethod] = useState("PIX");
  const [splitFirstAmount, setSplitFirstAmount] = useState("");
  const [splitSecondMethod, setSplitSecondMethod] = useState("Dinheiro");
  const [cashReceived, setCashReceived] = useState("");
  const [catalogSelection, setCatalogSelection] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("Todos");
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [cashAction, setCashAction] = useState("Suprimento");
  const [settingsTab, setSettingsTab] = useState("Oficina");
  // Entrada de estoque: o diálogo já existia com os campos, mas nenhum deles
  // tinha estado e nada era gravado — o texto "o custo médio será recalculado"
  // era só uma promessa.
  // Lançamento de conta a receber / a pagar.
  const [accountPerson, setAccountPerson] = useState("");
  const [accountDescriptionText, setAccountDescriptionText] = useState("");
  const [accountAmount, setAccountAmount] = useState("");
  const [accountDueDate, setAccountDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [accountCategory, setAccountCategory] = useState("");
  const [accountInstallments, setAccountInstallments] = useState(1);
  const [accountNotes, setAccountNotes] = useState("");
  // Baixa de conta.
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [settleMethod, setSettleMethod] = useState("PIX");
  const [settleFull, setSettleFull] = useState(true);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [purchasePayment, setPurchasePayment] = useState("À vista");
  const [purchaseItems, setPurchaseItems] = useState<Array<{ productId: string; quantity: number; unitCost: number }>>([]);
  const [extraOrderItem, setExtraOrderItem] = useState(false);
  const [quickService, setQuickService] = useState(quickServices[0]?.name ?? "Serviço rápido");
  const [quickProduct, setQuickProduct] = useState("Sem produto");
  const [quickServiceValue, setQuickServiceValue] = useState(String(quickServices[0]?.laborPrice ?? 0));
  const [quickPartValue, setQuickPartValue] = useState("0");
  const [quickQuantity, setQuickQuantity] = useState(1);
  const [quickPayment, setQuickPayment] = useState("PIX");
  const [expenseCategory, setExpenseCategory] = useState("Peça comprada fora do estoque");
  const [expensePaymentMode, setExpensePaymentMode] = useState("Caixa");
  const [expenseSupplierId, setExpenseSupplierId] = useState("");
  const [expensePlannedMethod, setExpensePlannedMethod] = useState("PIX");
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
  const [osMileageChecked, setOsMileageChecked] = useState("Sim");
  const [quickAccount, setQuickAccount] = useState("");
  const [osDelivery, setOsDelivery] = useState("");
  // Cadastro rápido da etapa 1, quando o cliente ou a moto ainda não existem.
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehicleYear, setNewVehicleYear] = useState("");
  // A cor era um campo solto, sem estado: o que se digitava nele sumia.
  const [newVehicleColor, setNewVehicleColor] = useState("");
  // Marca, modelo e versão do cadastro rápido da moto na OS. Eram digitados à
  // mão: a mesma moto entrava escrita de três jeitos e o histórico dela se
  // dividia. Saem do mesmo catálogo do cadastro completo.
  // O bloco do cliente tem um estado só de cada vez: procurando, encontrado ou
  // cadastrando. Antes o formulário de cadastro aparecia sozinho sempre que a
  // busca não achava nada — inclusive com o campo ainda vazio.
  // Sobe para antes dos returns antecipados: os formulários de moto abertos
  // acima deles também precisam da lista de parceiras.
  const activePartners = partners.filter((partner) => partner.active);
  const [osNewCustomer, setOsNewCustomer] = useState(false);
  // "Atender sem cadastrar agora": a moto chega no guincho, ou o cliente deixa
  // e sai correndo. A OS abre com a placa e o serviço anda; o encerramento é
  // que cobra o nome e o WhatsApp.
  const [osSkipCustomer, setOsSkipCustomer] = useState(false);
  // O histórico do cliente fica fechado até alguém pedir: quem abre OS o dia
  // inteiro não quer rolar dez atendimentos antigos antes de digitar a placa.
  const [verHistorico, setVerHistorico] = useState(false);
  // Busca da moto na etapa da parceira: frota tem dezenas de motos, e rolar um
  // <select> com cinquenta placas não é escolher, é procurar.
  const [partnerBikeSearch, setPartnerBikeSearch] = useState("");

  // Os dados que faltam de uma OS aberta sem cliente, preenchidos no
  // encerramento. Ficam separados dos campos da OS nova para não misturar o
  // que se está abrindo com o que se está fechando.
  const [checkoutCustomerName, setCheckoutCustomerName] = useState("");
  const [checkoutCustomerPhone, setCheckoutCustomerPhone] = useState("");
  const [newVehicleBrand, setNewVehicleBrand] = useState("Honda");
  const [newVehicleCatalogModel, setNewVehicleCatalogModel] = useState("");
  const [newVehicleVersion, setNewVehicleVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  // Importação de planilha: a prévia fica em pé até a pessoa confirmar, para
  // ela conferir o que vai entrar antes de mexer no estoque.
  // Movimentação de dinheiro lançada à mão.
  const [movementKind, setMovementKind] = useState<"entrada" | "saida">("entrada");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementCategory, setMovementCategory] = useState("");
  const [movementMethod, setMovementMethod] = useState("Dinheiro");
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().split("T")[0] ?? "");
  const [movementDescription, setMovementDescription] = useState("");
  // Caixa: valor e motivo da movimentação, e o contado no fechamento.
  const [cashAmount, setCashAmount] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [cashCounted, setCashCounted] = useState("");
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importReading, setImportReading] = useState(false);
  /*
    A nota do fornecedor.

    Cada linha é um item da nota já conferido contra o cadastro, mais o que a
    pessoa pode mexer: quantas unidades vêm em cada volume (a nota diz "1 CX" e
    entram 6) e se aquele item entra nesta baixa.
  */
  const [nfeNota, setNfeNota] = useState<NfeNota | null>(null);
  const [nfeLinhas, setNfeLinhas] = useState<Array<ItemConferido & { fatorTexto: string; incluir: boolean; cadastrar: boolean }>>([]);
  const [nfeFileName, setNfeFileName] = useState("");
  const [nfeReading, setNfeReading] = useState(false);

  // Cadastro completo de cliente ou moto sem sair da OS.
  //
  // A OS já deixava criar cliente e moto com o mínimo (nome, placa, modelo),
  // mas não dava acesso ao cadastro de verdade — CPF, endereço, chassi,
  // proprietário, quilometragem. Quem precisava disso tinha que fechar a OS,
  // ir em Cadastros, voltar e recomeçar. Agora o formulário completo abre por
  // cima da OS e, ao salvar, já entra selecionado nela.
  const [cadastroNaOs, setCadastroNaOs] = useState<"cliente" | "moto" | null>(null);

  // Quem paga a OS. Era um <select> com `defaultValue`, sem estado e sem
  // ninguém lendo: escolher "Empresa parceira" não mudava nada, e a OS da
  // frota era cobrada do motoboy que trouxe a moto.
  const [osPayer, setOsPayer] = useState<"owner" | "partner">("owner");
  // Os campos de entregador saíram junto com a etapa de origem: quem abre a OS
  // já escolhe a parceira e a moto, e anotar quem foi buscar não mudava nada no
  // atendimento. O campo continua no tipo para as OS antigas seguirem legíveis.

  const currentOrder = orders.find((order) => order.id === selectedRecordId) ?? orders[0];
  // O botão de baixa passa o id da conta pelo mesmo caminho que o detalhe da OS.
  const currentAccount = accounts.find((account) => account.id === selectedRecordId);
  const currentAccountOpen = currentAccount ? accountOpen(currentAccount) : 0;

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

  // O AppDialog fica montado o tempo todo. Sem isto, reabrir a importação
  // mostraria a prévia da planilha anterior e o botão ofereceria importar de
  // novo peças que já entraram.
  useEffect(() => {
    if (dialog === "os") return;
    setCadastroNaOs(null);
  }, [dialog]);

  useEffect(() => {
    if (dialog === "import" || dialog === "nfe") return;
    setImportPlan(null);
    setImportFileName("");
    setImportReading(false);
  }, [dialog]);

  // Mesmo motivo no caixa: reabrir o diálogo com o valor da sangria anterior
  // ainda digitado é o tipo de coisa que faz sair dinheiro duas vezes.
  // Fechar e reabrir o pagamento não pode manter a divisão anterior: seria
  // dividir a venda seguinte com os valores da venda passada.
  useEffect(() => {
    if (dialog === "orderCheckout") return;
    setCheckoutCustomerName("");
    setCheckoutCustomerPhone("");
  }, [dialog]);

  useEffect(() => {
    if (dialog === "payment" || dialog === "orderCheckout") return;
    setSplitPayment(false);
    setSplitFirstAmount("");
    setCashReceived("");
  }, [dialog]);

  useEffect(() => {
    if (dialog === "finance") return;
    setMovementAmount("");
    setMovementCategory("");
    setMovementDescription("");
  }, [dialog]);

  useEffect(() => {
    if (dialog === "cash") return;
    setCashAmount("");
    setCashReason("");
    setCashCounted("");
  }, [dialog]);

  /*
    Criar categoria e marca sem sair do cadastro.

    Descobrir no meio do cadastro que a categoria da peça não existe obrigava a
    fechar o formulário, ir em Configurações, criar, voltar e digitar tudo de
    novo. Na prática ninguém faz isso: joga em "Peças" e segue — e o filtro do
    estoque para de significar alguma coisa.

    Categoria é documento próprio; marca é item de uma lista dentro de
    settings/lists. A regra de o que entra e o que é repetido está em
    src/quick-list.ts, para valer igual nos dois casos.
  */
  const criarCategoriaDeProduto = async (nome: string) => {
    /*
      A oficina que ainda não cadastrou categoria nenhuma vê as nove padrão.
      Elas não são documentos — são o texto que aparece enquanto a coleção está
      vazia. Gravar só a categoria nova fazia a coleção deixar de estar vazia e
      as outras NOVE SUMIREM da tela de uma vez.

      Então a primeira criação materializa as padrão junto: elas viram cadastro
      de verdade, editável em Configurações, e nada desaparece.
    */
    const doBanco = categories.filter((item) => item.group === "Produtos");
    const visiveis = orDefault(doBanco, defaultProductCategories);
    const resultado = addToList(visiveis.map((item) => item.name), nome);
    if (resultado.status !== "criado") return;
    const aGravar = doBanco.length ? [] : defaultProductCategories.map((item) => ({ ...item }));
    const jaExistentes = [...categories, ...aGravar];
    aGravar.push({ id: nextSequentialId(jaExistentes, "CAT"), name: resultado.value, group: "Produtos", active: true });
    for (const categoria of aGravar) {
      await saveFirestoreDoc("categories", categoria.id, { name: categoria.name, group: categoria.group, active: categoria.active });
    }
  };
  const criarItemDeLista = async (chave: "partBrands" | "motorcycleBrands", nome: string) => {
    const resultado = addToList(systemList(lists, chave), nome);
    if (resultado.status !== "criado") return;
    // Só a chave mexida vai no write: `saveFirestoreDoc` grava com merge, então
    // mandar o documento inteiro sobrescreveria alterações feitas em outra aba.
    await saveFirestoreDoc("settings", "lists", { [chave]: resultado.list });
  };

  if (!dialog) return null;

  // Estes cinco formulários ficavam ACIMA de todos os useState/useEffect
  // abaixo. Como o AppDialog fica montado o tempo todo, abrir o cadastro de
  // produto, fornecedor, moto, cliente ou funcionário fazia o React renderizar
  // zero hook depois de ter renderizado 86 — erro de contagem de hooks e tela
  // branca. Agora todo hook roda antes de qualquer return.
  /**
   * O que a exclusão precisa ler para decidir entre apagar e desativar.
   *
   * Uma base só, montada aqui, porque os cinco formulários fazem a mesma
   * pergunta: "este cadastro já foi usado em alguma coisa?". A conta em si é de
   * src/removal.ts. As contas de acesso saem do próprio cadastro de
   * funcionário: quem tem login gravado tem `userId`.
   */
  const baseParaExcluir: BaseDaOficina = {
    orders, sales, entries: stockEntries, expenses, accounts, motorcycles, products,
    access: users.filter((user) => user.userId).map((user) => ({ employeeId: user.id })),
  };
  const exclusao = (permitido: boolean) => ({
    base: baseParaExcluir,
    podeExcluir: permitido,
    notify: notify || finish,
    onRemoved: close,
  });

  if (dialog === "product") {
    return (
      <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
        <ProductFormModal
          isOpen={true}
          onClose={close}
          editingProduct={editingProduct}
          onSaved={(prod) => finish(`Produto "${prod.name}" salvo com sucesso no Firestore!`)}
          categories={categories}
          suppliers={suppliers}
          notify={notify || finish}
          allProducts={products}
          units={systemList(lists, "units")}
          partBrands={systemList(lists, "partBrands")}
          onCreateCategory={criarCategoriaDeProduto}
          onCreatePartBrand={(nome) => criarItemDeLista("partBrands", nome)}
          settings={settings}
          movementSources={{ stockEntries, sales, orders }}
          removal={exclusao(canOperate)}
        />
      </Suspense></ErrorBoundary>
    );
  }

  if (dialog === "supplier") {
    return (
      <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
        <SupplierFormModal
          isOpen={true}
          onClose={close}
          editingSupplier={editingSupplier}
          onSaved={(sup) => finish(`Fornecedor "${sup.name}" salvo com sucesso no Firestore!`)}
          notify={notify || finish}
          allSuppliers={suppliers}
          removal={exclusao(canOperate)}
        />
      </Suspense></ErrorBoundary>
    );
  }

  if (dialog === "motorcycle") {
    return (
      <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
        <MotorcycleFormModal
          isOpen={true}
          onClose={close}
          editingMotorcycle={editingMotorcycle}
          onSaved={(moto) => finish(`Motocicleta placa ${moto.plate} salva com sucesso no Firestore!`)}
          clients={clients}
          notify={notify || finish}
          allMotorcycles={motorcycles}
          brands={systemList(lists, "motorcycleBrands")}
          onCreateBrand={(nome) => criarItemDeLista("motorcycleBrands", nome)}
          partners={activePartners}
          removal={exclusao(canManageCustomers)}
        />
      </Suspense></ErrorBoundary>
    );
  }

  if (dialog === "client") {
    return (
      <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
        <ClientFormModal
          isOpen={true}
          onClose={close}
          editingClient={editingClient}
          onSaved={(cli) => finish(`Cliente "${cli.name}" salvo com sucesso no Firestore!`)}
          notify={notify || finish}
          allClients={clients}
          allMotorcycles={motorcycles}
          brands={systemList(lists, "motorcycleBrands")}
          onCreateBrand={(nome) => criarItemDeLista("motorcycleBrands", nome)}
          removal={exclusao(canManageCustomers)}
        />
      </Suspense></ErrorBoundary>
    );
  }

  if (dialog === "employee") {
    return (
      <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
        <EmployeeFormModal
          isOpen={true}
          onClose={close}
          onSaved={(emp) => finish(`Funcionário "${emp.name}" salvo com sucesso no Firestore!`)}
          notify={notify || finish}
          allEmployees={users}
        />
      </Suspense></ErrorBoundary>
    );
  }
  // A lista de mecânicos da OS sai de src/team-link.ts: as três telas que
  // perguntam "quem pode pegar esta OS" — nova OS, serviço rápido e o detalhe
  // da ordem — precisam responder igual, e em ordem fixa.
  const activeMechanics = mechanicsForOrders(users) as UserConfig[];
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const enabledQuickServices = quickServices.filter((service) => service.active);
  // Sem o padrão, uma oficina recém-instalada monta a venda e não encontra
  // forma de pagamento nenhuma para escolher — não consegue receber. A
  // coleção nasce vazia, e a tela só listava o que estivesse nela.
  const activePaymentMethods = orDefault(paymentMethods.filter((method) => method.active), defaultPaymentMethods);
  const activePaymentMachines = orDefault(paymentMachines.filter((machine) => machine.active), defaultPaymentMachines);
  const selectedMechanics = activeMechanics.filter((user) => selectedMechanicIds.includes(user.id));
  const orderMechanics = activeMechanics.filter((user) => orderMechanicIds.includes(user.id));
  // O <select> nasce mostrando a primeira parceira mesmo com o estado vazio —
  // `partners[0]?.id` foi lido antes de a lista chegar do Firestore. Tudo que
  // depende de "qual parceira" precisa sair DAQUI, e não do estado cru, senão a
  // tela mostra a Gonzaga e o filtro procura por id vazio: a lista de motos
  // dela vinha sempre vazia.
  const selectedPartner = activePartners.find((partner) => partner.id === selectedPartnerId) ?? activePartners[0];
  // Sem o `?? clients[0]`: escolher ninguém não pode significar "o primeiro da
  // lista". Era o que fazia o bloco da moto, ao cadastrar um cliente novo,
  // mostrar as motos de OUTRO cliente para escolher.
  const selectedCustomer = clients.find((client) => client.id === selectedCustomerId) ?? null;
  const lookupDigits = onlyDigits(customerLookup);
  const lookupTexto = customerLookup.trim().toLowerCase();
  /**
   * Todos os clientes que batem com o que foi digitado, não só o primeiro.
   *
   * Era um `.find()`: digitar "jo" já prendia a OS no primeiro João da agenda,
   * sem mostrar que existiam outros três. Numa oficina isso é rotina — pai e
   * filho com o mesmo nome, dois Silva, a mesma pessoa cadastrada duas vezes —
   * e a OS acabava no nome errado, com a moto errada aparecendo para escolher.
   * Agora a busca lista quem bateu e a escolha é um clique.
   */
  const lookupPlaca = normalizePlate(customerLookup);
  // Cadastro desativado some de onde se ESCOLHE — abrir OS, vender, escolher a
  // moto —, e continua inteiro na lista de cadastros e em tudo que já foi
  // feito. Ver src/removal.ts.
  const clientesAtivos = somenteAtivos(clients);
  const motosAtivas = somenteAtivos(motorcycles);
  const produtosAtivos = somenteAtivos(products);
  const clientesEncontrados = (lookupDigits.length >= 3 || lookupTexto.length >= 2)
    ? clientesAtivos
        .map((client) => {
          const motosDele = motosAtivas.filter((motorcycle) => motorcycle.ownerId === client.id);
          // A moto chega no portão e o balcão lê a placa, não pergunta o nome:
          // procurar pela placa precisa cair no dono dela, com a moto certa
          // já escolhida. Um cliente com quatro motos, sem isso, obriga a achar
          // a placa de novo na lista do bloco 2.
          const porPlaca = lookupPlaca.length >= 3
            ? motosDele.find((motorcycle) => normalizePlate(motorcycle.plate).includes(lookupPlaca))
            : undefined;
          const porTelefone = lookupDigits.length >= 3 && onlyDigits(client.phone).includes(lookupDigits);
          const porNome = lookupTexto.length >= 2 && client.name.toLowerCase().includes(lookupTexto);
          if (!porPlaca && !porTelefone && !porNome) return null;
          return { client, motoDaBusca: porPlaca ?? null, motos: motosDele };
        })
        .filter((achado): achado is { client: ClientRecord; motoDaBusca: MotorcycleRecord | null; motos: MotorcycleRecord[] } => achado !== null)
        // Quem bateu pela placa vem primeiro: é a busca mais específica das três.
        .sort((um, outro) => (Number(Boolean(outro.motoDaBusca)) - Number(Boolean(um.motoDaBusca)))
          || um.client.name.localeCompare(outro.client.name, "pt-BR"))
        .slice(0, 12)
    : [];
  // O cliente da OS é o que foi ESCOLHIDO na lista — digitar não escolhe.
  const osCustomer = !osNewCustomer && !osSkipCustomer ? selectedCustomer : null;
  const historicoDoCliente = clientHistory(osCustomer, orders, motorcycles);
  // Cliente sendo cadastrado agora ainda não tem moto nenhuma: a lista vazia é
  // o que faz o formulário da moto nova aparecer no lugar da escolha.
  // O bloco da moto só abre depois de escolhida a empresa parceira ou o
  // cliente — ou depois de a pessoa dizer que atende sem cadastrar.
  const blocoDaMotoLiberado = osOrigin === "partner"
    ? Boolean(selectedPartner)
    : Boolean(osCustomer) || osNewCustomer || osSkipCustomer;

  const customerMotorcycles = !osNewCustomer && !osSkipCustomer && selectedCustomer
    ? motosAtivas.filter((motorcycle) => motorcycle.ownerId === selectedCustomer.id)
    : [];
  const selectedMotorcycle = motorcycles.find((motorcycle) => motorcycle.id === selectedMotorcycleId);
  /**
   * As motos que aparecem para escolher no bloco 2.
   *
   * Cliente: as motos dele. Parceira: as motos que têm ELA como responsável —
   * a frota fica cadastrada sem dono individual, porque a oficina atende a moto
   * do aplicativo sem saber quem é o motoboy da vez. A busca existe porque
   * frota tem dezenas de motos.
   */
  // A busca compara a placa normalizada e varre o sistema inteiro, não só a
  // frota: a moto que a oficina já atendeu como cliente direto continua sendo a
  // mesma moto quando ela passa a rodar para a parceira. Ver src/fleet.ts.
  const buscaDaFrota = buscarMotos(motosAtivas, selectedPartner?.id ?? "", partnerBikeSearch);
  // O número ao lado do campo é o tamanho da frota, não o do resultado: "entre
  // as motos da Flash (0)" enquanto se digita faria parecer que a parceira não
  // tem moto nenhuma cadastrada.
  const totalDaFrota = motosAtivas.filter((moto) => estaNaFrota(moto, selectedPartner?.id ?? "")).length;
  const motosParaEscolher = osOrigin === "partner"
    ? [...buscaDaFrota.daFrota, ...buscaDaFrota.foraDaFrota]
    : customerMotorcycles;
  const motoEscolhidaEDeFora = osOrigin === "partner" && selectedMotorcycle
    ? !estaNaFrota(selectedMotorcycle, selectedPartner?.id ?? "") : false;
  const avisoDaMotoDeFora = osOrigin === "partner"
    ? avisoDeMotoDeFora(selectedMotorcycle, selectedPartner?.id ?? "", selectedPartner?.name ?? "parceira") : "";
  const selectedEmployee = users.find((user) => user.id === expenseEmployeeId) ?? users[0];
  const selectedMachine = activePaymentMachines.find((machine) => machine.id === selectedMachineId) ?? activePaymentMachines.find((machine) => machine.primary) ?? activePaymentMachines[0];
  const partsTotal = osItems.filter((item) => item.type === "Peça").reduce((sum, item) => sum + item.price, 0);
  const laborTotal = osItems.filter((item) => item.type === "Mão de obra").reduce((sum, item) => sum + item.price, 0);
  const partnerDiscount = osOrigin === "partner" ? laborTotal * ((selectedPartner?.laborDiscount ?? 0) / 100) : 0;
  const osTotal = partsTotal + laborTotal - partnerDiscount;
  const quickTotal = valorDigitado(quickServiceValue) + (quickProduct === "Sem produto" ? 0 : valorDigitado(quickPartValue) * quickQuantity);
  const expenseCost = valorDigitado(expenseAmount);
  const expenseCharged = valorDigitado(expenseSale);
  const expenseMargin = expenseCharged - expenseCost;
  const checkoutPartsTotal = checkoutItems.filter((item) => item.type === "Peça").reduce((sum, item) => sum + item.price, 0);
  const checkoutLaborTotal = checkoutItems.filter((item) => item.type === "Mão de obra").reduce((sum, item) => sum + item.price, 0);
  const checkoutRawTotal = checkoutPartsTotal + checkoutLaborTotal;
  // Numa OS de empresa parceira, o desconto combinado sai do total ANTES de
  // virar fatura. Mostrar o desconto na tela e cobrar o valor cheio — que era
  // o que acontecia — é pior do que não ter desconto nenhum: a empresa confere
  // a fatura contra o combinado e encontra diferença.
  const checkoutPartner = currentOrder && isPartnerBilled(currentOrder)
    ? partners.find((item) => item.id === currentOrder.partnerId) ?? null
    : null;
  const checkoutTotal = checkoutPartner
    ? partnerTotals(checkoutItems, checkoutPartner.laborDiscount ?? 0).total
    : checkoutRawTotal;
  const tradeCompensated = Math.min(Math.max(valorDigitado(tradeValue) || 0, 0), checkoutTotal);
  const tradeRemaining = Math.max(checkoutTotal - tradeCompensated, 0);
  const tradeCreditRemaining = Math.max((valorDigitado(tradeValue) || 0) - checkoutTotal, 0);
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
  const currentCashAccount = pick(cashAccounts, quickAccount);
  const currentAccountTarget = currentCashAccount;
  // Os filtros do catálogo e as categorias de gasto vinham escritos no JSX e
  // ignoravam o cadastro de categorias da própria oficina.
  // Mesmo padrão das formas de pagamento: sem categoria cadastrada, o filtro do
  // catálogo ficava com "Todos" e mais nada.
  const productCategoryNames = orDefault(
    categories.filter((item) => item.active !== false && item.group === "Produtos"),
    defaultProductCategories,
  ).map((item) => item.name);
  const expenseCategoryNames = categories.filter((item) => item.active !== false && item.group === "Despesas").map((item) => item.name);
  // "Peça comprada fora do estoque" e "Pagamento de funcionário" ficam fixas
  // porque disparam comportamento próprio no formulário (vínculo com a OS e
  // com o funcionário). As demais vêm do cadastro de categorias da oficina, com
  // a lista antiga como padrão enquanto nenhuma categoria de despesa existir.
  const behaviourExpenseCategories = ["Peça comprada fora do estoque", "Pagamento de funcionário"];
  const fallbackExpenseCategories = ["Comissões", "Compra para o estoque", "Fornecedor de peças", "Frete e motoboy", "Ferramentas e equipamentos", "Despesas fixas", "Taxas de cartão", "Outros gastos"];
  const revenueCategoryNames = categories.filter((item) => item.active !== false && item.group === "Receitas").map((item) => item.name);
  // O grupo "Receitas" é novo: enquanto a oficina não cadastrar o dela, ficam
  // estas como padrão, para o campo não abrir vazio.
  const fallbackRevenueCategories = ["Serviços de oficina", "Venda de peças", "Acerto com parceiro", "Outras receitas"];
  const accountCategoryOptions = dialog === "receivable"
    ? (revenueCategoryNames.length ? revenueCategoryNames : fallbackRevenueCategories)
    : (expenseCategoryNames.length ? expenseCategoryNames : ["Fornecedor de peças", "Despesa operacional", "Outros"]);
  const expenseCategoryOptions = [
    ...behaviourExpenseCategories,
    ...(expenseCategoryNames.length ? expenseCategoryNames : fallbackExpenseCategories).filter((name) => !behaviourExpenseCategories.includes(name)),
  ];
  const cartSubtotal = cart.reduce((sum, item) => sum + item.unit * item.quantity, 0);
  // O que o cliente paga já é com desconto. Antes o diálogo de pagamento
  // cobrava o subtotal cheio porque o desconto não existia em lugar nenhum.
  const cartTotal = totalAfterDiscount(cartSubtotal, discount);
  const dialogSummary = financeSummary(sales, orders, expenses, accounts, movements);
  // Caixa: a sessão aberta e o que o sistema espera encontrar na gaveta.
  const cashOpen = openSession(cashSessions);
  const cashSources = { sales, orders, expenses, accounts };
  const drawer = cashSummary(cashOpen, cashSources);
  const drawerMoves = drawerEntries(cashOpen, cashSources);
  const cashAmountValue = toAmount(cashAmount);
  const cashCountedValue = toAmount(cashCounted);
  // As "últimas atualizações" eram uma linha fixa dizendo que não havia nada.
  // Agora saem do que realmente aconteceu, do mais recente para o mais antigo.
  const recentActivity = [
    ...sales.map((sale) => ({ id: sale.id, at: sale.soldAt, date: sale.date, text: `${sale.id} · ${sale.origin} de ${formatBRL(sale.total)}` })),
    ...orders.filter((order) => order.closed).map((order) => ({ id: order.id, at: order.closedAtISO ?? "", date: order.closedAt ?? "", text: `${order.id} · OS encerrada de ${formatBRL(order.total ?? 0)}` })),
    ...movements.map((movement) => ({ id: movement.id, at: movement.at, date: movement.date, text: `${movement.id} · ${movement.kind === "entrada" ? "Entrada" : "Saída"} de ${formatBRL(movement.amount)} (${movement.category})` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  // Os motivos vêm das listas do sistema, então a oficina ajusta os seus em
  // Configurações → Listas do sistema sem mexer no código.
  const movementCategories = systemList(lists, movementKind === "entrada" ? "movementIncomeCategories" : "movementExpenseCategories");
  const movementAmountValue = toAmount(movementAmount);
  const movementIssue = manualMovementProblem(movementAmountValue, movementCategory, movementDescription);
  const cashProblem = cashAction === "Fechar caixa" ? "" : movementProblem(cashAction === "Sangria" ? "Sangria" : "Suprimento", cashAmountValue, drawer.expected);
  const cashGap = cashDifference(cashCountedValue, drawer.expected);
  const paymentGross = dialog === "orderCheckout" ? checkoutTotal : cartTotal;
  const paymentFeeRate = paymentMethod === "Débito" ? selectedMachine?.debitFee ?? 0 : paymentMethod === "Crédito" ? paymentInstallments === 1 ? selectedMachine?.credit1xFee ?? 0 : paymentInstallments <= 6 ? selectedMachine?.credit2to6Fee ?? 0 : selectedMachine?.credit7to12Fee ?? 0 : 0;
  const paymentFeeAmount = paymentGross * (paymentFeeRate / 100);

  // --- Pagamento dividido ---
  // A taxa da maquininha vale por parte: só o pedaço que foi no cartão paga.
  const feeRateOf = (method: string) => method === "Débito" ? selectedMachine?.debitFee ?? 0
    : method === "Crédito" ? (paymentInstallments === 1 ? selectedMachine?.credit1xFee ?? 0 : paymentInstallments <= 6 ? selectedMachine?.credit2to6Fee ?? 0 : selectedMachine?.credit7to12Fee ?? 0)
    : 0;
  const splitFirstValue = toAmount(splitFirstAmount);
  // O restante é calculado, não digitado: é assim que a divisão acontece no
  // balcão, e evita a soma não fechar por erro de digitação.
  const splitSecondValue = Math.max(0, Math.round((paymentGross - splitFirstValue) * 100) / 100);
  const splitParts = [
    { method: splitFirstMethod, amount: splitFirstValue, fee: splitFirstValue * (feeRateOf(splitFirstMethod) / 100), machineName: ["Débito", "Crédito"].includes(splitFirstMethod) ? selectedMachine?.name ?? "" : undefined },
    { method: splitSecondMethod, amount: splitSecondValue, fee: splitSecondValue * (feeRateOf(splitSecondMethod) / 100), machineName: ["Débito", "Crédito"].includes(splitSecondMethod) ? selectedMachine?.name ?? "" : undefined },
  ];
  const splitIssue = splitPayment ? splitProblem(paymentGross, splitParts) : "";
  // Formas efetivas da venda: as partes quando dividido, a única quando não.
  const effectivePayments = splitPayment ? splitParts.filter((part) => part.amount > 0) : [];
  const cashDue = splitPayment ? drawerTotal(splitParts) : (paymentMethod === "Dinheiro" ? paymentGross : 0);
  const changeDue = changeFor(cashDue, toAmount(cashReceived));
  const paymentCreditAmount = splitPayment ? creditTotal(splitParts) : (isCreditPayment(paymentMethod) ? paymentGross : 0);
  const orderStatusTone = statusTone(orderStatus);
  // Digitar só procura: quem escolhe o cliente é a pessoa, clicando no
  // resultado. Antes o próprio campo já selecionava o primeiro que batesse.
  const handleCustomerLookup = (value: string) => {
    // "TES1D23" tem dígitos, mas não é telefone: formatar como telefone
    // transformava a placa em "(12) 3" e a busca por placa nunca achava nada.
    // Quem tem letra é placa ou nome; só o que é puro número vira telefone.
    const temLetra = /\p{L}/u.test(value);
    setCustomerLookup(!temLetra && onlyDigits(value) ? formatPhone(value) : emMaiusculo(value));
    if (selectedCustomerId) {
      setSelectedCustomerId("");
      setSelectedMotorcycleId("");
      setOsPlate("");
      setNewVehicleMode(false);
      setVerHistorico(false);
    }
  };
  const escolherCliente = (client: ClientRecord, motoDaBusca?: MotorcycleRecord | null) => {
    setSelectedCustomerId(client.id);
    setOsNewCustomer(false);
    setOsSkipCustomer(false);
    setVerHistorico(false);
    setNewVehicleMode(false);
    // Achou pela placa? Já é essa a moto. Senão, cliente de uma moto só também
    // vem escolhida — que é o caso mais comum no balcão.
    const doDono = motorcycles.filter((motorcycle) => motorcycle.ownerId === client.id);
    const escolhida = motoDaBusca ?? (doDono.length === 1 ? doDono[0] : null);
    setSelectedMotorcycleId(escolhida?.id ?? "");
    setOsPlate(escolhida?.plate ?? "");
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
  /**
   * Passa a moto escolhida para a frota da parceira.
   *
   * Botão à parte, nunca automático ao escolher: a moto de um cliente pode
   * entrar numa OS da parceira sem deixar de ser dele — é o caso de quem levou
   * a própria moto e a parceira pagou o conserto. Mover para a frota é outra
   * coisa, e é o atendente quem sabe qual das duas está acontecendo.
   */
  const incluirNaFrota = async () => {
    if (!selectedMotorcycle || !selectedPartner) return;
    if (!canManageCustomers) return notify("Seu perfil não pode alterar o cadastro de motos.");
    try {
      await saveFirestoreDoc("motorcycles", selectedMotorcycle.id, {
        partnerId: selectedPartner.id,
        partnerName: selectedPartner.name,
      });
      notify(`${formatPlate(selectedMotorcycle.plate)} entrou na frota da ${selectedPartner.name}.`);
    } catch {
      notify("Não foi possível incluir a moto na frota.");
    }
  };
  const toggleMechanic = (id: string, target: "new" | "existing") => {
    const selected = target === "new" ? selectedMechanicIds : orderMechanicIds;
    const update = target === "new" ? setSelectedMechanicIds : setOrderMechanicIds;
    // "Permitir vários mecânicos na mesma OS" (Configurações → Oficina & OS).
    // Desligado, escolher um mecânico substitui o anterior em vez de somar.
    if (!allowMultipleMechanics) return update([id]);
    update(selected.includes(id) ? (selected.length > 1 ? selected.filter((currentId) => currentId !== id) : selected) : [...selected, id]);
  };
  const titles: Record<Exclude<DialogKind, null>, string> = {
    changePassword: "Definir uma nova senha",
    osChoice: "Que tipo de atendimento é?",
    os: "Abrir nova ordem de serviço",
    quick: "Lançar serviço rápido",
    product: "Adicionar produto",
    import: "Importar cadastro de estoque",
    nfe: "Importar nota do fornecedor",
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
    nfe: "Suba o XML da nota: o sistema confere o que já existe, compara o custo e dá a entrada.",
    payment: "Aceite uma ou mais formas de pagamento.",
    catalog: "Pesquise por nome, código de barras ou SKU.",
    client: "Use um cadastro existente ou crie um novo rapidamente.",
    motorcycle: "A moto sempre ficará vinculada ao proprietário real.",
    employee: "Dados pessoais, função, pagamento e acesso ao sistema.",
    supplier: "Contato, condições e categorias fornecidas.",
    purchase: "Entrada simples de produtos, sem rotina fiscal.",
    finance: "Dinheiro que entra ou sai sem ser venda nem conta agendada.",
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
    // Cadastrando um cliente novo, vale o nome digitado — mesmo que o telefone
    // por acaso caia em algum cadastro parecido.
    const customerName = (osNewCustomer ? newCustomerName : (osCustomer?.name ?? newCustomerName)).trim()
      || (typedIsPhone ? "" : customerLookup.trim());
    // OS de frota não tem cliente: quem responde é a empresa parceira.
    const daParceira = osOrigin === "partner" && Boolean(selectedPartner);
    // A moto entra sem dono identificado: é a placa que segura a OS até alguém
    // vir buscar. O nome fica pendente e é cobrado no encerramento.
    const semCliente = !daParceira && osSkipCustomer && !customerName;
    const plate = formatPlate(osPlate || selectedMotorcycle?.plate || "");
    // A moto nova sai do catálogo: marca + modelo + versão viram um nome só,
    // o mesmo texto que o cadastro completo grava.
    const bike = (selectedMotorcycle && !newVehicleMode
      ? [selectedMotorcycle.brand, selectedMotorcycle.model].filter(Boolean).join(" ")
      : [newVehicleBrand, newVehicleModel].filter(Boolean).join(" ")).trim();
    if (osOrigin === "partner" && !selectedPartner) throw new Error("Escolha a empresa parceira antes de abrir a ordem de serviço.");
    if (!customerName && !osSkipCustomer && !daParceira) throw new Error("Informe o nome do cliente antes de abrir a ordem de serviço.");
    if (daParceira && !plate) throw new Error("Escolha ou cadastre a moto da parceira antes de abrir a ordem de serviço.");
    if (semCliente && !plate) throw new Error("Sem o cliente, a placa é o que identifica esta OS. Informe a placa.");
    if (!bike && !plate) throw new Error("Informe a motocicleta ou a placa antes de abrir a ordem de serviço.");

    // Cliente e moto digitados na hora viram cadastro de verdade — senão a
    // próxima OS do mesmo cliente não o encontraria na busca. Só para quem tem
    // permissão de gerenciar clientes; sem ela a OS guarda apenas os textos.
    let clientId = osCustomer?.id ?? "";
    let motorcycleId = !newVehicleMode ? selectedMotorcycleId : "";
    if (canManageCustomers && !clientId && customerName && !semCliente && !daParceira) {
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
    // A moto é cadastrada mesmo sem cliente: numa OS aberta sem identificar o
    // dono, a placa é o que segura a ordem, e sem o cadastro a próxima entrada
    // da mesma moto não a encontraria. O dono é preenchido no encerramento.
    if (canManageCustomers && !motorcycleId && plate) {
      // A placa já identifica a moto de forma única, mesmo padrão do cadastro.
      motorcycleId = motorcycleIdFor(plate);
      await saveFirestoreDoc("motorcycles", motorcycleId, {
        ...(clientId ? { ownerId: clientId, ownerName: customerName } : {}),
        // Moto de frota fica sem dono individual: quem responde é a parceira,
        // e é por ela que esta moto é encontrada na próxima OS.
        ...(daParceira ? { partnerId: selectedPartner!.id, partnerName: selectedPartner!.name } : {}),
        plate,
        brand: newVehicleBrand,
        model: newVehicleModel.trim() || bike,
        year: newVehicleYear,
        color: newVehicleColor.trim(),
      });
      if (clientId) {
        await saveFirestoreDoc("clients", clientId, {
          motorcycleIds: [...(osCustomer?.motorcycleIds ?? []), motorcycleId],
        });
      }
    }

    // Com a trava desligada, a peça já sai do estoque na abertura; com ela
    // ligada, a OS nasce sem reservar nada e a baixa espera o serviço começar.
    const reservedOnCreate = shouldReserveStock("Recepção", deductStockOnlyWhenStarted, serviceOrderStatuses) ? partsOf(osItems) : [];
    const orderId = await createServiceOrder(osPrefix, nextOrderNumber, {
      customer: daParceira ? (customerName || selectedPartner!.name) : semCliente ? "Cliente não identificado" : customerName,
      ...(semCliente ? { customerPending: true } : {}),
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
      mileageChecked: osMileageChecked === "Sim",
      priority: currentPriority,
      fuelLevel: currentFuel,
      delivery: osDelivery ? osDelivery.split("-").reverse().join("/") : "",
      origin: osOrigin === "partner" ? `Encaminhado por ${selectedPartner?.name ?? "parceiro"}` : "Cliente direto",
      total: osTotal,
      deductedItems: [],
      // Quem paga fica gravado na OS: é o que faz o encerramento mandar a
      // conta para a fatura da parceira em vez de pedir o dinheiro na hora.
      payer: osOrigin === "partner" && osPayer === "partner" ? "partner" : "owner",
      ...(osOrigin === "partner" && selectedPartner ? { partnerId: selectedPartner.id, partnerName: selectedPartner.name } : {}),
      ...(clientId ? { clientId } : {}),
      ...(motorcycleId ? { motorcycleId } : {}),
    });
    if (reservedOnCreate.length) {
      // A OS nasce marcada como "nada baixado" e a reserva vai num lote só,
      // junto da marcação. Assim, se a baixa falhar, a OS fica coerente (sem
      // reserva e sem marca) em vez de dizer que baixou peça que continua na
      // prateleira.
      await saveOrderWithStock(orderId, { deductedItems: reservedOnCreate }, stockDeltas(reservedOnCreate, []));
    }
    return orderId;
  };

  const useAverageCost = settings?.useAverageCost === true;
  // "Baixar peça do estoque somente quando a OS for iniciada": durante recepção,
  // avaliação e aprovação a OS ainda é orçamento, e reservar peça de orçamento
  // some com o estoque de quem está vendendo no balcão.
  const deductStockOnlyWhenStarted = settings?.deductStockOnlyWhenUsed !== false;
  const partsOf = (items: ServiceOrderItem[] | undefined) => mergeParts((items ?? [])
    .filter((item) => item.type === "Peça" && item.productId)
    .map((item) => ({ productId: item.productId!, quantity: item.quantity ?? 1 })));
  const allowMultipleMechanics = settings?.allowMultipleMechanics !== false;
  // "Mostrar carga de trabalho": a contagem de OS ao lado de cada mecânico.
  const showWorkload = settings?.showWorkload !== false;
  const purchaseTotal = purchaseItems.reduce((total, item) => total + item.quantity * item.unitCost, 0);

  const addPurchaseItem = () => {
    const first = products[0];
    if (!first) return;
    setPurchaseItems((current) => [...current, { productId: first.id, quantity: 1, unitCost: parseBRL(first.cost) }]);
  };

  const changePurchaseItem = (index: number, patch: Partial<{ productId: string; quantity: number; unitCost: number }>) => {
    setPurchaseItems((current) => current.map((item, position) => {
      if (position !== index) return item;
      const next = { ...item, ...patch };
      // Ao trocar o produto, o custo sugerido passa a ser o da peça escolhida.
      if (patch.productId) {
        const chosen = products.find((product) => product.id === patch.productId);
        if (chosen) next.unitCost = parseBRL(chosen.cost);
      }
      return next;
    }));
  };

  const removePurchaseItem = (index: number) => {
    setPurchaseItems((current) => current.filter((_, position) => position !== index));
  };

  const printOrder = (order: OrderRecord) => {
    const names = activeMechanics.filter((mechanic) => (order.mechanicIds ?? []).includes(mechanic.id)).map((mechanic) => mechanic.name);
    printDocument(buildOrderDocument({ order, settings, mechanics: names.join(" + ") || order.mechanic }));
  };

  const sendOrderWhatsapp = (order: OrderRecord) => {
    // O telefone vem do cadastro do cliente; a OS guarda só o nome. Sem cliente
    // vinculado, o WhatsApp abre para escolher o contato na hora.
    const client = clients.find((item) => item.id === order.clientId)
      ?? clients.find((item) => item.name.trim().toLowerCase() === order.customer.trim().toLowerCase());
    openWhatsapp(whatsappUrl(client?.phone ?? "", buildOrderWhatsappMessage(order, settings)));
  };

  /**
   * "Nota a prazo" não põe dinheiro no caixa agora: vira conta a receber. Antes
   * o valor era apenas deduzido das vendas na hora de mostrar o total, e por
   * isso nunca saía da lista — não havia onde registrar que o cliente pagou.
   */
  const createReceivableFor = async (input: {
    person: string;
    personId?: string;
    description: string;
    amount: number;
    origin: string;
    sourceId: string;
    /** Vencimento próprio, em dd/mm/aaaa. A fatura da parceira usa o dia 1º do mês seguinte. */
    dueDate?: string;
  }) => {
    // Vence em 30 dias, o prazo usual de uma nota a prazo de oficina.
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const [id] = await saveAccounts("CR", highestSequence(accounts, "CR") + 1, [{
      kind: "receber",
      person: input.person || "Cliente",
      ...(input.personId ? { personId: input.personId } : {}),
      description: input.description,
      category: revenueCategoryNames[0] ?? "Serviços de oficina",
      amount: input.amount,
      dueDate: input.dueDate ?? due.toLocaleDateString("pt-BR"),
      settlements: [],
      origin: input.origin,
      sourceId: input.sourceId,
      installment: 1,
      installments: 1,
    }]) ?? [];
    return id;
  };

  const registerSale = async (input: {
    origin: "PDV" | "Serviço rápido";
    items: ServiceOrderItem[];
    subtotal?: number;
    discount?: number;
    total: number;
    stockUpdates: Array<{ productId: string; quantity: number }>;
    mechanicId?: string;
    mechanicName?: string;
    method: string;
    /** Partes do pagamento, quando dividido. Vazio = pagamento único. */
    payments?: Array<{ method: string; amount: number; fee?: number; machineName?: string }>;
    account?: string;
  }) => {
    const usesMachine = ["Débito", "Crédito"].includes(input.method);
    const installments = input.method === "Crédito" ? paymentInstallments : 1;
    const rate = !usesMachine ? 0
      : input.method === "Débito" ? selectedMachine?.debitFee ?? 0
      : installments === 1 ? selectedMachine?.credit1xFee ?? 0
      : installments <= 6 ? selectedMachine?.credit2to6Fee ?? 0
      : selectedMachine?.credit7to12Fee ?? 0;
    const dividido = (input.payments?.length ?? 0) > 1;
    const fee = dividido
      ? (input.payments ?? []).reduce((total, part) => total + (part.fee ?? 0), 0)
      : input.total * (rate / 100);
    // Numa venda dividida, o que virou dinheiro agora é tudo menos a parte
    // fiada — e é sobre esse valor que a taxa de maquininha incide.
    const recebido = dividido ? settledTotal(input.payments ?? []) : input.total;
    const saleId = `VEN-${String(highestSequence(sales, "VEN") + 1).padStart(4, "0")}`;
    await recordSale(saleId, {
      origin: input.origin,
      items: input.items,
      // Só grava o desconto quando houve um: o campo ausente já quer dizer
      // "venda sem desconto" e não polui os registros antigos.
      ...(input.discount ? { subtotal: input.subtotal ?? input.total + input.discount, discount: input.discount } : {}),
      total: input.total,
      paymentMethod: input.method,
      ...(dividido ? { payments: input.payments, fee, net: recebido - fee } : {}),
      ...(!dividido && usesMachine ? {
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
    const aPrazo = dividido ? creditTotal(input.payments ?? []) : (isCreditPayment(input.method) ? input.total : 0);
    if (aPrazo > 0) {
      // A venda já está gravada neste ponto. Se a conta a receber falhar — o
      // operador do PDV pode não ter permissão no financeiro — a venda não pode
      // ser desfeita, então o erro precisa aparecer nomeando o que faltou, em
      // vez de derrubar o fluxo inteiro como se nada tivesse sido salvo.
      try {
        await createReceivableFor({
          person: "Consumidor final",
          description: dividido ? `${input.origin} ${saleId} · parte a prazo` : `${input.origin} ${saleId}`,
          amount: aPrazo,
          origin: "Venda",
          sourceId: saleId,
        });
      } catch (error) {
        notify(`Venda ${saleId} registrada, mas a conta a receber não foi criada: ${error instanceof Error ? error.message : "erro desconhecido"}. Lance a cobrança em Contas a receber.`);
      }
    }
    printDocument(buildSaleDocument({
      id: saleId,
      origin: input.origin,
      items: input.items,
      ...(input.discount ? { subtotal: input.subtotal ?? input.total + input.discount, discount: input.discount } : {}),
      total: input.total,
      paymentMethod: input.method,
      ...(usesMachine ? { machineName: selectedMachine?.name ?? "" } : {}),
      ...(input.mechanicName ? { mechanicName: input.mechanicName } : {}),
      date: new Date().toLocaleDateString("pt-BR"),
      soldAt: new Date().toISOString(),
    }, settings));
    return saleId;
  };

  const saveOrderChanges = async () => {
    if (!currentOrder) throw new Error("Nenhuma ordem de serviço selecionada.");
    // Mudar a situação pode disparar a baixa (ao iniciar o serviço) ou a
    // devolução (se a OS voltar para orçamento).
    const reserved = (currentOrder.deductedItems ?? []) as ReservedPart[];
    const target = shouldReserveStock(orderStatus, deductStockOnlyWhenStarted, serviceOrderStatuses) ? partsOf(currentOrder.items) : [];
    const deltas = stockDeltas(target, reserved);
    await saveOrderWithStock(currentOrder.id, {
      status: orderStatus,
      tone: statusTone(orderStatus),
      mechanicIds: orderMechanicIds,
      mechanic: activeMechanics.find((mechanic) => mechanic.id === orderMechanicIds[0])?.name ?? currentOrder.mechanic,
      deductedItems: target,
    }, deltas);
  };

  /**
   * Lê a planilha escolhida e monta a prévia.
   *
   * Nada é gravado aqui: a pessoa vê quantas peças entram, quantas são
   * atualizadas e quais linhas têm problema antes de confirmar. Estoque errado
   * só aparece na hora de vender, e aí já é tarde.
   */
  const readImportFile = (file: File | null | undefined) => {
    if (!file) return;
    setDialogError("");
    setImportPlan(null);
    setImportFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setImportFileName("");
      return setDialogError("A planilha passa de 5 MB. Exporte só a aba do estoque.");
    }
    setImportReading(true);
    const reader = new FileReader();
    reader.onerror = () => { setImportReading(false); setDialogError("Não foi possível ler o arquivo escolhido."); };
    reader.onload = () => {
      setImportReading(false);
      // Lido como bytes, e não como texto, para dar conta da planilha salva em
      // ANSI pelo Excel em português (ver decodeSheetBytes).
      const sheet = parseStockSheet(decodeSheetBytes(reader.result as ArrayBuffer));
      setImportPlan(planStockImport(sheet.rows, products, sheet.issues));
    };
    reader.readAsArrayBuffer(file);
  };

  const lerNotaDoFornecedor = (file: File | null | undefined) => {
    if (!file) return;
    setDialogError("");
    setNfeNota(null);
    setNfeLinhas([]);
    setNfeFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setNfeFileName("");
      return setDialogError("O arquivo passa de 5 MB. O XML de uma nota costuma ter poucos KB — confira se é o arquivo certo.");
    }
    setNfeReading(true);
    const reader = new FileReader();
    reader.onerror = () => { setNfeReading(false); setDialogError("Não foi possível ler o arquivo escolhido."); };
    reader.onload = () => {
      setNfeReading(false);
      try {
        const nota = lerNfe(String(reader.result ?? ""));
        if (!nota.itens.length) throw new Error("A nota não tem nenhum item.");
        const conferidos = conferirNota(nota, products.map((produto) => ({
          id: produto.id,
          code: produto.code,
          name: produto.name,
          barcode: produto.barcode,
          partNumber: produto.partNumber,
          cost: parseBRL(produto.cost),
          stock: produto.stock,
        })));
        setNfeNota(nota);
        // Item já cadastrado entra marcado; item novo começa marcado para
        // cadastrar, porque é o que a oficina quer em 9 de 10 notas — e dá
        // para desmarcar o que não quiser.
        setNfeLinhas(conferidos.map((linha) => ({ ...linha, fatorTexto: String(linha.fator), incluir: true, cadastrar: !linha.produto })));
      } catch (erro) {
        setNfeFileName("");
        setDialogError(erro instanceof Error ? erro.message : "Não foi possível ler a nota.");
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const mexerNaLinha = (numero: number, mudanca: Partial<{ fatorTexto: string; incluir: boolean; cadastrar: boolean }>) => {
    setNfeLinhas((atuais) => atuais.map((linha) => {
      if (linha.item.numero !== numero) return linha;
      const proxima = { ...linha, ...mudanca };
      if (mudanca.fatorTexto !== undefined) {
        const fator = Number(mudanca.fatorTexto);
        proxima.fator = Number.isFinite(fator) ? fator : 0;
        proxima.entra = quantidadeQueEntra(linha.item.quantidade, proxima.fator);
        proxima.custoNovo = custoUnitario(linha.item.valorUnitario, proxima.fator);
        proxima.variacao = proxima.custoAnterior > 0
          ? Math.round(((proxima.custoNovo - proxima.custoAnterior) / proxima.custoAnterior) * 10000) / 100
          : 0;
      }
      return proxima;
    }));
  };

  const submit = async () => {
    if (saving) return;
    setDialogError("");

    // O relatório não grava nada; dizer "registro atualizado com sucesso" era
    // avisar de uma gravação que nunca aconteceu.
    if (dialog === "record") return close();

    if (dialog === "finance") {
      if (movementIssue) return setDialogError(movementIssue);
      setSaving(true);
      try {
        // A data escolhida pode ser passada; a hora é a de agora, que é o que
        // liga a movimentação à sessão de caixa aberta.
        const chosen = movementDate ? new Date(`${movementDate}T${new Date().toTimeString().slice(0, 8)}`) : new Date();
        const id = await recordMovement({
          kind: movementKind,
          amount: movementAmountValue,
          category: movementCategory,
          method: movementMethod,
          description: movementDescription.trim(),
          date: chosen.toLocaleDateString("pt-BR"),
          at: chosen.toISOString(),
          operatorUid: currentUser?.uid ?? "",
          operatorName: currentUser?.displayName || currentUser?.email || "",
        });
        setMovementAmount(""); setMovementCategory(""); setMovementDescription("");
        return finish(`${movementKind === "entrada" ? "Entrada" : "Saída"} ${id} de ${formatBRL(movementAmountValue)} registrada.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível registrar a movimentação.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "cash") {
      const operator = { uid: currentUser?.uid, name: currentUser?.displayName || currentUser?.email || "" };
      setSaving(true);
      try {
        if (!cashOpen) {
          const now = new Date();
          const id = await openCashSession({
            openedAt: now.toISOString(),
            openedDate: now.toLocaleDateString("pt-BR"),
            openedByUid: operator.uid ?? "",
            openedByName: operator.name,
            openingAmount: cashAmountValue,
            openingNotes: cashReason.trim(),
            movements: [],
          });
          setCashAmount(""); setCashReason("");
          return finish(`Caixa ${id} aberto com ${formatBRL(cashAmountValue)} de fundo de troco.`);
        }

        if (cashAction === "Fechar caixa") {
          const now = new Date();
          // Grava o esperado junto do contado: a diferença precisa continuar
          // fazendo sentido meses depois, mesmo que algum lançamento antigo
          // seja corrigido e o recálculo dê outro número.
          await closeCashSession(cashOpen.id, {
            closedAt: now.toISOString(),
            closedDate: now.toLocaleDateString("pt-BR"),
            closedByUid: operator.uid ?? "",
            closedByName: operator.name,
            countedAmount: cashCountedValue,
            expectedAmount: drawer.expected,
            difference: cashGap,
            closingNotes: cashReason.trim(),
          });
          const label = differenceLabel(cashGap);
          setCashCounted(""); setCashReason(""); setCashAction("Suprimento");
          return finish(label === "Confere"
            ? `Caixa ${cashOpen.id} fechado e conferido: ${formatBRL(cashCountedValue)} na gaveta.`
            : `Caixa ${cashOpen.id} fechado com ${label.toLowerCase()} de ${formatBRL(Math.abs(cashGap))}.`);
        }

        const kind = cashAction === "Sangria" ? "Sangria" : "Suprimento";
        if (cashProblem) return setDialogError(cashProblem);
        if (!cashReason.trim()) return setDialogError("Diga o motivo. Sem ele, ninguém entende a movimentação depois.");
        await addCashMovement(cashOpen.id, buildMovement(kind, cashAmountValue, cashReason, operator));
        setCashAmount(""); setCashReason("");
        return finish(`${kind} de ${formatBRL(cashAmountValue)} lançado no caixa ${cashOpen.id}.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível movimentar o caixa.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "import") {
      if (!importPlan) return setDialogError("Escolha a planilha preenchida antes de importar.");
      const total = importPlan.create.length + importPlan.update.length;
      if (!total) return setDialogError("Nenhuma linha desta planilha pode ser importada. Corrija os problemas apontados e tente de novo.");
      setSaving(true);
      try {
        const result = await saveImportedProducts(
          importPlan.create.map((row) => newProductPayload(row, settings)),
          importPlan.update.map(({ row, product }) => ({ id: product.id, data: updatedProductPayload(row, product) })),
        );
        const created = result?.created.length ?? 0;
        const updated = result?.updated.length ?? 0;
        setImportPlan(null);
        setImportFileName("");
        return finish(`Importação concluída: ${created} peça(s) cadastrada(s) e ${updated} atualizada(s).`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível importar a planilha.");
      } finally {
        setSaving(false);
      }
    }

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
      // OS de empresa parceira não pede forma de pagamento: já nasce faturada.
      setPaymentMethod(currentOrder && isPartnerBilled(currentOrder) ? PARTNER_PAYMENT_METHOD : "PIX");
      setSplitPayment(false);
      // O id da OS precisa ir junto. Sem ele, `openDialog` limpa o registro
      // selecionado e `currentOrder` cai no `?? orders[0]`: com mais de uma OS
      // na lista, o recebimento era gravado na PRIMEIRA — a errada era
      // encerrada, com os itens e o total desta, e a certa continuava aberta.
      return changeDialog("orderCheckout", currentOrder?.id);
    }
    if (dialog === "orderCheckout") {
      // Rede de segurança para o mesmo defeito: sem o id, `currentOrder` seria
      // a primeira OS da lista. Melhor recusar e dizer o que houve do que
      // encerrar a ordem errada em silêncio.
      if (!selectedRecordId || currentOrder?.id !== selectedRecordId) {
        return setDialogError("Não foi possível identificar a ordem de serviço. Feche esta janela e abra a OS pela lista de novo.");
      }
      // OS aberta sem cliente identificado: os dados são cobrados AQUI, antes de
      // receber. Deixar passar é ficar com serviço feito e ninguém para cobrar.
      const faltamDados = currentOrder?.customerPending === true;
      if (faltamDados && !checkoutCustomerName.trim()) {
        return setDialogError("Esta OS foi aberta sem cliente identificado. Informe o nome antes de encerrar.");
      }
      if (faltamDados && onlyDigits(checkoutCustomerPhone).length < 10) {
        return setDialogError("Informe o WhatsApp do cliente antes de encerrar — é por ele que a oficina cobra e avisa.");
      }
      if (splitIssue) return setDialogError(splitIssue);
      setSaving(true);
      try {
        // O encerramento grava o que foi realmente executado e marca a OS como
        // concluída, para ela sair da fila de motos prontas aguardando retirada.
        if (currentOrder) {
          // O cliente que faltava vira cadastro de verdade, e a moto passa a
          // ser dele: é o que faz a próxima OS desta moto já achar o dono.
          let clienteDaOs = currentOrder.clientId ?? "";
          if (faltamDados && canManageCustomers) {
            clienteDaOs = `CLI-${String(highestSequence(clients, "CLI") + 1).padStart(3, "0")}`;
            await saveFirestoreDoc("clients", clienteDaOs, {
              name: checkoutCustomerName.trim(),
              phone: formatPhone(checkoutCustomerPhone),
              detail: currentOrder.bike || "Cliente identificado no encerramento da OS",
              meta: "",
              condition: "Pagamento normal",
              motorcycleIds: currentOrder.motorcycleId ? [currentOrder.motorcycleId] : [],
              active: true,
            });
            if (currentOrder.motorcycleId) {
              await saveFirestoreDoc("motorcycles", currentOrder.motorcycleId, {
                ownerId: clienteDaOs,
                ownerName: checkoutCustomerName.trim(),
              });
            }
          }
          // No encerramento os itens revisados são os que de fato foram usados,
          // então o estoque é acertado pela diferença: peça retirada da OS na
          // conferência volta para a prateleira.
          const reserved = (currentOrder.deductedItems ?? []) as ReservedPart[];
          const target = partsOf(checkoutItems);
          await saveOrderWithStock(currentOrder.id, {
            items: checkoutItems,
            total: checkoutTotal,
            status: "Entrega",
            tone: statusTone("Entrega"),
            paymentMethod: splitPayment ? (effectivePayments[0]?.method ?? paymentMethod) : paymentMethod,
            ...(splitPayment ? { payments: effectivePayments } : {}),
            closed: true,
            closedAt: new Date().toLocaleDateString("pt-BR"),
            // Só a data não basta para o caixa: ele precisa saber a hora para
            // saber a qual sessão esta OS pertence.
            closedAtISO: new Date().toISOString(),
            deductedItems: target,
            ...(faltamDados ? {
              customer: checkoutCustomerName.trim(),
              customerPending: false,
              ...(clienteDaOs ? { clientId: clienteDaOs } : {}),
            } : {}),
          }, stockDeltas(target, reserved));
          // Imprime já com o que foi conferido no checkout, e não com os itens
          // antigos que ainda estão no `currentOrder` desta renderização.
          // Só o pedaço fiado vira cobrança: numa OS dividida entre PIX e
          // nota a prazo, cobrar o total de novo seria cobrar duas vezes.
          const aPrazoOS = splitPayment ? creditTotal(effectivePayments) : (isCreditPayment(paymentMethod) ? checkoutTotal : 0);
          if (aPrazoOS > 0) {
            // Mesma situação da venda: a OS já foi encerrada e não dá para
            // voltar atrás, então a falha é reportada em vez de engolida.
            //
            // A OS de empresa parceira cai aqui pelo mesmo caminho da nota a
            // prazo, com duas diferenças: a cobrança vai no nome da EMPRESA, e
            // não do motoboy que trouxe a moto, e vence no dia 1º do mês
            // seguinte — a fatura mensal. A baixa do estoque já aconteceu
            // acima, como em qualquer OS.
            const faturada = isPartnerBilled(currentOrder);
            try {
              await createReceivableFor({
                person: faturada ? (currentOrder.partnerName || "Empresa parceira") : (faltamDados ? checkoutCustomerName.trim() : currentOrder.customer),
                personId: faturada ? currentOrder.partnerId : (clienteDaOs || currentOrder.clientId),
                description: faturada
                  ? billingDescription(currentOrder.id, currentOrder.bike)
                  : `Ordem de serviço ${currentOrder.id} · ${currentOrder.bike}${splitPayment ? " · parte a prazo" : ""}`,
                amount: aPrazoOS,
                origin: faturada ? "Fatura de parceiro" : "Ordem de serviço",
                sourceId: currentOrder.id,
                ...(faturada ? { dueDate: nextBillingDate() } : {}),
              });
            } catch (error) {
              notify(`${currentOrder.id} encerrada, mas a conta a receber não foi criada: ${error instanceof Error ? error.message : "erro desconhecido"}. Lance a cobrança em Contas a receber.`);
            }
          }
          printOrder({ ...currentOrder, items: checkoutItems, total: checkoutTotal, status: "Entrega", paymentMethod });
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
    if (dialog === "receivable" || dialog === "payable") {
      const kind = dialog === "receivable" ? "receber" as const : "pagar" as const;
      const total = valorDigitado(accountAmount) || 0;
      if (!accountDescriptionText.trim()) return setDialogError("Informe a descrição do lançamento.");
      if (total <= 0) return setDialogError("Informe um valor maior que zero.");
      setSaving(true);
      try {
        const prefix = kind === "receber" ? "CR" : "CP";
        const groupId = `${prefix}-G${Date.now()}`;
        const parcelas = splitInstallments(total, accountInstallments, accountDueDate.split("-").reverse().join("/"));
        await saveAccounts(prefix, highestSequence(accounts, prefix) + 1, parcelas.map((parcela) => ({
          kind,
          person: accountPerson || "Cadastro avulso",
          description: accountDescriptionText.trim(),
          category: accountCategory || accountCategoryOptions[0] || "",
          amount: parcela.amount,
          dueDate: parcela.dueDate,
          settlements: [],
          notes: accountNotes,
          origin: "Manual",
          installment: parcela.installment,
          installments: parcelas.length,
          ...(parcelas.length > 1 ? { groupId } : {}),
        })));
        setAccountDescriptionText("");
        setAccountAmount("");
        setAccountNotes("");
        setAccountInstallments(1);
        return finish(parcelas.length > 1
          ? `${parcelas.length} parcelas lançadas em contas a ${kind}.`
          : `Conta a ${kind} lançada com sucesso.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível lançar a conta.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "settleReceivable" || dialog === "settlePayable") {
      if (!currentAccount) return setDialogError("Nenhuma conta selecionada.");
      const amount = settleFull ? currentAccountOpen : valorDigitado(settleAmount) || 0;
      if (amount <= 0) return setDialogError("Informe o valor da baixa.");
      if (amount > currentAccountOpen + 0.005) return setDialogError(`O valor passa do saldo em aberto (${formatBRL(currentAccountOpen)}).`);
      setSaving(true);
      try {
        await settleAccount(currentAccount.id, {
          date: settleDate ? settleDate.split("-").reverse().join("/") : new Date().toLocaleDateString("pt-BR"),
          settledAt: new Date().toISOString(),
          amount,
          method: settleMethod,
          account: currentAccountTarget,
          operatorUid: currentUser?.uid ?? "",
          operatorName: currentUser?.displayName ?? "",
        });
        setSettleAmount("");
        setSettleFull(true);
        const restante = currentAccountOpen - amount;
        return finish(restante > 0.005
          ? `Baixa de ${formatBRL(amount)} registrada. Restam ${formatBRL(restante)}.`
          : `${currentAccount.id} quitada com ${formatBRL(amount)}.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível registrar a baixa.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "purchase") {
      if (!purchaseItems.length) return setDialogError("Adicione ao menos um produto à entrada.");
      const semQuantidade = purchaseItems.find((item) => item.quantity <= 0);
      if (semQuantidade) return setDialogError("Informe a quantidade de cada produto.");
      setSaving(true);
      try {
        const supplier = activeSuppliers.find((item) => item.id === purchaseSupplierId) ?? activeSuppliers[0];
        const entryId = `ENT-${String(highestSequence(stockEntries, "ENT") + 1).padStart(4, "0")}`;
        await recordStockEntry(entryId, {
          supplierId: supplier?.id ?? "",
          supplierName: supplier?.name ?? "",
          date: purchaseDate ? purchaseDate.split("-").reverse().join("/") : new Date().toLocaleDateString("pt-BR"),
          entryAt: new Date().toISOString(),
          payment: purchasePayment,
          costMode: useAverageCost ? "Custo médio" : "Último preço",
          total: purchaseTotal,
          items: purchaseItems.map((item) => ({
            productId: item.productId,
            name: products.find((product) => product.id === item.productId)?.name ?? "",
            quantity: item.quantity,
            unitCost: item.unitCost,
            total: item.quantity * item.unitCost,
          })),
          operatorUid: currentUser?.uid ?? "",
          operatorName: currentUser?.displayName ?? "",
        }, purchaseItems, useAverageCost);
        setPurchaseItems([]);
        return finish(`Entrada ${entryId} registrada: ${purchaseItems.length} produto(s) e ${formatBRL(purchaseTotal)} em estoque.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível registrar a entrada.");
      } finally {
        setSaving(false);
      }
    }

    if (dialog === "nfe") {
      const escolhidas = nfeLinhas.filter((linha) => linha.incluir);
      if (!escolhidas.length) return setDialogError("Marque ao menos um item da nota para dar entrada.");
      const fatorRuim = escolhidas.find((linha) => fatorProblema(linha.fator));
      if (fatorRuim) return setDialogError(`Item ${fatorRuim.item.numero} (${fatorRuim.item.descricao}): ${fatorProblema(fatorRuim.fator)}`);
      // Item novo que não vai ser cadastrado não tem onde entrar: dar entrada
      // dele seria somar estoque em produto nenhum.
      const semCadastro = escolhidas.find((linha) => !linha.produto && !linha.cadastrar);
      if (semCadastro) return setDialogError(`Item ${semCadastro.item.numero} (${semCadastro.item.descricao}) ainda não está no estoque. Marque "cadastrar" ou tire o item da entrada.`);
      setSaving(true);
      try {
        // Os produtos novos nascem antes da entrada, e o id de cada um volta
        // para a linha: sem isso a baixa tentaria somar num produto que ainda
        // não existe.
        const jaCadastrados = [...products];
        const comProduto = [] as Array<{ productId: string; nome: string; quantidade: number; custo: number }>;
        for (const linha of escolhidas) {
          let productId = linha.produto?.id ?? "";
          if (!productId) {
            const codigo = nextSequentialId(jaCadastrados, "PRD");
            const novo: ProductRecord = {
              id: codigo,
              code: codigo,
              name: emMaiusculo(linha.item.descricao),
              barcode: linha.item.gtin,
              partNumber: emMaiusculo(linha.item.codigoFornecedor),
              category: categories.find((item) => item.group === "Produtos" && item.active !== false)?.name ?? "Peças",
              unit: settings?.defaultUnit ?? "UN",
              cost: formatBRL(linha.custoNovo),
              markup: settings?.suggestedMarkup ?? 45,
              price: formatBRL(priceFromMarkup(linha.custoNovo, settings?.suggestedMarkup ?? 45)),
              // O saldo entra pela baixa, e não aqui: contar duas vezes é o
              // jeito mais fácil de o estoque nascer errado.
              stock: 0,
              minimum: settings?.defaultMinStock ?? 2,
              status: "Normal",
              active: true,
              supplierName: nfeNota?.fornecedor.nome ?? "",
            };
            await saveFirestoreDoc("products", codigo, withoutUndefined(novo as unknown as Record<string, unknown>));
            jaCadastrados.push(novo);
            productId = codigo;
          }
          comProduto.push({ productId, nome: emMaiusculo(linha.item.descricao), quantidade: linha.entra, custo: linha.custoNovo });
        }
        const entryId = `ENT-${String(highestSequence(stockEntries, "ENT") + 1).padStart(4, "0")}`;
        const totalDaEntrada = comProduto.reduce((soma, item) => soma + item.quantidade * item.custo, 0);
        await recordStockEntry(entryId, {
          supplierId: "",
          supplierName: nfeNota?.fornecedor.nome ?? "",
          date: nfeNota?.emissao || new Date().toLocaleDateString("pt-BR"),
          entryAt: new Date().toISOString(),
          payment: `NF-e ${nfeNota?.numero ?? ""}`,
          costMode: useAverageCost ? "Custo médio" : "Último preço",
          total: totalDaEntrada,
          items: comProduto.map((item) => ({ productId: item.productId, name: item.nome, quantity: item.quantidade, unitCost: item.custo, total: item.quantidade * item.custo })),
          operatorUid: currentUser?.uid ?? "",
          operatorName: currentUser?.displayName ?? "",
        }, comProduto.map((item) => ({ productId: item.productId, quantity: item.quantidade, unitCost: item.custo })), useAverageCost);
        const novos = escolhidas.filter((linha) => !linha.produto).length;
        setNfeNota(null);
        setNfeLinhas([]);
        setNfeFileName("");
        return finish(`Nota ${nfeNota?.numero ?? ""} lançada: ${escolhidas.length} item(ns), ${novos} peça(s) nova(s) e ${formatBRL(totalDaEntrada)} em estoque.`);
      } catch (error) {
        return setDialogError(error instanceof Error ? error.message : "Não foi possível lançar a nota.");
      } finally {
        setSaving(false);
      }
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
        if (discountProblem(cartSubtotal, discount)) return setDialogError(discountProblem(cartSubtotal, discount));
        // Divisão que não fecha ao centavo vira falta no caixa depois.
        if (splitIssue) return setDialogError(splitIssue);
        const saleId = await registerSale({
          origin: "PDV",
          method: splitPayment ? (effectivePayments[0]?.method ?? paymentMethod) : paymentMethod,
          payments: splitPayment ? effectivePayments : undefined,
          subtotal: cartSubtotal,
          discount,
          total: cartTotal,
          items: cart.map((item) => ({
            id: item.id,
            // A peça vendida no balcão passa a gravar `productId`, igual ao item
            // de OS. Sem ele, a venda existia mas ninguém conseguia responder
            // "esta peça já foi vendida?" — e a exclusão de cadastro apagaria
            // uma peça que já tinha saído pela porta.
            productId: item.id,
            type: "Peça" as const,
            name: item.name,
            price: item.unit * item.quantity,
            quantity: item.quantity,
            cost: item.cost * item.quantity,
          })),
          stockUpdates: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        });
        setCart([]);
        setDiscount(0);
        setSplitPayment(false); setSplitFirstAmount(""); setCashReceived("");
        const comoPagou = splitPayment ? ` em ${paymentLabel(effectivePayments)}` : "";
        return finish(discount > 0
          ? `Venda ${saleId} de ${formatBRL(cartTotal)}${comoPagou} registrada com ${formatBRL(discount)} de desconto e estoque baixado.`
          : `Venda ${saleId} de ${formatBRL(cartTotal)}${comoPagou} registrada e estoque baixado.`);
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
          account: currentCashAccount,
          total: quickTotal,
          mechanicId: mechanic?.id,
          mechanicName: mechanic?.name,
          items: [
            { id: `SRV-${Date.now()}`, type: "Mão de obra" as const, name: quickService, price: valorDigitado(quickServiceValue) },
            ...(part ? [{
              id: part.id,
              type: "Peça" as const,
              name: part.name,
              price: valorDigitado(quickPartValue) * quickQuantity,
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
        // Agendado: vale a forma prevista escolhida, em vez de "A definir"
        // fixo — quem lança já sabe se vai pagar em boleto ou PIX.
        method: expensePaymentMode === "Caixa" ? "Dinheiro" : expensePaymentMode === "Banco" ? "Banco Inter" : expensePlannedMethod,
        supplierId: expenseSupplierId || undefined,
        supplierName: suppliers.find((supplier) => supplier.id === expenseSupplierId)?.name,
        // A hora do pagamento é o que prende o gasto à sessão de caixa certa:
        // só a data não distingue dois caixas abertos no mesmo dia.
        paidAt: expensePaymentMode === "Pagar depois" ? undefined : new Date().toISOString(),
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
      nfe: "Nota lida e conferida com o cadastro.",
      payment: "Pagamento recebido e comprovante gerado.",
      catalog: "Produto selecionado e adicionado à venda.",
      client: "Cliente selecionado para o atendimento.",
      motorcycle: "Motocicleta cadastrada e vinculada ao proprietário.",
      employee: "Funcionário salvo e acesso atualizado.",
      supplier: "Fornecedor salvo com sucesso.",
      purchase: "Entrada registrada e estoque atualizado.",
      finance: "Movimentação registrada.",
      // Nunca usada: o relatório fecha sem gravar (ver o early return acima).
      record: "",
      order: "Alterações da ordem de serviço salvas.",
      orderCheckout: "Ordem de serviço finalizada e recebimento confirmado.",
      settings: "Configurações salvas para a oficina.",
      cash: "Movimentação do caixa concluída.",
      expense: "Gasto registrado com sucesso.",
      receivable: "Conta a receber adicionada com sucesso.",
      payable: "Conta a pagar adicionada com sucesso.",
      settleReceivable: "Recebimento confirmado e saldo atualizado.",
      settlePayable: "Pagamento confirmado e conta atualizada.",
    };
    finish(messages[dialog]);
  };
  const primaryLabels: Partial<Record<Exclude<DialogKind, null>, string>> = {
    quick: "Finalizar e receber",
    // Depois da prévia o botão diz o que vai acontecer, e não "conferir" —
    // a conferência já é a tela que está na frente da pessoa.
    import: importPlan ? `Importar ${importPlan.create.length + importPlan.update.length} peça(s)` : "Escolher planilha",
    nfe: nfeLinhas.length ? `Dar entrada de ${nfeLinhas.filter((linha) => linha.incluir).length} item(ns)` : "Escolher o XML",
    payment: "Confirmar recebimento",
    catalog: "Adicionar selecionado",
    client: showQuickCustomer ? "Salvar cliente" : "Usar selecionado",
    motorcycle: "Cadastrar moto",
    employee: "Salvar funcionário",
    supplier: "Salvar fornecedor",
    purchase: "Confirmar entrada",
    finance: movementKind === "entrada" ? "Registrar entrada" : "Registrar saída",
    order: "Salvar alterações",
    orderCheckout: "Receber e finalizar OS",
    settings: "Salvar configurações",
    // O botão diz o que vai acontecer: com o caixa fechado a única ação é abrir.
    cash: !cashOpen ? "Abrir caixa" : cashAction === "Fechar caixa" ? "Fechar e conferir" : `Confirmar ${cashAction.toLowerCase()}`,
    expense: expensePaymentMode === "Pagar depois" ? "Agendar conta a pagar" : "Registrar gasto",
    receivable: "Criar conta a receber",
    payable: "Criar conta a pagar",
    settleReceivable: "Confirmar recebimento",
    settlePayable: "Confirmar pagamento",
    // O relatório só mostra números; não há nada a "concluir".
    record: "Fechar",
  };

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={`dialog ${["os", "order", "orderCheckout", "payment", "catalog", "settings", "expense"].includes(dialog) ? "dialog-wide" : ""} ${dialog === "os" ? "dialog-os" : ""} ${dialog === "orderCheckout" ? "dialog-checkout" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className="dialog-header">
          <div><span>{dialog === "os" ? "Nova ordem de serviço" : dialog === "osChoice" ? "Novo atendimento" : ["order", "orderCheckout", "payment", "cash", "expense", "settleReceivable", "settlePayable", "record"].includes(dialog) ? "Operação" : "Cadastro e configuração"}</span><h2 id="dialog-title">{titles[dialog]}</h2><p>{subtitles[dialog]}</p></div>
          <button aria-label="Fechar" onClick={close}>×</button>
        </header>

        {dialog === "osChoice" ? (
          <div className="dialog-body attendance-choice">
            <button onClick={() => changeDialog("quick")}><span className="attendance-icon fast"><Icon name="clock"/></span><div><b>É um serviço rápido</b><strong>Atendimento expresso</strong><small>Troca de óleo, lâmpada, regulagem ou ajuste concluído na hora. Cliente e moto são opcionais.</small><em>Ir para Serviço Rápido <Icon name="arrow" size={16}/></em></div></button>
            <button onClick={() => { setStep(1); setOsOrigin("direct"); setOsItems([]); setPieceSearch(""); setLaborDescription(""); setLaborValue(""); setSelectedMechanicIds(activeMechanics.slice(0, 1).map((m) => m.id)); setCustomerLookup(""); setSelectedCustomerId(""); setSelectedMotorcycleId(""); setOsPlate(""); setNewVehicleMode(false); setOsMileage(""); setOsProblem(""); setOsPriority("Normal"); setOsFuel(""); setOsDelivery(""); setNewCustomerName(""); setNewVehicleModel(""); setNewVehicleYear(""); setNewVehicleColor(""); setOsNewCustomer(false); setOsSkipCustomer(false); setNewVehicleBrand("Honda"); setNewVehicleCatalogModel(""); setNewVehicleVersion(""); setOsPayer("owner"); setDialogError(""); changeDialog("os"); }}><span className="attendance-icon full"><Icon name="wrench"/></span><div><b>É uma OS completa</b><strong>Moto ficará na oficina</strong><small>Entrada com cliente, proprietário real, origem, recepção, peças, mão de obra e acompanhamento.</small><em>Abrir OS completa <Icon name="arrow" size={16}/></em></div></button>
          </div>
        ) : null}

        {dialog === "os" ? (
          <>
            {/*
              Uma tela só.
              O passo a passo pedia quatro telas para abrir uma OS que o balcão
              preenche em trinta segundos: cliente e moto, avançar, recepção,
              avançar, itens, avançar, conferir, confirmar. Três dos quatro
              cliques eram só para chegar no campo seguinte, e a etapa de
              revisão repetia o que já estava preenchido logo acima.

              Agora é uma tela dividida em duas colunas: à esquerda quem e qual
              moto, e a recepção; à direita as peças e a mão de obra. O total
              fica fixo no rodapé, sempre visível enquanto se monta a OS.
            */}
            <div className="dialog-body os-single">
              <div className="os-single-columns">
                <div className="os-single-column">
                <div className="form-section">
                  {/*
                    Esta etapa tinha três caminhos sobrepostos na mesma tela:
                    uma busca por cliente, outra por placa, um formulário
                    embutido que aparecia sozinho quando a busca não achava
                    nada, e ainda os botões de cadastro completo. Quem abria a
                    OS não sabia por onde começar nem em qual dos campos
                    digitar.

                    Agora são dois blocos, na ordem em que a oficina trabalha:
                    primeiro o cliente, depois a moto dele. Cada um tem um
                    estado só de cada vez — procurando, encontrado, ou
                    cadastrando — e o de cadastrar aparece só quando a pessoa
                    pede.
                  */}
                  <div className="os-step-blocks">
                    <section className={`os-block ${osOrigin === "partner" ? (selectedPartner ? "done" : "") : osSkipCustomer || osCustomer || (osNewCustomer && newCustomerName.trim()) ? "done" : ""}`}>
                      <header className="os-block-head">
                        <span className="os-block-number">1</span>
                        <div><strong>Quem responde por esta OS</strong><small>Um cliente da casa ou uma empresa parceira. A moto vem depois.</small></div>
                        {osOrigin === "partner" && selectedPartner ? <span className="os-block-badge ok">Parceira</span>
                          : osSkipCustomer ? <span className="os-block-badge pendente">Pendente</span>
                          : osCustomer ? <span className="os-block-badge ok">Encontrado</span> : null}
                      </header>

                      {/*
                        Frota é o caso mais comum depois do cliente de balcão: o
                        Gonzaga deixa as motos dele cadastradas aqui, sem dono
                        individual, e toda OS dele começa escolhendo a empresa e
                        a moto. Antes isso ficava numa etapa separada, depois
                        desta — e a etapa do cliente pedia um cliente que não
                        existia.
                      */}
                      <div className="os-party-switch">
                        <button className={osOrigin === "direct" ? "selected" : ""} onClick={() => { setOsOrigin("direct"); setOsPayer("owner"); setSelectedMotorcycleId(""); setOsPlate(""); }}>
                          <Icon name="users" size={16}/><span>Cliente</span>
                        </button>
                        <button className={osOrigin === "partner" ? "selected" : ""} onClick={() => { setOsOrigin("partner"); setOsPayer("partner"); setOsNewCustomer(false); setOsSkipCustomer(false); setSelectedMotorcycleId(""); setOsPlate(""); if (!activePartners.some((item) => item.id === selectedPartnerId)) setSelectedPartnerId(activePartners[0]?.id ?? ""); }} disabled={activePartners.length === 0}>
                          <Icon name="wallet" size={16}/><span>Empresa parceira</span>
                        </button>
                      </div>

                      {osOrigin === "partner" ? (
                        <div className="os-partner-pick">
                          <label className="field">
                            <span>Empresa parceira <b className="req">*</b></span>
                            <select value={selectedPartnerId} onChange={(event) => setSelectedPartnerId(event.target.value)}>
                              {activePartners.length ? activePartners.map((parceira) => <option value={parceira.id} key={parceira.id}>{parceira.name} · {parceira.laborDiscount}% mão de obra</option>) : <option value="">Nenhuma empresa parceira cadastrada</option>}
                            </select>
                          </label>
                          <label className="field">
                            <span>Quem paga</span>
                            <select value={osPayer} onChange={(event) => setOsPayer(event.target.value as "owner" | "partner")}>
                              <option value="partner">{selectedPartner?.name ?? "A parceira"} · fatura mensal</option>
                              <option value="owner">Quem retirar a moto paga no ato</option>
                            </select>
                          </label>
                          <div className="info-strip"><Icon name="check" size={17}/><span>{osPayer === "partner"
                            ? <>Vai para a fatura com vencimento em <b>{nextBillingDate()}</b>. Desconto de {selectedPartner?.laborDiscount ?? 0}% só na mão de obra; peça mantém o preço. A baixa do estoque acontece normalmente na entrega.</>
                            : <>A parceira encaminhou a moto, mas o pagamento é no ato, na entrega.</>}</span></div>
                        </div>
                      ) : osSkipCustomer ? (
                        <div className="os-pending-card">
                          <span><Icon name="alert" size={18}/></span>
                          <div>
                            <strong>Sem cliente identificado</strong>
                            <small>A OS abre com a placa e o serviço anda normalmente. O nome e o WhatsApp serão pedidos na hora de encerrar e receber.</small>
                          </div>
                          <button className="os-picked-change" onClick={() => setOsSkipCustomer(false)}>Identificar</button>
                        </div>
                      ) : osCustomer ? (
                        <>
                          <div className="os-picked">
                            <span className="registry-avatar">{osCustomer.name.split(" ").map((parte) => parte[0]).slice(0, 2).join("")}</span>
                            <div>
                              <strong>{osCustomer.name}</strong>
                              <small>{osCustomer.phone || "Sem telefone"} · {customerMotorcycles.length} moto{customerMotorcycles.length === 1 ? "" : "s"} cadastrada{customerMotorcycles.length === 1 ? "" : "s"}{historicoDoCliente.visits ? ` · ${historicoDoCliente.visits} atendimento${historicoDoCliente.visits === 1 ? "" : "s"}` : ""}</small>
                            </div>
                            {/*
                              Fechado até alguém pedir: quem abre OS o dia
                              inteiro não quer rolar dez atendimentos antigos
                              antes de digitar a placa. Mas com a moto no
                              portão a pergunta "o que já foi feito nela?" é
                              constante, e a resposta estava só no caderno.
                            */}
                            <button className="os-picked-change" onClick={() => setVerHistorico((atual) => !atual)}>{verHistorico ? "Ocultar histórico" : "Ver histórico"}</button>
                            <button className="os-picked-change" onClick={() => { setCustomerLookup(""); setSelectedCustomerId(""); setSelectedMotorcycleId(""); setOsPlate(""); setNewVehicleMode(false); setVerHistorico(false); }}>Trocar</button>
                          </div>
                          {verHistorico ? <HistoryPanel historico={historicoDoCliente} vazio="Primeira vez deste cliente na oficina." /> : null}
                        </>
                      ) : osNewCustomer ? (
                        <div className="os-inline-form">
                          <label className="field"><span>Nome completo <b className="req">*</b></span><input value={newCustomerName} onChange={(event) => setNewCustomerName(emMaiusculo(event.target.value))} placeholder="Nome do cliente" autoFocus/></label>
                          <label className="field"><span>WhatsApp</span><input value={customerLookup} onChange={(event) => setCustomerLookup(formatPhone(event.target.value))} placeholder="(34) 99999-9999"/></label>
                          <div className="os-inline-actions">
                            <button className="ghost-button" onClick={() => { setOsNewCustomer(false); setNewCustomerName(""); setCustomerLookup(""); }}>Voltar para a busca</button>
                            {canManageCustomers ? <button className="outline-button" onClick={() => setCadastroNaOs("cliente")}><Icon name="users" size={15}/>Cadastro completo</button> : null}
                          </div>
                          <small className="os-inline-hint">O cadastro completo tem CPF, endereço e crediário. Aqui bastam nome e WhatsApp para tocar a OS.</small>
                        </div>
                      ) : (
                        <div className="os-search">
                          <label className="mini-search"><Icon name="search" size={17}/><input value={customerLookup} onChange={(event) => handleCustomerLookup(event.target.value)} placeholder="Placa, WhatsApp ou nome do cliente"/></label>
                          {/*
                            A lista de quem bateu com a busca. Mostrar telefone e
                            quantas motos tem é o que deixa escolher entre dois
                            homônimos sem abrir o cadastro de cada um.
                          */}
                          {clientesEncontrados.length ? (
                            <>
                              <div className="os-search-results">
                                {clientesEncontrados.map(({ client, motoDaBusca, motos }) => (
                                  <button key={client.id} onClick={() => escolherCliente(client, motoDaBusca)}>
                                    <span className="registry-avatar">{client.name.split(" ").map((parte) => parte[0]).slice(0, 2).join("")}</span>
                                    <div>
                                      <strong>{client.name}</strong>
                                      <small>{client.phone || "Sem telefone"}{motos.length ? ` · ${motos.map((motorcycle) => formatPlate(motorcycle.plate)).slice(0, 3).join(", ")}` : " · sem moto cadastrada"}</small>
                                    </div>
                                    {motoDaBusca ? <span className="os-search-hit">{formatPlate(motoDaBusca.plate)}</span> : null}
                                    <Icon name="arrow" size={16}/>
                                  </button>
                                ))}
                              </div>
                              <small className="os-search-count">{clientesEncontrados.length === 1 ? "1 cliente encontrado" : `${clientesEncontrados.length} clientes encontrados`}. Clique em quem é o dono desta OS.</small>
                            </>
                          ) : customerLookup.trim().length >= 2 ? (
                            <div className="os-search-empty">
                              <span>Nenhum cliente com "{customerLookup.trim()}".</span>
                              <button className="primary-button" onClick={() => { setOsNewCustomer(true); setOsSkipCustomer(false); setNewCustomerName(onlyDigits(customerLookup) ? "" : customerLookup.trim()); if (onlyDigits(customerLookup)) setCustomerLookup(formatPhone(customerLookup)); else setCustomerLookup(""); }}><Icon name="plus" size={15}/>Cadastrar cliente</button>
                            </div>
                          ) : (
                            <div className="os-search-hint"><Icon name="users" size={17}/><span>Busque pela <b>placa</b>, telefone ou nome — pela placa a moto já vem escolhida.</span></div>
                          )}
                          <div className="os-search-actions">
                            <button className="outline-button" onClick={() => { setOsNewCustomer(true); setOsSkipCustomer(false); }}><Icon name="plus" size={15}/>Cadastrar cliente</button>
                            <button className="ghost-button" onClick={() => { setOsSkipCustomer(true); setOsNewCustomer(false); setCustomerLookup(""); setNewCustomerName(""); setSelectedCustomerId(""); }}>Atender sem cadastrar agora</button>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className={`os-block ${(selectedMotorcycle && !newVehicleMode) || (newVehicleMode && osPlate.trim()) ? "done" : ""} ${!blocoDaMotoLiberado ? "waiting" : ""}`}>
                      <header className="os-block-head">
                        <span className="os-block-number">2</span>
                        <div><strong>Motocicleta</strong><small>{motosParaEscolher.length && !newVehicleMode ? "Escolha a moto que está entrando." : "Placa, marca, modelo e versão."}</small></div>
                        {selectedMotorcycle && !newVehicleMode ? <span className="os-block-badge ok">{motorcycleLabel(selectedMotorcycle)}</span> : null}
                      </header>

                      {!blocoDaMotoLiberado ? (
                        <div className="os-search-hint"><Icon name="bike" size={17}/><span>{osOrigin === "partner" ? "Escolha a empresa parceira acima primeiro." : "Escolha o cliente acima primeiro, ou siga sem cadastrar. A moto vem depois."}</span></div>
                      ) : (
                        <>
                          {/* Frota tem dezenas de motos: sem busca, escolher vira procurar. */}
                          {osOrigin === "partner" && !newVehicleMode ? (
                            <label className="field field-full os-partner-bike-search">
                              <span>Procurar entre as motos {selectedPartner ? `da ${selectedPartner.name}` : "da parceira"} ({totalDaFrota})</span>
                              <input value={partnerBikeSearch} onChange={(event) => setPartnerBikeSearch(event.target.value)} placeholder="Placa, marca ou modelo"/>
                              <small className="field-help">A busca também acha moto que já está no sistema em nome de um cliente. Pode digitar a placa sem o hífen.</small>
                            </label>
                          ) : null}

                          {osOrigin === "partner" && !newVehicleMode ? (
                            <>
                              {/* Os dois grupos ficam separados de propósito: escolher a moto de
                                  um cliente numa OS da parceira é legítimo, mas quem atende
                                  precisa ver que ela não é da frota antes de salvar. */}
                              {buscaDaFrota.daFrota.length ? (
                                <>
                                  <div className="os-list-label"><b>Frota {selectedPartner ? `da ${selectedPartner.name}` : "da parceira"}</b><span>{buscaDaFrota.daFrota.length}</span></div>
                                  <div className="vehicle-choice-list">
                                    {buscaDaFrota.daFrota.slice(0, 24).map((motorcycle) => (
                                      <button className={selectedMotorcycleId === motorcycle.id ? "selected" : ""} key={motorcycle.id} onClick={() => selectMotorcycle(motorcycle.id)}>
                                        <span className="catalog-code">{(motorcycle.model || "MT").slice(0, 2).toUpperCase()}</span>
                                        <div><strong>{[motorcycle.brand, motorcycle.model].filter(Boolean).join(" ")}</strong><small>{formatPlate(motorcycle.plate)} · {motorcycle.year || "ano não informado"}</small></div>
                                        {selectedMotorcycleId === motorcycle.id ? <i>✓</i> : null}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : null}

                              {buscaDaFrota.foraDaFrota.length ? (
                                <>
                                  <div className="os-list-label fora"><b>Já no sistema, fora desta frota</b><span>{buscaDaFrota.foraDaFrota.length}</span></div>
                                  <div className="vehicle-choice-list">
                                    {buscaDaFrota.foraDaFrota.slice(0, 12).map((motorcycle) => (
                                      <button className={selectedMotorcycleId === motorcycle.id ? "selected" : ""} key={motorcycle.id} onClick={() => selectMotorcycle(motorcycle.id)}>
                                        <span className="catalog-code">{(motorcycle.model || "MT").slice(0, 2).toUpperCase()}</span>
                                        <div><strong>{[motorcycle.brand, motorcycle.model].filter(Boolean).join(" ")}</strong><small>{formatPlate(motorcycle.plate)} · {motorcycle.ownerName || motorcycle.partnerName || "sem dono cadastrado"}</small></div>
                                        {selectedMotorcycleId === motorcycle.id ? <i>✓</i> : null}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : null}

                              {avisoDaMotoDeFora ? (
                                <div className="os-outside-fleet">
                                  <Icon name="alert" size={17}/>
                                  <span>{avisoDaMotoDeFora} A OS abre normalmente com a {selectedPartner?.name ?? "parceira"} pagando.</span>
                                  {canManageCustomers && motoEscolhidaEDeFora ? <button className="outline-button" onClick={() => void incluirNaFrota()}>Incluir na frota</button> : null}
                                </div>
                              ) : null}

                              <div className="vehicle-choice-list">
                                <button className="new-vehicle-choice" onClick={() => { setNewVehicleMode(true); setSelectedMotorcycleId(""); setOsPlate(""); }}>
                                  <span className="catalog-code">+</span>
                                  <div><strong>Outra moto</strong><small>Cadastrar uma moto nova</small></div>
                                </button>
                              </div>

                              {motosParaEscolher.length === 0 ? (
                                <div className="os-search-empty">
                                  <span>{partnerBikeSearch.trim() ? `Nenhuma moto com "${partnerBikeSearch.trim()}", nem na frota nem no resto do sistema.` : `${selectedPartner?.name ?? "Esta parceira"} ainda não tem moto na frota. Procure pela placa: se a moto já estiver no sistema, ela aparece aqui.`}</span>
                                </div>
                              ) : null}
                            </>
                          ) : null}

                          {osOrigin !== "partner" && motosParaEscolher.length > 0 && !newVehicleMode ? (
                            <div className="vehicle-choice-list">
                              {motosParaEscolher.slice(0, 24).map((motorcycle) => (
                                <button className={selectedMotorcycleId === motorcycle.id ? "selected" : ""} key={motorcycle.id} onClick={() => selectMotorcycle(motorcycle.id)}>
                                  <span className="catalog-code">{(motorcycle.model || "MT").slice(0, 2).toUpperCase()}</span>
                                  <div><strong>{[motorcycle.brand, motorcycle.model].filter(Boolean).join(" ")}</strong><small>{motorcycle.plate} · {motorcycle.year || "ano não informado"}</small></div>
                                  {selectedMotorcycleId === motorcycle.id ? <i>✓</i> : null}
                                </button>
                              ))}
                              <button className="new-vehicle-choice" onClick={() => { setNewVehicleMode(true); setSelectedMotorcycleId(""); setOsPlate(""); }}>
                                <span className="catalog-code">+</span>
                                <div><strong>Outra moto</strong><small>Cadastrar uma moto nova</small></div>
                              </button>
                            </div>
                          ) : null}

                          {(osOrigin !== "partner" && motosParaEscolher.length === 0) || newVehicleMode ? (
                            <div className="os-inline-form vehicle">
                              <label className="field"><span>Placa <b className="req">*</b></span><input value={osPlate} onChange={(event) => handleOsPlate(event.target.value)} placeholder="ABC-1234 ou ABC-1D23" maxLength={8}/><small className="field-help">{platePattern(osPlate)}</small></label>
                              <label className="field"><span>Marca</span>
                                <select value={newVehicleBrand} onChange={(event) => { setNewVehicleBrand(event.target.value); setNewVehicleCatalogModel(""); setNewVehicleVersion(""); setNewVehicleModel(""); }}>
                                  {systemList(lists, "motorcycleBrands").map((marca) => <option key={marca}>{marca}</option>)}
                                </select>
                              </label>
                              <label className="field"><span>Modelo</span>
                                {modelsOf(newVehicleBrand).length ? (
                                  <select value={newVehicleCatalogModel} onChange={(event) => { setNewVehicleCatalogModel(event.target.value); setNewVehicleVersion(""); setNewVehicleModel(fullModelName(event.target.value, "")); }}>
                                    <option value="">Escolha o modelo</option>
                                    {modelsOf(newVehicleBrand).map((modelo) => <option key={modelo} value={modelo}>{modelo}</option>)}
                                  </select>
                                ) : (
                                  <input value={newVehicleModel} onChange={(event) => setNewVehicleModel(emMaiusculo(event.target.value))} placeholder="Ex.: CG 160 Fan"/>
                                )}
                              </label>
                              <label className="field"><span>Versão</span>
                                {versionsOf(newVehicleBrand, newVehicleCatalogModel).length ? (
                                  <select value={newVehicleVersion} onChange={(event) => { setNewVehicleVersion(event.target.value); setNewVehicleModel(fullModelName(newVehicleCatalogModel, event.target.value)); }}>
                                    <option value="">Sem versão específica</option>
                                    {versionsOf(newVehicleBrand, newVehicleCatalogModel).map((versao) => <option key={versao} value={versao}>{versao}</option>)}
                                  </select>
                                ) : (
                                  <input value={newVehicleVersion} onChange={(event) => { const versao = emMaiusculo(event.target.value); setNewVehicleVersion(versao); setNewVehicleModel(fullModelName(newVehicleCatalogModel || newVehicleModel, versao)); }} placeholder="Ex.: ESDI" disabled={!newVehicleCatalogModel && modelsOf(newVehicleBrand).length > 0}/>
                                )}
                              </label>
                              <label className="field"><span>Ano / modelo</span><input value={newVehicleYear} onChange={(event) => setNewVehicleYear(emMaiusculo(event.target.value))} placeholder="2024 / 2025"/></label>
                              <label className="field"><span>Cor</span><input value={newVehicleColor} onChange={(event) => setNewVehicleColor(emMaiusculo(event.target.value))} placeholder="Ex.: Vermelha"/></label>
                              <div className="os-inline-actions">
                                {motosParaEscolher.length > 0 || osOrigin === "partner" ? <button className="ghost-button" onClick={() => { setNewVehicleMode(false); setOsPlate(""); }}>Voltar para a lista</button> : <span className="os-inline-hint">{newVehicleModel.trim() ? `Fica gravado como: ${[newVehicleBrand, newVehicleModel].filter(Boolean).join(" ")}` : "Marca → modelo → versão."}</span>}
                                {canManageCustomers ? <button className="outline-button" onClick={() => setCadastroNaOs("moto")}><Icon name="bike" size={15}/>Cadastro completo</button> : null}
                              </div>
                              {osOrigin === "partner" ? <small className="os-inline-hint">A moto fica no nome da {selectedPartner?.name ?? "parceira"}, sem dono individual — é assim que a frota é atendida.</small> : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </section>
                  </div>
                </div>
                <div className="form-section">
                  <div className="form-intro"><span className="form-icon"><Icon name="wrench"/></span><div><h3>Dados da recepção</h3><p>Registre a reclamação e escolha um ou mais mecânicos responsáveis.</p></div></div>
                  <div className="form-grid">
                    <label className="field"><span>Quilometragem</span><input value={osMileage} onChange={(event) => setOsMileage(event.target.value)} placeholder="Ex.: 38.420 km"/></label>
                    <label className="field"><span>Nível de combustível</span><select value={currentFuel} onChange={(event) => setOsFuel(event.target.value)}>{fuelLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
                    <label className="field field-full"><span>Problema relatado</span><textarea value={osProblem} onChange={(event) => setOsProblem(event.target.value)} placeholder="Descreva o problema relatado ou serviço solicitado"/></label>
                    <label className="field"><span>Prioridade</span><select value={currentPriority} onChange={(event) => setOsPriority(event.target.value)}>{orderPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                    <label className="field"><span>Previsão de entrega</span><input type="date" value={osDelivery} onChange={(event) => setOsDelivery(event.target.value)}/>{settings?.defaultDeliveryDays ? <small className="field-help">Prazo padrão da oficina: {settings.defaultDeliveryDays}</small> : null}</label>
                    <label className="field"><span>Odômetro conferido?</span><select value={osMileageChecked} onChange={(event) => setOsMileageChecked(event.target.value)}><option>Sim</option><option>Não</option></select></label>
                  </div>
                  <div className="mechanic-assignment">
                    <div><strong>Mecânicos responsáveis</strong><small>Todos os selecionados poderão atualizar a situação desta OS.</small></div>
                    {activeMechanics.length > 0 ? (
                      <div className="mechanic-picker">
                        {activeMechanics.map((mechanic) => (
                          <button className={selectedMechanicIds.includes(mechanic.id) ? "selected" : ""} key={mechanic.id} onClick={() => toggleMechanic(mechanic.id, "new")}>
                            <span className="mechanic-avatar">{mechanic.name[0]}</span>
                            <div><strong>{mechanic.name}</strong><small>{mechanic.position}{showWorkload ? ` · ${mechanic.currentOrders || 0} OS` : ""}</small></div>
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
                </div>
                <div className="os-single-column">
                <div className="form-section">
                  <div className="form-intro"><span className="form-icon"><Icon name="box"/></span><div><h3>Peças e mão de obra</h3><p>Peças usam o preço fixo do cadastro. A mão de obra é informada manualmente.</p></div></div>
                  <div className="os-items-builder">
                    <section className="os-catalog-panel"><div className="os-builder-title"><div><strong>Adicionar peças</strong><small>Preço de venda bloqueado pelo cadastro</small></div><span>{produtosAtivos.filter((product) => product.stock > 0).length} disponíveis</span></div><label className="mini-search"><Icon name="search" size={16}/><input value={pieceSearch} onChange={(event) => setPieceSearch(event.target.value)} placeholder="Buscar peça ou código"/></label><div className="os-piece-list">{produtosAtivos.filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(pieceSearch.toLowerCase())).map((product) => { const added = osItems.some((item) => item.id === product.code); return <button className={added ? "added" : ""} key={product.code} disabled={product.stock === 0} onClick={() => setOsItems((current) => added ? current : [...current, { id: product.code, productId: product.id, type: "Peça", name: product.name, price: parseBRL(product.price), cost: parseBRL(product.cost) }])}><span className="catalog-code">{product.code.slice(-2)}</span><div><strong>{product.name}</strong><small>{product.code} · {product.stock} em estoque</small></div><b>{product.price}</b><i>{product.stock === 0 ? "Sem estoque" : added ? "Adicionada" : "+"}</i></button>; })}</div></section>
                    <section className="os-labor-panel"><div className="os-builder-title"><div><strong>Adicionar mão de obra</strong><small>Descrição e valor digitados para esta OS</small></div></div><div className="form-grid"><label className="field field-full"><span>Descrição</span><input value={laborDescription} onChange={(event) => setLaborDescription(emMaiusculo(event.target.value))} placeholder="Ex.: Troca do kit relação"/></label><label className="field"><span>Valor da mão de obra</span><MoneyField value={laborValue} onChange={setLaborValue} placeholder="0,00"/></label><button className="primary-button labor-add-button" onClick={() => { if (!laborDescription.trim()) return setDialogError("Descreva a mão de obra antes de adicionar."); if (!(valorDigitado(laborValue) > 0)) return setDialogError("Informe o valor da mão de obra."); setDialogError(""); setOsItems((current) => [...current, { id: `LAB-${Date.now()}`, type: "Mão de obra", name: laborDescription.trim(), price: valorDigitado(laborValue) }]); setLaborDescription(""); setLaborValue(""); }}><Icon name="plus" size={16}/>Adicionar mão de obra</button></div><div className="labor-rule"><Icon name="check" size={17}/><span>O valor vale somente para esta OS e não altera o cadastro de serviços.</span></div></section>
                  </div>
                  <div className="selected-os-items"><div className="os-builder-title"><div><strong>Itens incluídos</strong><small>{osItems.length ? `${osItems.length} item${osItems.length === 1 ? "" : "s"} nesta OS` : "Nenhum item adicionado ainda"}</small></div></div>{osItems.length ? osItems.map((item) => <div className="selected-os-item" key={item.id}><span className={`item-type ${item.type === "Peça" ? "part" : "labor"}`}>{item.type}</span><div><strong>{item.name}</strong><small>{item.type === "Peça" ? "Preço fixo do cadastro" : "Valor manual desta OS"}</small></div><b>{formatBRL(item.price)}</b><button aria-label={`Remover ${item.name}`} onClick={() => setOsItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}>×</button></div>) : <div className="empty-os-items"><Icon name="box"/><span>Adicione as peças e a mão de obra que já souber. Você poderá completar depois.</span></div>}<div className="os-items-total"><span>Peças <b>{formatBRL(partsTotal)}</b></span><span>Mão de obra <b>{formatBRL(laborTotal)}</b></span>{partnerDiscount > 0 ? <span className="discount">Desconto parceiro <b>− {formatBRL(partnerDiscount)}</b></span> : null}<strong>Total inicial {formatBRL(osTotal)}</strong></div></div>
                </div>
                </div>
              </div>
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
              <label className="field"><span>Valor do serviço</span><MoneyField value={quickServiceValue} onChange={setQuickServiceValue} placeholder="0,00"/></label>
              <label className="field"><span>Mecânico</span><select value={activeMechanics.some((mechanic) => mechanic.id === selectedQuickMechanicId) ? selectedQuickMechanicId : activeMechanics[0]?.id ?? ""} onChange={(event) => setSelectedQuickMechanicId(event.target.value)}>{activeMechanics.map((mechanic) => <option value={mechanic.id} key={mechanic.id}>{mechanic.name} · {mechanic.currentOrders} OS</option>)}</select></label>
              <label className="field field-full"><span>Produto ou peça utilizada</span><select value={quickProduct} onChange={(event) => setQuickProduct(event.target.value)}><option value="Sem produto">Sem produto</option>{products.map((p) => <option value={p.name} key={p.id}>{p.name}</option>)}</select></label>
              {quickProduct !== "Sem produto" ? <><label className="field"><span>Quantidade</span><NumberField min={1} fallback={1} value={quickQuantity} onChange={setQuickQuantity}/></label><label className="field"><span>Preço da peça</span><MoneyField value={quickPartValue} onChange={setQuickPartValue} placeholder="0,00"/></label></> : null}
              <label className="field"><span>Cliente</span><input placeholder="Nome ou telefone"/></label>
              <label className="field"><span>Moto / placa</span><input placeholder="Ex.: CG 160 · ABC-1234"/></label>
              <label className="field"><span>Pagamento</span><select value={quickPayment} onChange={(event) => setQuickPayment(event.target.value)}>{activePaymentMethods.filter((method) => method.name !== "Faturamento parceiro").map((method) => <option key={method.id}>{method.name}</option>)}</select></label>
              <label className="field"><span>Conta de entrada</span><select value={currentCashAccount} onChange={(event) => setQuickAccount(event.target.value)}>{cashAccounts.map((account) => <option key={account}>{account}</option>)}{activePaymentMachines.map((machine) => <option key={machine.id}>{machine.name}</option>)}</select></label>
            </div>
            <div className="quick-service-total"><div><span>{quickService}</span><small>{quickProduct === "Sem produto" ? "Somente mão de obra" : `${quickQuantity}x ${quickProduct} · ${quickPayment}`}</small></div><strong>{formatBRL(quickTotal)}</strong></div>
            <div className="info-strip"><Icon name="check" size={18}/><span>Ao finalizar, o produto será baixado do estoque, o recebimento entra no caixa e um cupom não fiscal fica pronto para impressão.</span></div>
          </div>
        ) : null}

        {dialog === "nfe" ? (
          <div className="dialog-body form-section">
            {/*
              Cadastrar peça a peça depois de cada compra é o que ninguém faz:
              a nota chega com trinta itens e o estoque do sistema fica meses
              atrás do estoque da prateleira. O XML já traz tudo — inclusive o
              custo REAL pago — e vem junto com a compra, de graça.
            */}
            <div className="upload-zone">
              <span className="upload-icon"><Icon name="file"/></span>
              <strong>{nfeFileName || "Selecione o XML da nota do fornecedor"}</strong>
              <p>{nfeReading ? "Lendo a nota…" : "É o arquivo .xml que o fornecedor manda por e-mail junto com a compra."}</p>
              <label className="outline-button large file-picker">{nfeNota ? "Trocar arquivo" : "Escolher arquivo"}<input type="file" accept=".xml,text/xml,application/xml" onChange={(event) => { lerNotaDoFornecedor(event.target.files?.[0]); event.target.value = ""; }}/></label>
            </div>

            {nfeNota ? (
              <>
                <div className="nfe-head">
                  <div><span>Fornecedor</span><strong>{nfeNota.fornecedor.nome || "Não informado"}</strong></div>
                  <div><span>Nota</span><strong>{nfeNota.numero}{nfeNota.serie ? ` · série ${nfeNota.serie}` : ""}</strong></div>
                  <div><span>Emissão</span><strong>{nfeNota.emissao || "—"}</strong></div>
                  <div><span>Total da nota</span><strong>{formatBRL(nfeNota.total)}</strong></div>
                </div>
                {(() => {
                  const resumo = resumoDaConferencia(nfeLinhas);
                  return (
                    <div className="module-summary">
                      <article><span>Já cadastradas</span><strong>{resumo.jaCadastrados}</strong><small>Só entra estoque</small></article>
                      <article><span>Peças novas</span><strong>{resumo.novos}</strong><small>{resumo.novos ? "Serão cadastradas" : "Nenhuma"}</small></article>
                      <article className={resumo.subiramDePreco ? "summary-danger" : ""}><span>Subiram de preço</span><strong>{resumo.subiramDePreco}</strong><small>{resumo.caiuDePreco ? `${resumo.caiuDePreco} baixou de preço` : "Comparado ao custo do cadastro"}</small></article>
                    </div>
                  );
                })()}

                <div className="table-scroll">
                  <table className="nfe-table">
                    <thead><tr>
                      <th>Entra</th><th>Item</th><th className="col-secondary">Situação</th>
                      <th className="num">Nota</th><th className="num">Un. por volume</th><th className="num">Entra no estoque</th>
                      <th className="num">Custo antes</th><th className="num">Custo agora</th><th className="num">Variação</th>
                    </tr></thead>
                    <tbody>{nfeLinhas.map((linha) => {
                      const problema = linha.incluir ? fatorProblema(linha.fator) : "";
                      return (
                        <tr key={linha.item.numero} className={linha.incluir ? "" : "nfe-fora"}>
                          <td><input type="checkbox" checked={linha.incluir} aria-label={`Incluir ${linha.item.descricao}`} onChange={(evento) => mexerNaLinha(linha.item.numero, { incluir: evento.target.checked })}/></td>
                          <td>
                            <strong>{linha.item.descricao}</strong>
                            <span className="mono">{linha.item.gtin || "SEM GTIN"}{linha.item.codigoFornecedor ? ` · ${linha.item.codigoFornecedor}` : ""}</span>
                          </td>
                          <td className="col-secondary">
                            {linha.produto
                              ? <><span className="status green"><i/>Já cadastrada</span><span>{linha.produto.code} · achada por {linha.achadoPor}</span></>
                              : <label className="nfe-cadastrar"><input type="checkbox" checked={linha.cadastrar} onChange={(evento) => mexerNaLinha(linha.item.numero, { cadastrar: evento.target.checked })}/>Cadastrar esta peça</label>}
                          </td>
                          <td className="num">{linha.item.quantidade} {linha.item.unidade}</td>
                          {/*
                            A nota diz "1 CX" e na prateleira entram 6. Sem
                            isto o estoque entra com 1, a peça "acaba" no
                            sistema com cinco ainda na caixa, e o custo
                            unitário fica seis vezes maior do que é. O número
                            é um palpite tirado da descrição — dá para
                            corrigir, porque errar aqui estraga o estoque.
                          */}
                          <td className="num">
                            <input className="nfe-fator" inputMode="numeric" value={linha.fatorTexto} aria-label={`Unidades por volume de ${linha.item.descricao}`} onChange={(evento) => mexerNaLinha(linha.item.numero, { fatorTexto: evento.target.value.replace(/[^\d]/g, "") })}/>
                            {problema ? <small className="nfe-erro">{problema}</small> : null}
                          </td>
                          <td className="num"><strong>{linha.entra}</strong></td>
                          <td className="num">{linha.custoAnterior > 0 ? formatBRL(linha.custoAnterior) : "—"}</td>
                          <td className="num"><strong>{formatBRL(linha.custoNovo)}</strong></td>
                          <td className="num">{linha.custoAnterior > 0
                            ? <span className={`nfe-variacao ${linha.variacao > 0 ? "subiu" : linha.variacao < 0 ? "caiu" : ""}`}>{linha.variacao > 0 ? "+" : ""}{linha.variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                            : <span className="nfe-variacao">nova</span>}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div className="info-strip"><Icon name="check" size={17}/><span>A entrada usa <b>{useAverageCost ? "custo médio" : "o último preço"}</b>, como está em Configurações. Peça nova nasce com o preço de venda calculado pela margem padrão da oficina.</span></div>
              </>
            ) : null}
          </div>
        ) : null}

        {dialog === "import" ? (
          <div className="dialog-body form-section">
            <div className="upload-zone">
              <span className="upload-icon"><Icon name="file"/></span>
              <strong>{importFileName || "Selecione a planilha preenchida"}</strong>
              <p>{importReading ? "Lendo a planilha…" : "Formato CSV exportado pelo Google Sheets ou pelo Excel, até 5 MB."}</p>
              <label className="outline-button large file-picker">{importPlan ? "Trocar arquivo" : "Escolher arquivo"}<input type="file" accept=".csv,text/csv" onChange={(event) => { readImportFile(event.target.files?.[0]); event.target.value = ""; }}/></label>
            </div>
            <button className="template-link" onClick={downloadStockTemplate}><Icon name="arrow" size={16}/>Ainda não tem o modelo? Baixar planilha de exemplo</button>

            {importPlan ? (
              <>
                <div className="module-summary">
                  <article><span>Peças novas</span><strong>{importPlan.create.length}</strong><small>Serão cadastradas</small></article>
                  <article><span>Já cadastradas</span><strong>{importPlan.update.length}</strong><small>Quantidade e dados atualizados</small></article>
                  <article className={importPlan.issues.length ? "summary-danger" : ""}><span>Linhas com problema</span><strong>{importPlan.issues.length}</strong><small>{importPlan.issues.length ? "Não serão importadas" : "Planilha sem erros"}</small></article>
                </div>

                {importPlan.issues.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Linha</th><th>Peça</th><th>O que precisa corrigir</th></tr></thead>
                      <tbody>{importPlan.issues.map((issue, index) => (
                        <tr key={`${issue.line}-${index}`}>
                          <td className="mono"><strong>{issue.line || "—"}</strong></td>
                          <td>{issue.name || "—"}</td>
                          <td><span className="status red"><i/>{issue.message}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : null}

                {importPlan.create.length + importPlan.update.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Linha</th><th>Peça</th><th>Situação</th><th>Qtd.</th><th>Custo</th><th>Venda</th></tr></thead>
                      <tbody>{[...importPlan.create.map((row) => ({ row, product: null })), ...importPlan.update].map(({ row, product }) => (
                        <tr key={row.line}>
                          <td className="mono">{row.line}</td>
                          <td><strong className="order-id">{row.name}</strong><span>{row.barcode || row.partNumber || "sem código"}</span></td>
                          <td><span className={product ? "status blue" : "status green"}><i/>{product ? `Atualiza ${product.id}` : "Nova"}</span></td>
                          <td className="mono"><strong>{row.stock}</strong></td>
                          <td className="mono">{formatBRL(row.cost)}</td>
                          <td className="mono">{formatBRL(row.price)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="info-strip"><Icon name="check" size={18}/><span>{importPlan
              ? "A quantidade da planilha substitui a do sistema — ela é uma contagem, não uma entrada de mercadoria. Coluna em branco não apaga o que já está cadastrado."
              : "Antes de cadastrar, o sistema mostra o que vai entrar, o que vai ser atualizado e quais linhas têm problema, para você conferir."}</span></div>
          </div>
        ) : null}

        {dialog === "catalog" ? (
          <div className="dialog-body">
            <label className="pdv-search modal-search"><Icon name="search"/><input autoFocus value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar produto, código de barras ou SKU"/><kbd>F2</kbd></label>
            <div className="catalog-filters">{["Todos", ...productCategoryNames].map((category) => <button className={catalogCategory === category ? "selected" : ""} key={category} onClick={() => setCatalogCategory(category)}>{category}</button>)}</div>
            <div className="catalog-list">{produtosAtivos.filter((product) => (catalogCategory === "Todos" || product.category === catalogCategory) && `${product.name} ${product.code} ${product.barcode ?? ""}`.toLowerCase().includes(catalogSearch.toLowerCase())).map((product) => (
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
            {splitPayment ? <><div className="split-payment-grid">
              <label className="field"><span>Primeira forma</span><select value={splitFirstMethod} onChange={(event) => setSplitFirstMethod(event.target.value)}>{activePaymentMethods.map((m) => <option key={m.name}>{m.name}</option>)}</select></label>
              <label className="field"><span>Valor</span><MoneyField value={splitFirstAmount} onChange={setSplitFirstAmount} placeholder="R$ 0,00"/></label>
              <label className="field"><span>Segunda forma</span><select value={splitSecondMethod} onChange={(event) => setSplitSecondMethod(event.target.value)}>{activePaymentMethods.map((m) => <option key={m.name}>{m.name}</option>)}</select></label>
              {/* O restante é calculado: é assim que se divide no balcão
                  ("R$ 50 no dinheiro, o resto no PIX"), e impede a soma não
                  fechar por erro de digitação. */}
              <label className="field"><span>Restante</span><input value={formatBRL(splitSecondValue)} readOnly/></label>
            </div>
            <div className="machine-fee-summary">
              <div><span>Total da venda</span><strong>{formatBRL(paymentGross)}</strong></div>
              <div><span>Entra na gaveta</span><strong>{formatBRL(drawerTotal(splitParts))}</strong><small>Só a parte em dinheiro</small></div>
              <div><span>{paymentCreditAmount > 0 ? "Fica a prazo" : "Vai para a conta"}</span><strong>{formatBRL(paymentCreditAmount > 0 ? paymentCreditAmount : paymentGross - drawerTotal(splitParts) - paymentCreditAmount)}</strong><small>{paymentCreditAmount > 0 ? "Vira conta a receber" : "PIX e cartão"}</small></div>
            </div></> : null}
            {["Débito", "Crédito"].includes(paymentMethod) ? <><div className="form-grid payment-extra"><label className="field"><span>Maquininha utilizada</span><select value={selectedMachine?.id ?? ""} onChange={(event) => setSelectedMachineId(event.target.value)}>{activePaymentMachines.map((machine) => <option value={machine.id} key={machine.id}>{machine.name}{machine.primary ? " · principal" : ""}</option>)}</select></label>{paymentMethod === "Crédito" ? <label className="field"><span>Parcelas</span><select value={paymentInstallments} onChange={(event) => setPaymentInstallments(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((installment) => <option value={installment} key={installment}>{installment}x</option>)}</select></label> : <label className="field"><span>Recebimento</span><input value={selectedMachine?.settlementDays === 0 ? "Na hora" : `D+${selectedMachine?.settlementDays ?? 1}`} readOnly/></label>}</div><div className="machine-fee-summary"><div><span>Valor bruto</span><strong>{formatBRL(paymentGross)}</strong></div><div><span>Taxa da {selectedMachine?.name ?? "máquina"}</span><strong>− {formatBRL(paymentFeeAmount)}</strong><small>{paymentFeeRate.toFixed(2).replace(".", ",")}%</small></div><div><span>Valor líquido</span><strong>{formatBRL(paymentGross - paymentFeeAmount)}</strong></div></div></> : null}
            {cashDue > 0 ? <div className="form-grid payment-extra"><label className="field"><span>Valor recebido</span><MoneyField value={cashReceived} onChange={setCashReceived} placeholder={formatBRL(cashDue)}/></label><div className="change-box"><span>Troco</span><strong>{formatBRL(changeDue)}</strong></div></div> : null}
            {paymentMethod === "Nota a prazo" ? <div className="credit-warning"><Icon name="alert" size={18}/><div><strong>Venda a prazo</strong><small>Cliente obrigatório. Vencimento registrado no contas a receber.</small></div></div> : null}
            {paymentMethod === "Troca de serviços" ? <div className="trade-payment-card"><div className="trade-payment-head"><span><Icon name="users" size={18}/></span><div><strong>Compensar com trabalho ou serviço</strong><small>Quita o débito sem lançar entrada em dinheiro no caixa.</small></div></div><div className="form-grid"><label className="field field-full"><span>Serviço recebido do cliente</span><input value={tradeServiceDescription} onChange={(event) => setTradeServiceDescription(event.target.value)} placeholder="Ex.: Serviço combinado com o cliente"/></label><label className="field"><span>Valor acordado</span><MoneyField value={tradeValue} onChange={setTradeValue} placeholder="0,00"/></label><label className="field"><span>Valor compensado agora</span><input value={formatBRL(Math.min(valorDigitado(tradeValue) || 0, paymentGross))} readOnly/></label></div><div className="trade-cash-note"><Icon name="check" size={16}/><span>Entrada em caixa: <strong>R$ 0,00</strong>. A movimentação ficará no histórico financeiro como compensação.</span></div></div> : null}
          </div>
        ) : null}

        {dialog === "purchase" ? (
          <div className="dialog-body form-section">
            <div className="form-grid">
              <label className="field field-full"><span>Fornecedor</span><select value={purchaseSupplierId} onChange={(event) => setPurchaseSupplierId(event.target.value)}>{activeSuppliers.length ? activeSuppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name} · {supplier.deliveryDays === 0 ? "entrega no dia" : `${supplier.deliveryDays} dia${supplier.deliveryDays === 1 ? "" : "s"}`}</option>) : <option value="">Nenhum fornecedor cadastrado</option>}</select></label>
              <label className="field"><span>Data da entrada</span><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)}/></label><label className="field"><span>Pagamento</span><select value={purchasePayment} onChange={(event) => setPurchasePayment(event.target.value)}><option>À vista</option><option>A prazo</option><option>Parcial</option></select></label>
            </div>
            <div className="purchase-items">
              <div className="purchase-head"><strong>Produtos da entrada</strong><button onClick={addPurchaseItem} disabled={!products.length}><Icon name="plus" size={16}/>Adicionar produto</button></div>
              {purchaseItems.length ? purchaseItems.map((item, index) => (
                <div className="purchase-row" key={index}>
                  <select value={item.productId} onChange={(event) => changePurchaseItem(index, { productId: event.target.value })}>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <NumberField min={1} fallback={1} value={item.quantity} onChange={(valor) => changePurchaseItem(index, { quantity: valor })} placeholder="Qtd"/>
                  <NumberField casas={2} min={0} fallback={0} blankValue={0} value={item.unitCost} onChange={(valor) => changePurchaseItem(index, { unitCost: valor })} placeholder="R$ Custo"/>
                  <strong>{formatBRL(item.quantity * item.unitCost)}</strong>
                  <button className="remove-item" onClick={() => removePurchaseItem(index)} aria-label="Remover item">×</button>
                </div>
              )) : (
                <div className="lookup-empty" style={{ padding: "12px" }}>
                  <Icon name="box" size={18}/>
                  <span>{products.length ? "Nenhum produto na entrada. Clique em \"Adicionar produto\"." : "Cadastre um produto no estoque antes de registrar uma entrada."}</span>
                </div>
              )}
            </div>
            <div className="purchase-total"><span>Total da entrada</span><strong>{formatBRL(purchaseTotal)}</strong></div>
            <div className="info-strip"><Icon name="check" size={18}/><span>{useAverageCost
              ? "Ao salvar, a quantidade entra no estoque e o custo de cada peça vira a média ponderada com o que já havia na prateleira."
              : "Ao salvar, a quantidade entra no estoque e o custo de cada peça passa a ser o preço desta compra."} Nenhuma nota fiscal será emitida.</span></div>
          </div>
        ) : null}

        {dialog === "finance" ? (
          <div className="dialog-body form-section">
            <div className="choice-grid">
              <label className={movementKind === "entrada" ? "choice-card selected" : "choice-card"}><input type="radio" name="movement" checked={movementKind === "entrada"} onChange={() => { setMovementKind("entrada"); setMovementCategory(""); }}/><span className="choice-radio"/><div><strong>Entrada</strong><small>Dinheiro recebido</small></div></label>
              <label className={movementKind === "saida" ? "choice-card selected" : "choice-card"}><input type="radio" name="movement" checked={movementKind === "saida"} onChange={() => { setMovementKind("saida"); setMovementCategory(""); }}/><span className="choice-radio"/><div><strong>Saída</strong><small>Despesa ou retirada</small></div></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Valor</span><MoneyField autoFocus value={movementAmount} onChange={setMovementAmount} placeholder="R$ 0,00"/></label>
              <label className="field"><span>Motivo</span><select value={movementCategory} onChange={(event) => setMovementCategory(event.target.value)}><option value="">Escolha o motivo</option>{movementCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="field"><span>Forma</span><select value={movementMethod} onChange={(event) => setMovementMethod(event.target.value)}>{activePaymentMethods.map((method) => <option key={method.name}>{method.name}</option>)}</select></label>
              <label className="field"><span>Data</span><input type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)}/></label>
              <label className="field field-full"><span>Descrição</span><textarea value={movementDescription} onChange={(event) => setMovementDescription(event.target.value)} placeholder="Motivo ou observação da movimentação"/></label>
            </div>
            {/* Sangria e suprimento saíram da lista de motivos de propósito:
                quem faz isso é o caixa. Ter dois caminhos para a mesma coisa
                faria a conferência da gaveta contar o mesmo dinheiro duas
                vezes — e ninguém entenderia a diferença no fim do dia. */}
            <div className="info-strip"><Icon name="check" size={18}/><span>{cashOpen && movementMethod === "Dinheiro"
              ? `Em dinheiro, esta movimentação entra na conferência do caixa ${cashOpen.id}. Para tirar ou pôr troco na gaveta, use Sangria e Suprimento no caixa.`
              : "Use aqui o dinheiro que não é venda nem conta agendada. Sangria e suprimento ficam no caixa; conta com vencimento, em Contas a pagar."}</span></div>
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
                  <label className="field"><span>Fornecedor / onde comprou</span><select value={expenseSupplierId} onChange={(event) => setExpenseSupplierId(event.target.value)}>{activeSuppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}<option>Outro fornecedor</option></select></label>
                  <label className="field"><span>Preço de custo</span><MoneyField value={expenseAmount} onChange={setExpenseAmount} placeholder="0,00"/></label>
                  <label className="field"><span>Preço cobrado do cliente</span><MoneyField value={expenseSale} onChange={setExpenseSale} placeholder="0,00"/></label>
                </> : expenseCategory === "Pagamento de funcionário" ? <>
                  <label className="field field-full"><span>Funcionário que receberá</span><select value={expenseEmployeeId} onChange={(event) => { const employeeId = event.target.value; setExpenseEmployeeId(employeeId); const employee = users.find((user) => user.id === employeeId); setExpenseAmount(String(employee?.baseSalary || 0)); }}>{users.filter((user) => user.active).map((user) => <option value={user.id} key={user.id}>{user.name} · {user.position}</option>)}</select></label>
                  <label className="field"><span>Vínculo</span><input value={selectedEmployee?.employmentType ?? ""} readOnly/></label><label className="field"><span>Salário padrão cadastrado</span><input value={formatBRL(selectedEmployee?.baseSalary ?? 0)} readOnly/></label>
                  <label className="field"><span>Valor deste pagamento</span><MoneyField min={0} value={expenseAmount} onChange={setExpenseAmount}/></label><label className="field"><span>Referência</span><input defaultValue={new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}/></label>
                </> : <>
                  <label className="field field-full"><span>Descrição do gasto</span><input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Ex.: Frete urgente de motopeças"/></label>
                  <label className="field"><span>Valor do gasto</span><MoneyField value={expenseAmount} onChange={setExpenseAmount} placeholder="0,00"/></label>
                  <label className="field"><span>Fornecedor ou favorecido</span><input placeholder="Opcional"/></label>
                </>}
                {expensePaymentMode === "Pagar depois" ? <><label className="field"><span>Data de vencimento</span><input type="date" value={expenseDueDate} onChange={(event) => setExpenseDueDate(event.target.value)}/></label><label className="field"><span>Forma prevista</span><select value={expensePlannedMethod} onChange={(event) => setExpensePlannedMethod(event.target.value)}><option>PIX</option><option>Boleto</option><option>Transferência</option><option>A definir</option></select></label></> : <><label className="field"><span>{expensePaymentMode === "Caixa" ? "Caixa de saída" : "Conta bancária"}</span><select><option>{expensePaymentMode === "Caixa" ? "Caixa balcão" : "Banco Inter PJ"}</option><option>Banco Bradesco PJ</option></select></label><label className="field"><span>Data do pagamento</span><input type="date" defaultValue={new Date().toISOString().split("T")[0]}/></label></>}
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
              <label className="field field-full"><span>{dialog === "receivable" ? "Cliente ou pagador" : "Fornecedor ou favorecido"}</span><select value={accountPerson} onChange={(event) => setAccountPerson(event.target.value)}>{(dialog === "receivable" ? clients.map((client) => client.name) : activeSuppliers.map((supplier) => supplier.name)).map((name) => <option key={name}>{name}</option>)}<option>Cadastro avulso</option></select></label>
              <label className="field field-full"><span>Descrição</span><input value={accountDescriptionText} onChange={(event) => setAccountDescriptionText(event.target.value)} placeholder={dialog === "receivable" ? "Ex.: Parcela de peças e serviço" : "Ex.: Compra de peças"}/></label>
              <label className="field"><span>Valor total</span><MoneyField value={accountAmount} onChange={setAccountAmount} placeholder="0,00"/></label><label className="field"><span>{accountInstallments > 1 ? "Primeiro vencimento" : "Vencimento"}</span><input type="date" value={accountDueDate} onChange={(event) => setAccountDueDate(event.target.value)}/></label>
              <label className="field"><span>Categoria</span><select value={accountCategory} onChange={(event) => setAccountCategory(event.target.value)}>{accountCategoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field"><span>Parcelas</span><select value={accountInstallments} onChange={(event) => setAccountInstallments(Number(event.target.value) || 1)}>{[1, 2, 3, 4, 5, 6, 10, 12].map((count) => <option value={count} key={count}>{count === 1 ? "Parcela única" : `${count} parcelas`}</option>)}</select></label>
              <label className="field field-full"><span>Observações</span><textarea value={accountNotes} onChange={(event) => setAccountNotes(event.target.value)} placeholder="Informações opcionais sobre cobrança ou pagamento"/></label>
            </div>
            {accountInstallments > 1 && valorDigitado(accountAmount) > 0 ? (
              <div className="info-strip"><Icon name="check" size={18}/><span>
                {accountInstallments} parcelas com vencimento mensal. A primeira sai {formatBRL(splitInstallments(valorDigitado(accountAmount) || 0, accountInstallments, accountDueDate.split("-").reverse().join("/"))[0]?.amount ?? 0)} e as demais {formatBRL(splitInstallments(valorDigitado(accountAmount) || 0, accountInstallments, accountDueDate.split("-").reverse().join("/"))[1]?.amount ?? 0)} — os centavos da divisão ficam na primeira, para a última fechar redonda.
              </span></div>
            ) : null}
          </div>
        ) : null}

        {dialog === "settleReceivable" || dialog === "settlePayable" ? (
          <div className="dialog-body form-section">
            {currentAccount ? (
              <>
                <div className={`settlement-card ${dialog === "settleReceivable" ? "receive" : "pay"}`}>
                  <span>{dialog === "settleReceivable" ? "Saldo a receber" : "Saldo a pagar"}</span>
                  <strong>{formatBRL(currentAccountOpen)}</strong>
                  <small>{currentAccount.person} · {accountStatus(currentAccount)}</small>
                </div>
                <div className="order-info-grid">
                  <div><span>Lançamento</span><strong>{currentAccount.description}</strong><small>{currentAccount.installments > 1 ? `Parcela ${currentAccount.installment}/${currentAccount.installments}` : "Parcela única"}</small></div>
                  <div><span>Valor original</span><strong>{formatBRL(currentAccount.amount)}</strong><small>Vence em {currentAccount.dueDate}</small></div>
                  <div><span>Já {dialog === "settleReceivable" ? "recebido" : "pago"}</span><strong>{formatBRL(currentAccount.amount - currentAccountOpen)}</strong><small>{(currentAccount.settlements ?? []).length} baixa(s)</small></div>
                </div>
                <div className="form-grid form-top-gap">
                  <label className="field"><span>Valor desta baixa</span><MoneyField value={settleFull ? formatTyped(currentAccountOpen, 2) : settleAmount} onChange={setSettleAmount} readOnly={settleFull} placeholder="0,00" className={settleFull ? "is-derived" : ""}/></label>
                  <label className="field"><span>Data</span><input type="date" value={settleDate} onChange={(event) => setSettleDate(event.target.value)}/></label>
                  <label className="field"><span>Forma de pagamento</span><select value={settleMethod} onChange={(event) => setSettleMethod(event.target.value)}>{activePaymentMethods.map((method) => <option key={method.id}>{method.name}</option>)}</select></label>
                  <label className="field"><span>{dialog === "settleReceivable" ? "Conta de entrada" : "Conta de saída"}</span><select value={currentAccountTarget} onChange={(event) => setQuickAccount(event.target.value)}>{cashAccounts.map((account) => <option key={account}>{account}</option>)}</select></label>
                </div>
                <label className="toggle-row"><input type="checkbox" checked={settleFull} onChange={(event) => setSettleFull(event.target.checked)}/><span/><div><strong>Quitar este lançamento</strong><small>Desative para registrar apenas um pagamento parcial</small></div></label>
                {(currentAccount.settlements ?? []).length ? (
                  <div className="history-list"><strong>Baixas já registradas</strong>{(currentAccount.settlements ?? []).map((settlement, index) => (
                    <div key={index}><i/><span><b>{settlement.date}</b>{formatBRL(settlement.amount)} · {settlement.method}</span></div>
                  ))}</div>
                ) : null}
              </>
            ) : (
              <div className="empty-panel"><Icon name="wallet" size={24}/><span>Nenhuma conta selecionada. Abra a baixa pela lista de contas.</span></div>
            )}
          </div>
        ) : null}

        {dialog === "cash" && !cashOpen ? (
          <div className="dialog-body form-section">
            <div className="cash-balance"><span>Nenhum caixa aberto</span><strong>{formatBRL(0)}</strong><small>Abra o caixa com o dinheiro que já está na gaveta</small></div>
            <div className="form-grid form-top-gap">
              <label className="field"><span>Fundo de troco</span><MoneyField value={cashAmount} onChange={setCashAmount} placeholder="R$ 0,00"/></label>
              <label className="field"><span>Observação (opcional)</span><input value={cashReason} onChange={(event) => setCashReason(event.target.value)} placeholder="Ex.: Troco separado ontem"/></label>
            </div>
            {closedSessions(cashSessions).length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Caixa</th><th>Fechado em</th><th>Esperado</th><th>Contado</th><th>Conferência</th></tr></thead>
                  <tbody>{closedSessions(cashSessions).slice(0, 5).map((past) => {
                    const gap = past.difference ?? 0;
                    const label = differenceLabel(gap);
                    return (
                      <tr key={past.id}>
                        <td><strong className="order-id">{past.id}</strong><span>{past.openedByName || "—"}</span></td>
                        <td>{past.closedDate || "—"}</td>
                        <td className="mono">{formatBRL(past.expectedAmount ?? 0)}</td>
                        <td className="mono">{formatBRL(past.countedAmount ?? 0)}</td>
                        <td><span className={`status ${label === "Confere" ? "green" : label === "Sobra" ? "blue" : "red"}`}><i/>{label === "Confere" ? "Confere" : `${label} de ${formatBRL(Math.abs(gap))}`}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            ) : null}
            <div className="info-strip"><Icon name="check" size={18}/><span>O caixa conta o dinheiro em espécie da gaveta. Venda no PIX, no débito ou no crédito não entra aqui — vai direto para a conta.</span></div>
          </div>
        ) : null}

        {dialog === "cash" && cashOpen ? (
          <div className="dialog-body form-section">
            <div className="cash-balance"><span>Esperado na gaveta agora · {cashOpen.id}</span><strong>{formatBRL(drawer.expected)}</strong><small>Aberto {cashOpen.openedDate} por {cashOpen.openedByName || "—"} · {drawer.count} movimentação(ões)</small></div>

            {sessionIsStale(cashOpen) ? <div className="dialog-error-strip" role="alert"><Icon name="alert" size={17}/><span>Este caixa está aberto há mais de 20 horas. Provavelmente ficou de um dia anterior — confira e feche antes de continuar.</span></div> : null}

            <div className="module-summary">
              <article><span>Fundo de troco</span><strong>{formatBRL(drawer.opening)}</strong><small>Abertura do caixa</small></article>
              <article><span>Entrou em dinheiro</span><strong>{formatBRL(drawer.sales + drawer.received + drawer.supplies)}</strong><small>{formatBRL(drawer.sales)} em vendas e OS</small></article>
              <article><span>Saiu em dinheiro</span><strong>{formatBRL(drawer.withdrawals + drawer.expenses)}</strong><small>{formatBRL(drawer.withdrawals)} em sangrias</small></article>
            </div>

            <div className="cash-actions">{[{name:"Suprimento", detail:"Adicionar dinheiro", icon:"plus" as IconName},{name:"Sangria", detail:"Retirar dinheiro", icon:"arrow" as IconName},{name:"Fechar caixa", detail:"Conferir o dia", icon:"check" as IconName}].map((action) => <button className={cashAction === action.name ? "selected" : ""} key={action.name} onClick={() => { setCashAction(action.name); setDialogError(""); }}><Icon name={action.icon}/><strong>{action.name}</strong><small>{action.detail}</small></button>)}</div>

            {cashAction === "Fechar caixa" ? (
              <>
                <div className="form-grid form-top-gap">
                  <label className="field"><span>Dinheiro contado na gaveta</span><MoneyField autoFocus value={cashCounted} onChange={setCashCounted} placeholder="R$ 0,00"/></label>
                  <label className="field"><span>Observação do fechamento</span><input value={cashReason} onChange={(event) => setCashReason(event.target.value)} placeholder="Ex.: Faltou troco de uma venda"/></label>
                </div>
                {/* module-summary, e não machine-fee-summary: aquele pinta a
                    última coluna de verde sempre, porque foi feito para "valor
                    líquido". Uma falta de caixa em verde é justamente o que faz
                    ninguém reparar nela. Aqui summary-danger deixa o número
                    vermelho quando falta dinheiro. */}
                <div className="module-summary">
                  <article><span>Esperado pelo sistema</span><strong>{formatBRL(drawer.expected)}</strong><small>Já com o fundo de troco</small></article>
                  <article><span>Contado por você</span><strong>{formatBRL(cashCountedValue)}</strong><small>Dinheiro na gaveta</small></article>
                  <article className={differenceLabel(cashGap) === "Falta" ? "summary-danger" : ""}><span>{differenceLabel(cashGap)}</span><strong>{differenceLabel(cashGap) === "Confere" ? formatBRL(0) : `${cashGap > 0 ? "+" : "−"} ${formatBRL(Math.abs(cashGap))}`}</strong><small>{differenceLabel(cashGap) === "Confere" ? "O caixa bate" : "Fica registrado no fechamento"}</small></article>
                </div>
                {nonDrawerTotal(cashOpen, sales, orders) > 0 ? <div className="info-strip"><Icon name="check" size={18}/><span>Fora da gaveta, esta sessão recebeu {formatBRL(nonDrawerTotal(cashOpen, sales, orders))} em PIX, débito e crédito. Esse valor foi para a conta e não deve ser contado aqui.</span></div> : null}
              </>
            ) : (
              <div className="form-grid form-top-gap">
                <label className="field"><span>Valor</span><MoneyField autoFocus value={cashAmount} onChange={setCashAmount} placeholder="R$ 0,00"/></label>
                <label className="field"><span>Motivo</span><input value={cashReason} onChange={(event) => setCashReason(event.target.value)} placeholder={cashAction === "Sangria" ? "Ex.: Depósito no banco" : "Ex.: Troco para o caixa"}/></label>
              </div>
            )}

            {cashProblem ? <div className="dialog-error-strip" role="alert"><Icon name="alert" size={17}/><span>{cashProblem}</span></div> : null}

            {drawerMoves.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Movimentação</th><th>Origem</th><th>Hora</th><th>Valor</th></tr></thead>
                  <tbody>{drawerMoves.map((entry) => (
                    <tr key={entry.id}>
                      <td><strong className="order-id">{entry.kind}</strong><span>{entry.description}</span></td>
                      <td>{entry.id.startsWith(cashOpen.id) ? "Caixa" : entry.id}</td>
                      <td>{new Date(entry.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="mono"><strong className={entry.amount < 0 ? "danger-text" : ""}>{entry.amount < 0 ? "− " : "+ "}{formatBRL(Math.abs(entry.amount))}</strong></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {dialog === "order" ? (
          <div className="dialog-body order-detail">
            {currentOrder ? (
              <>
                <div className="order-detail-top"><span className={`status ${orderStatusTone}`}><i/>{orderStatus === "Entrega" ? "Pronta para entrega" : orderStatus}</span><div className="order-actions"><button onClick={() => printOrder(currentOrder)}><Icon name="printer" size={16}/>{settings?.printThreeCopies !== false ? "Imprimir 3 vias" : "Imprimir OS"}</button><button onClick={() => sendOrderWhatsapp(currentOrder)}><Icon name="arrow" size={16}/>WhatsApp</button></div></div>
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
                            <div><strong>{mechanic.name}</strong><small>{showWorkload ? `${mechanic.currentOrders || 0} OS agora` : "Disponível"}</small></div>
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

                <div className="checkout-add-block"><div className="checkout-add-title"><Icon name="box" size={17}/><div><strong>Adicionar outra peça</strong><small>O valor de venda vem bloqueado do cadastro.</small></div></div><label className="mini-search"><Icon name="search" size={16}/><input value={checkoutPieceSearch} onChange={(event) => setCheckoutPieceSearch(event.target.value)} placeholder="Buscar peça ou código"/></label><div className="checkout-product-results">{produtosAtivos.filter((product) => product.stock > 0 && `${product.name} ${product.code}`.toLowerCase().includes(checkoutPieceSearch.toLowerCase())).slice(0, 3).map((product) => { const added = checkoutItems.some((item) => item.id === product.code); return <button className={added ? "added" : ""} key={product.code} disabled={added} onClick={() => setCheckoutItems((current) => [...current, { id: product.code, productId: product.id, type: "Peça", name: product.name, price: parseBRL(product.price), cost: parseBRL(product.cost) }])}><span className="catalog-code">{product.code.slice(-2)}</span><div><strong>{product.name}</strong><small>{product.stock} em estoque · preço fixo</small></div><b>{product.price}</b><i>{added ? "✓" : "+"}</i></button>; })}</div></div>

                <div className="checkout-add-block labor"><div className="checkout-add-title"><Icon name="wrench" size={17}/><div><strong>Adicionar mão de obra</strong><small>Descrição e valor são manuais para esta OS.</small></div></div><div className="checkout-labor-row"><label className="field"><span>Descrição</span><input value={checkoutLaborDescription} onChange={(event) => setCheckoutLaborDescription(event.target.value)} placeholder="Ex.: Regulagem final"/></label><label className="field compact-field"><span>Valor</span><MoneyField value={checkoutLaborValue} onChange={setCheckoutLaborValue} placeholder="0,00"/></label><button className="outline-button large" onClick={() => { if (!checkoutLaborDescription.trim() || valorDigitado(checkoutLaborValue) <= 0) return; setCheckoutItems((current) => [...current, { id: `LAB-CHECKOUT-${Date.now()}`, type: "Mão de obra", name: checkoutLaborDescription.trim(), price: valorDigitado(checkoutLaborValue) }]); setCheckoutLaborDescription(""); setCheckoutLaborValue(""); }}><Icon name="plus" size={16}/>Adicionar</button></div></div>
                <div className="approval-note"><Icon name="alert" size={17}/><span>Qualquer item adicional deve estar aprovado pelo cliente antes do fechamento. Itens não executados ou não usados não devem ser cobrados.</span></div>
              </section>

              <section className="checkout-payment-panel">
                {currentOrder?.customerPending ? (
                  <div className="checkout-pending-customer">
                    <div className="checkout-pending-head"><span><Icon name="alert" size={18}/></span><div><strong>Falta identificar o cliente</strong><small>Esta OS foi aberta sem cadastro. Sem nome e WhatsApp a oficina fica com o serviço feito e ninguém para cobrar.</small></div></div>
                    <div className="form-grid">
                      <label className="field"><span>Nome do cliente <b className="req">*</b></span><input value={checkoutCustomerName} onChange={(event) => setCheckoutCustomerName(emMaiusculo(event.target.value))} placeholder="Nome de quem vai retirar a moto" autoFocus/></label>
                      <label className="field"><span>WhatsApp <b className="req">*</b></span><input value={checkoutCustomerPhone} onChange={(event) => setCheckoutCustomerPhone(formatPhone(event.target.value))} placeholder="(34) 99999-9999"/></label>
                    </div>
                    <small className="os-inline-hint">Ao encerrar, o cliente é cadastrado e a moto {currentOrder.plate} passa a ser dele.</small>
                  </div>
                ) : null}
                <div className="payment-total-card checkout-total-card"><span>Total a receber</span><strong>{formatBRL(checkoutTotal)}</strong><small>{checkoutItems.length} itens · {currentOrder ? currentOrder.customer : "Cliente"}</small></div>
                {currentOrder && isPartnerBilled(currentOrder) ? (
                  <>
                    {/*
                      OS de empresa parceira não pergunta forma de pagamento: a
                      moto sai hoje, a peça já saiu do estoque, e o valor entra
                      na fatura do mês. Perguntar aqui levaria alguém a marcar
                      "Dinheiro" e a gaveta a fechar com uma sobra que não
                      existe.
                    */}
                    <div className="partner-billing-card">
                      <div className="partner-billing-head"><span><Icon name="users" size={18}/></span><div><strong>{currentOrder.partnerName || "Empresa parceira"}</strong><small>Faturado, não recebido agora</small></div></div>
                      <div className="partner-billing-lines">
                        <div><span>Mão de obra</span><b>{formatBRL(partnerTotals(checkoutItems, 0).labor)}</b></div>
                        {partnerTotals(checkoutItems, checkoutPartner?.laborDiscount ?? 0).discount > 0
                          ? <div className="partner-billing-discount"><span>Desconto de {checkoutPartner?.laborDiscount}% na mão de obra</span><b>− {formatBRL(partnerTotals(checkoutItems, checkoutPartner?.laborDiscount ?? 0).discount)}</b></div>
                          : null}
                        <div><span>Peças</span><b>{formatBRL(partnerTotals(checkoutItems, 0).parts)}</b></div>
                        <div className="partner-billing-total"><span>Vai para a fatura</span><b>{formatBRL(checkoutTotal)}</b></div>
                      </div>
                      <div className="info-strip"><Icon name="clock" size={17}/><span>Vence em <b>{nextBillingDate()}</b>, o primeiro dia do mês seguinte. A conta aparece em Contas a receber no nome da empresa; a baixa do estoque acontece agora, como em qualquer OS.</span></div>
                    </div>
                  </>
                ) : (
                <>
                <div className="form-label">Como o cliente vai acertar?</div>
                <div className="payment-methods checkout-methods">{activePaymentMethods.map((methodConfig) => { const method = methodConfig.name; return <button className={paymentMethod === method ? "selected" : ""} key={method} onClick={() => setPaymentMethod(method)}><span>{method === "PIX" ? "PX" : method === "Troca de serviços" ? "TS" : method.slice(0, 2).toUpperCase()}</span><strong>{method}</strong>{paymentMethod === method ? <i>✓</i> : null}</button>; })}</div>
                <label className="toggle-row checkout-split"><input type="checkbox" checked={splitPayment} onChange={(event) => setSplitPayment(event.target.checked)}/><span/><div><strong>Dividir ou receber parcialmente</strong><small>O saldo restante pode virar uma conta a receber.</small></div></label>
                {splitPayment ? <><div className="split-payment-grid">
                  <label className="field"><span>Primeira forma</span><select value={splitFirstMethod} onChange={(event) => setSplitFirstMethod(event.target.value)}>{activePaymentMethods.map((m) => <option key={m.name}>{m.name}</option>)}</select></label>
                  <label className="field"><span>Valor recebido</span><MoneyField value={splitFirstAmount} onChange={setSplitFirstAmount} placeholder="R$ 0,00"/></label>
                  <label className="field"><span>Segunda forma</span><select value={splitSecondMethod} onChange={(event) => setSplitSecondMethod(event.target.value)}>{activePaymentMethods.map((m) => <option key={m.name}>{m.name}</option>)}</select></label>
                  <label className="field"><span>Restante</span><input value={formatBRL(splitSecondValue)} readOnly/></label>
                </div>
                <div className="machine-fee-summary">
                  <div><span>Total da OS</span><strong>{formatBRL(paymentGross)}</strong></div>
                  <div><span>Entra na gaveta</span><strong>{formatBRL(drawerTotal(splitParts))}</strong><small>Só a parte em dinheiro</small></div>
                  <div><span>{paymentCreditAmount > 0 ? "Fica a prazo" : "Vai para a conta"}</span><strong>{formatBRL(paymentCreditAmount > 0 ? paymentCreditAmount : paymentGross - drawerTotal(splitParts) - paymentCreditAmount)}</strong><small>{paymentCreditAmount > 0 ? "Vira conta a receber" : "PIX e cartão"}</small></div>
                </div></> : null}
                {["Débito", "Crédito"].includes(paymentMethod) ? <><div className="form-grid payment-extra"><label className="field"><span>Maquininha utilizada</span><select value={selectedMachine?.id ?? ""} onChange={(event) => setSelectedMachineId(event.target.value)}>{activePaymentMachines.map((machine) => <option value={machine.id} key={machine.id}>{machine.name}{machine.primary ? " · principal" : ""}</option>)}</select></label>{paymentMethod === "Crédito" ? <label className="field"><span>Parcelas</span><select value={paymentInstallments} onChange={(event) => setPaymentInstallments(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((installment) => <option value={installment} key={installment}>{installment}x</option>)}</select></label> : <label className="field"><span>Recebimento</span><input value={selectedMachine?.settlementDays === 0 ? "Na hora" : `D+${selectedMachine?.settlementDays ?? 1}`} readOnly/></label>}</div><div className="machine-fee-summary"><div><span>Valor bruto</span><strong>{formatBRL(paymentGross)}</strong></div><div><span>Taxa da {selectedMachine?.name ?? "máquina"}</span><strong>− {formatBRL(paymentFeeAmount)}</strong><small>{paymentFeeRate.toFixed(2).replace(".", ",")}%</small></div><div><span>Valor líquido</span><strong>{formatBRL(paymentGross - paymentFeeAmount)}</strong></div></div></> : null}
                {cashDue > 0 ? <div className="form-grid payment-extra"><label className="field"><span>Valor entregue pelo cliente</span><MoneyField value={cashReceived} onChange={setCashReceived} placeholder={formatBRL(cashDue)}/></label><div className="change-box"><span>Troco calculado</span><strong>{formatBRL(changeDue)}</strong></div></div> : null}
                {paymentMethod === "Nota a prazo" ? <div className="credit-warning"><Icon name="alert" size={18}/><div><strong>Registrar saldo a receber</strong><small>Defina o vencimento e mantenha a OS tecnicamente encerrada.</small></div></div> : null}
                {paymentMethod === "Troca de serviços" ? <div className="trade-payment-card"><div className="trade-payment-head"><span><Icon name="users" size={18}/></span><div><strong>Compensação por troca de serviços</strong><small>O combinado quita a OS sem entrar como dinheiro recebido.</small></div></div><div className="form-grid"><label className="field field-full"><span>Trabalho ou serviço recebido</span><input value={tradeServiceDescription} onChange={(event) => setTradeServiceDescription(event.target.value)} placeholder="Ex.: Desenvolvimento do sistema da oficina"/></label><label className="field"><span>Valor acordado / crédito disponível</span><MoneyField value={tradeValue} onChange={setTradeValue} placeholder="0,00"/></label><label className="field"><span>Compensado nesta OS</span><input value={formatBRL(tradeCompensated)} readOnly/></label><label className="field field-full"><span>Observações</span><textarea value={tradeNotes} onChange={(event) => setTradeNotes(event.target.value)} placeholder="Descreva o acordo e o que ainda falta entregar, se houver."/></label></div><div className="trade-balance-grid"><div><span>Total da OS</span><strong>{formatBRL(checkoutTotal)}</strong></div><div><span>Entrada em dinheiro</span><strong>R$ 0,00</strong></div><div><span>{tradeRemaining > 0 ? "Saldo ainda devido" : "Crédito restante da troca"}</span><strong>{formatBRL(tradeRemaining > 0 ? tradeRemaining : tradeCreditRemaining)}</strong></div></div><div className="trade-cash-note"><Icon name="check" size={16}/><span>A baixa será identificada como <strong>Troca de serviços</strong> no financeiro e no histórico do cliente.</span></div></div> : null}
                </>
                )}
                <div className="print-ready-strip"><Icon name="file" size={19}/><div><strong>Impressão automática em 3 vias</strong><small>1 · Mecânico &nbsp; 2 · Caixa &nbsp; 3 · Cliente</small></div><span>80mm</span></div>
              </section>
            </div>
          </div>
        ) : null}

        {dialog === "record" ? (
          <div className="dialog-body record-detail">
            {/* Os três números eram calculados aqui na marra e estavam errados:
                somavam TODA OS (inclusive orçamento que nunca foi fechado),
                ignoravam as vendas do PDV e contavam como gasto pago até a
                conta ainda agendada. Agora saem do mesmo financeSummary que o
                resto do sistema usa, então as telas concordam entre si. */}
            <div className="record-header"><span className="registry-avatar">FR</span><div><strong>Faturamento e resultado</strong><small>Vendas do balcão, serviços rápidos e OS encerradas</small></div><span className="status green"><i/>{dialogSummary.closedOrders} OS encerrada(s)</span></div>
            <div className="record-metrics">
              <article><span>Faturamento</span><strong>{formatBRL(dialogSummary.grossTotal)}</strong></article>
              <article><span>Custos e gastos</span><strong>{formatBRL(dialogSummary.paidExpenses + dialogSummary.partsCost)}</strong></article>
              <article><span>Lucro líquido</span><strong>{formatBRL(dialogSummary.netProfit)}</strong></article>
            </div>
            <div className="net-profit-note"><Icon name="check" size={17}/><span>O resultado desconta o custo das peças ({formatBRL(dialogSummary.partsCost)}), os gastos já pagos ({formatBRL(dialogSummary.paidExpenses)}) e as taxas de maquininha ({formatBRL(dialogSummary.cardFees)}). Contas ainda em aberto ({formatBRL(dialogSummary.pendingExpenses)}) não entram: não saíram do caixa.</span></div>
            <div className="module-summary">
              <article><span>Faturamento do mês</span><strong>{formatBRL(dialogSummary.grossMonth)}</strong><small>Mês corrente</small></article>
              <article><span>Ticket médio</span><strong>{formatBRL(dialogSummary.averageTicket)}</strong><small>Por venda ou OS</small></article>
              <article className={dialogSummary.overdueCount > 0 ? "summary-danger" : ""}><span>Contas vencidas</span><strong>{formatBRL(dialogSummary.overdueExpenses)}</strong><small>{dialogSummary.overdueCount} conta(s)</small></article>
            </div>
            <div className="history-list"><strong>Últimas movimentações</strong>{recentActivity.length
              ? recentActivity.map((item) => <div key={item.id}><i/><span><b>{item.date}</b>{item.text}</span></div>)
              : <div><i/><span><b>Hoje</b>Nenhuma movimentação registrada ainda.</span></div>}</div>
          </div>
        ) : null}

        {dialogError ? <div className="dialog-error-strip" role="alert"><Icon name="alert" size={17}/><span>{dialogError}</span></div> : null}

        {dialog !== "osChoice" ? <footer className="dialog-footer">
          <button className="ghost-button" onClick={close} disabled={saving}>Cancelar</button>
          {/*
            O total no rodapé, fixo: montando a OS numa tela só, o valor que
            está sendo formado precisa estar à vista o tempo todo — era a única
            coisa que a etapa de revisão dava e que a tela única não daria.
          */}
          {dialog === "os" ? (
            <div className="os-single-total">
              <span>Peças <b>{formatBRL(partsTotal)}</b></span>
              <span>Mão de obra <b>{formatBRL(laborTotal)}</b></span>
              {partnerDiscount > 0 ? <span className="discount">Parceiro <b>− {formatBRL(partnerDiscount)}</b></span> : null}
              <strong>Total <b>{formatBRL(osTotal)}</b></strong>
            </div>
          ) : null}
          <div>
            <button className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? "Salvando..." : dialog === "os" ? "Abrir Ordem de Serviço" : dialog === "order" && !canOperate ? "Salvar situação" : dialog === "order" && orderStatus === "Entrega" ? "Finalizar OS e receber" : primaryLabels[dialog] ?? "Salvar"}<Icon name="arrow" size={16}/></button>
          </div>
        </footer> : <footer className="dialog-footer choice-footer"><button className="ghost-button" onClick={close}>Cancelar</button></footer>}
      </section>

      {/*
        Cadastro completo aberto de dentro da OS. Fica depois do .dialog para
        renderizar por cima dele, e ao salvar já deixa o registro escolhido na
        OS — quem cadastrou não precisa procurá-lo de novo na busca.
      */}
      {cadastroNaOs === "cliente" ? (
        <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
          <ClientFormModal
            isOpen={true}
            onClose={() => setCadastroNaOs(null)}
            notify={notify || finish}
            allClients={clients}
            allMotorcycles={motorcycles}
            brands={systemList(lists, "motorcycleBrands")}
            onCreateBrand={(nome) => criarItemDeLista("motorcycleBrands", nome)}
            defaultMotorcycle={{ plate: osPlate, brand: newVehicleBrand, model: newVehicleCatalogModel, version: newVehicleVersion, year: newVehicleYear, color: newVehicleColor }}
            onSaved={(cliente) => {
              setSelectedCustomerId(cliente.id);
              setCustomerLookup(cliente.phone || cliente.name);
              setNewCustomerName(cliente.name);
              setCadastroNaOs(null);
              notify?.(`Cliente "${cliente.name}" cadastrado e selecionado nesta OS.`);
            }}
          />
        </Suspense></ErrorBoundary>
      ) : null}
      {cadastroNaOs === "moto" ? (
        <ErrorBoundary area="este formulário"><Suspense fallback={<LazyFallback />}>
          <MotorcycleFormModal
            isOpen={true}
            onClose={() => setCadastroNaOs(null)}
            clients={clients}
            notify={notify || finish}
            allMotorcycles={motorcycles}
            brands={systemList(lists, "motorcycleBrands")}
            onCreateBrand={(nome) => criarItemDeLista("motorcycleBrands", nome)}
            partners={activePartners}
            preselectedPartnerId={osOrigin === "partner" ? (selectedPartner?.id ?? "") : ""}
            preselectedClientId={selectedCustomerId}
            onSaved={(moto) => {
              setSelectedMotorcycleId(moto.id);
              setOsPlate(moto.plate);
              setNewVehicleMode(false);
              // Sem isto a busca anterior continua filtrando e a moto recém
              // cadastrada não aparece selecionada na lista.
              setPartnerBikeSearch("");
              if (moto.ownerId) setSelectedCustomerId(moto.ownerId);
              setCadastroNaOs(null);
              notify?.(`Moto placa ${moto.plate} cadastrada e selecionada nesta OS.`);
            }}
          />
        </Suspense></ErrorBoundary>
      ) : null}
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
  // O app abriu inteiro: se houve recarregamento por versão nova, ele deu
  // certo, e a marca precisa sair para o próximo deploy também se resolver.
  useEffect(() => { clearReloadMark(); }, []);
  const currentUserName = firebaseSession.profile?.name?.trim() || firebaseSession.user?.displayName?.trim() || "Usuário";
  const currentUserInitials = currentUserName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US";
  const firebaseEnabled = firebaseSession.state === "connected" && Boolean(firebaseSession.profile);
  const firebaseAdmin = firebaseSession.profile?.role === "Super Admin";
  const firebasePermissions = firebaseSession.profile?.permissions ?? defaultFirebasePermissions(firebaseSession.profile?.role ?? "Mecânico");
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
  // Configurações deixou de ser "só Super Admin": quem toca o balcão cadastra
  // categoria, forma de pagamento e serviço rápido o dia inteiro, e antes
  // precisava virar Super Admin para isso — o que dá junto o poder de criar
  // usuário e mudar a permissão dos outros. Ver e alterar são separados.
  const canSeeSettings = firebaseAdmin || hasPermission("settings.view");
  const canManageSettings = firebaseAdmin || hasPermission("settings.manage");
  const [mobileMenu, setMobileMenu] = useState(false);
  // A tela inicial sai da URL de forma síncrona, no primeiro render: decidir
  // isso em um efeito faria o endereço piscar /admin -> / -> /admin.
  const [active, setActive] = useState(() => (firebaseAdmin && isAdminPath() ? "Administração" : "Visão geral"));
  const [dialog, setDialog] = useState<DialogKind>(null);
  // Qual registro o diálogo deve abrir: OS, conta ou cadastro.
  // Vazio = nenhum selecionado, e o diálogo abre em branco.
  const [selectedRecordId, setSelectedRecordId] = useState("");
  // Carrinho do PDV: mora aqui porque a tela do balcão monta a venda e o
  // diálogo de pagamento a recebe.
  const [cart, setCart] = useState<CartItem[]>([]);
  // O desconto mora aqui junto do carrinho: o painel do PDV oferece, o diálogo
  // de pagamento cobra o valor já com ele, e a venda grava os dois.
  const [cartDiscount, setCartDiscount] = useState(0);
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
  // A central de ajuda. Fica fora do roteador de diálogos porque precisa abrir
  // de qualquer tela, inclusive por cima de um cadastro já aberto.
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopicId, setHelpTopicId] = useState("");
  const [helpSearch, setHelpSearch] = useState("");
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
  const [partners, setPartners] = useFirebaseSyncedCollection("partners", initialPartners, firebaseEnabled && (canViewCustomers || canCreateOrders), canManageSettings, firebaseSession.reportSyncError);
  const [quickServices, setQuickServices] = useFirebaseSyncedCollection("quickServices", initialQuickServices, firebaseEnabled && (canUseQuickService || canCreateOrders), canManageSettings, firebaseSession.reportSyncError);
  const [categories, setCategories] = useFirebaseSyncedCollection("categories", initialCategories, firebaseEnabled && canViewInventory, canManageSettings || canManageInventory, firebaseSession.reportSyncError);
  const [suppliers, setSuppliers] = useFirebaseSyncedCollection("suppliers", initialSuppliers, firebaseEnabled && canManageInventory, firebaseAdmin, firebaseSession.reportSyncError);
  const [paymentMachines, setPaymentMachines] = useFirebaseSyncedCollection("paymentMachines", initialPaymentMachines, firebaseEnabled && canSeeFinance, canManageSettings, firebaseSession.reportSyncError);
  const [paymentMethods, setPaymentMethods] = useFirebaseSyncedCollection("paymentMethods", initialPaymentMethods, firebaseEnabled && (canSeeFinance || canUsePdv), canManageSettings, firebaseSession.reportSyncError);
  const [sales] = useFirebaseSyncedCollection<SaleRecord>("sales", initialSales, firebaseEnabled && (canSeeFinance || canUsePdv || canUseQuickService), false, firebaseSession.reportSyncError);
  const [stockEntries] = useFirebaseSyncedCollection<StockEntryRecord>("stockEntries", initialStockEntries, firebaseEnabled && canViewInventory, false, firebaseSession.reportSyncError);
  const [stockAdjustments] = useFirebaseSyncedCollection<StockAdjustmentRecord>("stockAdjustments", initialStockAdjustments, firebaseEnabled && canViewInventory, false, firebaseSession.reportSyncError);
  const [accounts] = useFirebaseSyncedCollection<AccountRecord>("accounts", initialAccounts, firebaseEnabled && canSeeFinance, false, firebaseSession.reportSyncError);
  const [cashSessions] = useFirebaseSyncedCollection<CashSession>("cashSessions", initialCashSessions, firebaseEnabled && (canSeeFinance || canUsePdv), false, firebaseSession.reportSyncError);
  const [movements] = useFirebaseSyncedCollection<MovementRecord>("movements", initialMovements, firebaseEnabled && canSeeFinance, false, firebaseSession.reportSyncError);
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
  const summary = useMemo(() => financeSummary(sales, orders, expenses, accounts, movements), [sales, orders, expenses, accounts, movements]);
  // O cartão da Visão geral mostra a gaveta quando há caixa aberto: é o número
  // que a pessoa vai conferir, e não o saldo acumulado do negócio.
  /**
   * Avança a OS a partir do quadro do mecânico, em um toque.
   *
   * Usa exatamente a mesma regra de estoque do diálogo da OS — inclusive a
   * configuração "baixar peças só quando o serviço começa". Duplicar essa
   * conta aqui faria a peça sair do estoque duas vezes ou nenhuma, dependendo
   * de por onde a situação foi mudada.
   */
  const advanceOrder = useCallback(async (order: OrderRecord, status: ServiceOrderStatus, mechanicIds: string[]) => {
    const deductStockOnlyWhenStarted = workshopSettings?.deductStockOnlyWhenUsed !== false;
    const partsOfOrder = mergeParts((order.items ?? [])
      .filter((item) => item.type === "Peça" && item.productId)
      .map((item) => ({ productId: item.productId!, quantity: item.quantity ?? 1 })));
    const reserved = (order.deductedItems ?? []) as ReservedPart[];
    const target = shouldReserveStock(status, deductStockOnlyWhenStarted, serviceOrderStatuses) ? partsOfOrder : [];
    await saveOrderWithStock(order.id, {
      status,
      tone: statusTone(status),
      mechanicIds,
      mechanic: users.find((user) => user.id === mechanicIds[0])?.name ?? order.mechanic,
      deductedItems: target,
    }, stockDeltas(target, reserved));
  }, [workshopSettings, users]);

  const dashboardCash = openSession(cashSessions);
  const dashboardDrawer = cashSummary(dashboardCash, { sales, orders, expenses, accounts }).expected;

  // A barra de endereços acompanha a navegação: /admin no painel administrativo,
  // / no resto. Quem abre /admin sem ser Super Admin volta para a raiz, em vez
  // de ficar com a URL prometendo uma tela que não vai abrir.
  useEffect(() => {
    const path = active === "Administração" && firebaseAdmin ? "/admin" : "/";
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
    setSelectedRecordId(recordId ?? "");
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
          {/*
            Configurações agora depende de `settings.view`, e não mais de ser
            Super Admin. Criar usuário e mexer na permissão dos outros continua
            só no Admin: são poderes diferentes, e antes vinham no mesmo pacote.
          */}
          {canSeeSettings || firebaseAdmin ? <div className="nav-divider"/> : null}
          {firebaseAdmin ? (
            <button className={`nav-item ${active === "Usuários e acessos" ? "active" : ""}`} onClick={() => { setActive("Usuários e acessos"); setMobileMenu(false); }}>
              <Icon name="users"/><span>Usuários e acessos</span>
            </button>
          ) : null}
          {canSeeSettings ? (
            <button className={`nav-item ${active === "Configurações" ? "active" : ""}`} onClick={() => { setActive("Configurações"); setMobileMenu(false); }}>
              <Icon name="settings"/><span>Configurações</span>
            </button>
          ) : null}
          {firebaseAdmin ? (
            <button className={`nav-item admin-link ${active === "Administração" ? "active" : ""}`} onClick={() => { setActive("Administração"); setMobileMenu(false); }}>
              <Icon name="shield"/><span>Administração</span><b>Admin</b>
            </button>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          {/*
            Este botão abria um aviso e mais nada. Ajuda que não responde nada é
            pior do que não ter: a pessoa clica, não acha, e não clica de novo.
          */}
          <button className="support-card" onClick={() => { setHelpTopicId(""); setHelpOpen(true); }}>
            <span className="support-icon">?</span>
            <div><strong>Precisa de ajuda?</strong><small>Como abrir OS, preço, estoque e caixa</small></div>
            <Icon name="arrow" size={16} />
          </button>
          <div className="user-card">
            <div className="avatar">{currentUserInitials}</div>
            <div><strong>{currentUserName}</strong><span>{firebaseSession.profile?.role}</span></div>
            <button aria-label="Opções do perfil" onClick={() => setShowProfile(!showProfile)}>•••</button>
          </div>
          {showProfile ? <div className="profile-menu"><div><strong>{currentUserName}</strong><span>{firebaseSession.profile?.role}</span></div>{canSeeSettings ? <button onClick={() => { setActive("Configurações"); setShowProfile(false); }}>Configurações da oficina</button> : null}<button onClick={() => { setShowProfile(false); void firebaseSession.logout(); }}>Sair do sistema</button></div> : null}
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
            <button className="dashboard-money-card cash" onClick={() => openDialog("cash")}><span className="money-card-icon"><Icon name="wallet"/></span><div><small>{dashboardCash ? "Dinheiro na gaveta" : "Saldo do caixa"}</small><strong>{formatBRL(dashboardCash ? dashboardDrawer : summary.cashBalance)}</strong><em>{dashboardCash ? `${dashboardCash.id} aberto ${dashboardCash.openedDate}` : "Caixa fechado · abra para começar o dia"}</em></div><Icon name="arrow" size={18}/></button>
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
                { label: "Aguardando peça", value: String(orders.filter((o) => o.status === "Aguardando peça").length), helper: "Serviço parado até a peça chegar" },
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
                  <thead><tr><th>OS / Cliente</th><th className="col-secondary">Motocicleta</th><th className="col-secondary">Mecânico</th><th className="col-secondary">Entrada</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {orders.length ? orders.map((order) => (
                      <tr key={order.id}>
                        <td><strong className="order-id">{order.id}</strong><span>{order.customer}</span></td>
                        <td className="col-secondary"><strong>{order.bike}</strong><span className="plate">{order.plate}</span></td>
                        <td className="col-secondary"><span className="mechanic-avatar">{order.mechanic ? order.mechanic.slice(0, 1) : "M"}</span>{order.mechanic || "Não definido"}</td>
                        <td className="col-secondary">{order.time}</td>
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
            <ModuleWorkspace stockAdjustments={stockAdjustments} active={active} canOperate={canOperate} canCreateOrders={canCreateOrders} firebaseConnected={firebaseEnabled} currentFirebaseUser={firebaseSession.user} openFirebaseAccess={() => notify("Sua sessão está conectada ao Firebase.")} openDialog={openDialog} notify={notify} navigate={setActive} expenses={expenses} users={users} setUsers={setUsers} partners={partners} setPartners={setPartners} quickServices={quickServices} setQuickServices={setQuickServices} categories={categories} setCategories={setCategories} suppliers={suppliers} setSuppliers={setSuppliers} paymentMachines={paymentMachines} setPaymentMachines={setPaymentMachines} paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods} orders={orders} products={products} clients={clients} motorcycles={motorcycles} cart={cart} setCart={setCart} discount={cartDiscount} setDiscount={setCartDiscount} sales={sales} accounts={accounts} cashSessions={cashSessions} movements={movements} viewerEmployeeId={firebaseSession.profile?.employeeId ?? ""} viewerIsMechanic={firebaseSession.profile?.role === "Mecânico"} onAdvanceOrder={advanceOrder} openSettings={openSettings} settingsTab={settingsTab} settings={workshopSettings}/>
          )}
        </div>
      </section>
      <AppDialog dialog={dialog} canOperate={canOperateDialog} step={osStep} setStep={setOsStep} close={() => setDialog(null)} finish={finishDialog} changeDialog={openDialog} onAddExpense={addExpense} users={users} partners={partners} quickServices={quickServices} categories={categories} suppliers={suppliers} paymentMachines={paymentMachines} paymentMethods={paymentMethods} products={products} clients={clients} motorcycles={motorcycles} orders={orders} expenses={expenses} notify={notify} cart={cart} setCart={setCart} discount={cartDiscount} setDiscount={setCartDiscount} sales={sales} stockEntries={stockEntries} accounts={accounts} cashSessions={cashSessions} movements={movements} lists={systemLists} settings={workshopSettings} currentUser={firebaseSession.user} selectedRecordId={selectedRecordId} osPrefix={workshopSettings?.osPrefix ?? "OS"} canManageCustomers={canManageCustomers}/>
      {helpOpen ? (
        <div className="dialog-layer" role="presentation" onMouseDown={(evento) => evento.target === evento.currentTarget && setHelpOpen(false)}>
          <section className="dialog dialog-wide help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <header className="dialog-header">
              <div><span>Central de ajuda</span><h2 id="help-title">Como fazer as coisas no sistema</h2><p>Escrito para o dia a dia da oficina, não para quem programa.</p></div>
              <button aria-label="Fechar" onClick={() => setHelpOpen(false)}>×</button>
            </header>
            <div className="dialog-body help-body">
              {(() => {
                const assunto = helpTopic(helpTopicId);
                if (assunto) return (
                  <div className="help-detail">
                    <button className="help-back" onClick={() => setHelpTopicId("")}>← Todos os assuntos</button>
                    <h3>{assunto.title}</h3>
                    <p className="help-summary">{assunto.summary}</p>
                    <ol className="help-steps">
                      {assunto.steps.map((passo) => (
                        <li key={passo.title}><strong>{passo.title}</strong><span>{passo.detail}</span></li>
                      ))}
                    </ol>
                    <button className="primary-button" onClick={() => { setHelpOpen(false); goToSearchResult(assunto.destination); }}>
                      Ir para {assunto.destination}<Icon name="arrow" size={16}/>
                    </button>
                  </div>
                );
                const achados = searchHelp(helpSearch);
                return (
                  <>
                    <label className="mini-search help-search"><Icon name="search" size={17}/><input value={helpSearch} onChange={(evento) => setHelpSearch(evento.target.value)} placeholder="O que você quer fazer? Ex.: sangria, desconto, parceira"/></label>
                    {achados.length ? (
                      <div className="help-list">
                        {achados.map((assuntoDaLista) => (
                          <button key={assuntoDaLista.id} onClick={() => setHelpTopicId(assuntoDaLista.id)}>
                            <div><strong>{assuntoDaLista.title}</strong><small>{assuntoDaLista.summary}</small></div>
                            <span className="help-steps-count">{assuntoDaLista.steps.length} passos</span>
                            <Icon name="arrow" size={16}/>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="help-empty"><Icon name="search" size={18}/><span>Nada encontrado com "{helpSearch.trim()}". Tente por outra palavra — OS, preço, estoque, caixa, parceira ou acesso.</span></div>
                    )}
                  </>
                );
              })()}
            </div>
            <footer className="dialog-footer"><button className="ghost-button" onClick={() => setHelpOpen(false)}>Fechar</button></footer>
          </section>
        </div>
      ) : null}
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

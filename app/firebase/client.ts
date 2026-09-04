import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  type User,
  connectAuthEmulator,
} from "firebase/auth";
import { withoutUndefined } from "../../src/firestore-data";
import {
  connectFirestoreEmulator,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { allFirebasePermissions, defaultPermissionsForRole, type FirebasePermission, type UserRole } from "../../src/types";
import { costAfterEntry, toAmount } from "../../src/inventory";
import { BACKUP_COLLECTIONS } from "../../src/backup";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

// As variáveis abaixo NÃO têm valor padrão de propósito: um ambiente sem essas
// variáveis configuradas deve falhar de forma clara em vez de silenciosamente
// conectar no projeto Firebase de produção. Configure-as em .env (veja
// .env.example) ou nas variáveis de servidor do Google AI Studio.
const envFirebaseConfig: Partial<FirebaseWebConfig> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function resolveFirebaseConfig(): FirebaseWebConfig {
  const missing = (Object.keys(envFirebaseConfig) as (keyof FirebaseWebConfig)[]).filter((key) => !envFirebaseConfig[key]);
  if (missing.length) {
    const varNames = missing.map((key) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);
    throw new Error(`Configuração do Firebase incompleta. Defina no ambiente: ${varNames.join(", ")}. Veja .env.example e CONFIGURAR-FIREBASE.md.`);
  }
  return envFirebaseConfig as FirebaseWebConfig;
}

export type FirebaseUserSummary = {
  uid: string;
  email: string;
  displayName: string;
};

export type { FirebasePermission };
export { allFirebasePermissions };
export const defaultFirebasePermissions = defaultPermissionsForRole;

export type FirebaseAccessProfile = {
  uid: string;
  employeeId: string;
  name: string;
  role: UserRole;
  active: boolean;
  permissions: FirebasePermission[];
  /**
   * Marcado pelo backend administrativo quando o Super Admin cria a conta ou
   * redefine a senha. Enquanto for true o app só mostra a tela de troca de
   * senha — é o que impede a senha temporária de 6 dígitos de virar a senha
   * definitiva do funcionário.
   */
  mustChangePassword: boolean;
};

export type FirebaseManagedUser = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: FirebaseAccessProfile["role"];
  employeeId: string;
  active: boolean;
  hasAuthAccount: boolean;
  hasAccessProfile: boolean;
  permissions: FirebasePermission[];
  lastSignInAt: string;
};

export type ManagedUserInput = {
  name: string;
  email: string;
  phone: string;
  role: FirebaseAccessProfile["role"];
  employeeId: string;
  active?: boolean;
  permissions: FirebasePermission[];
};

export type ManagedUserOperation = {
  user?: FirebaseManagedUser;
  mode: "cloud" | "fallback" | "reset-email";
};

type EmployeeLike = {
  id: string;
  baseSalary: number;
  paymentDay: number;
};

let persistenceReady: Promise<void> | null = null;

/**
 * Aponta o app para o emulador do Firebase, quando VITE_FIREBASE_EMULATOR=1.
 *
 * É o que permite exercitar os fluxos de verdade — abrir caixa, vender, baixar
 * estoque, fechar — contra um banco real e com as regras de firestore.rules
 * carregadas, sem tocar nos dados da oficina. Em produção a variável não
 * existe e nada disto roda.
 */
let emulatorReady = false;
function connectEmulators(auth: ReturnType<typeof getAuth>, db: ReturnType<typeof getFirestore>) {
  if (emulatorReady || import.meta.env.VITE_FIREBASE_EMULATOR !== "1") return;
  emulatorReady = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

function services() {
  if (typeof window === "undefined") throw new Error("Firebase está disponível somente no navegador.");
  const app = getApps().length ? getApp() : initializeApp(resolveFirebaseConfig());
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectEmulators(auth, db);
  if (!persistenceReady) persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  return { app, auth, db };
}

export const firebaseProjectId = envFirebaseConfig.projectId ?? "";

export function firebaseErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "E-mail ou senha inválidos.";
  if (code.includes("too-many-requests")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (code.includes("network-request-failed") || code.includes("unavailable")) return "Sem conexão com o Firebase. Confira a internet.";
  if (code.includes("permission-denied")) return "A conta entrou, mas ainda não possui permissão no banco de dados.";
  if (code.includes("operation-not-allowed")) return "Ative o login por e-mail e senha no Firebase Authentication.";
  if (code.includes("unauthorized-domain")) return "Este domínio ainda não está autorizado no Firebase Authentication.";
  if (code.includes("user-disabled")) return "Esta conta foi desativada pelo administrador.";
  if (code.includes("email-already-in-use")) return "Este e-mail já está sendo usado por outro usuário.";
  if (code.includes("invalid-email")) return "Informe um endereço de e-mail válido.";
  if (code.includes("weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (code.includes("requires-recent-login")) return "Por segurança, entre novamente no sistema antes de trocar a senha.";
  if (code.includes("unauthenticated")) return "Sua sessão expirou. Entre novamente para continuar.";
  if (code.includes("admin/configuration")) return "Configure a credencial do Firebase Admin nas variáveis protegidas do ambiente.";
  if (code.includes("admin/internal")) return "O backend administrativo não conseguiu concluir a operação. Confira os logs do ambiente.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação no Firebase.";
}

function summarizeUser(user: User | null): FirebaseUserSummary | null {
  if (!user) return null;
  return { uid: user.uid, email: user.email ?? "", displayName: user.displayName?.trim() || "Usuário" };
}

export function observeFirebaseAuth(
  callback: (user: FirebaseUserSummary | null) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const { auth } = services();
  return onAuthStateChanged(
    auth,
    (user) => callback(summarizeUser(user)),
    (error) => onError?.(error),
  );
}

export async function signInFirebase(email: string, password: string) {
  const { auth } = services();
  if (persistenceReady) await persistenceReady;
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return summarizeUser(credential.user);
}

export async function signOutFirebase() {
  const { auth } = services();
  await signOut(auth);
}

export async function requestFirebasePasswordReset(email: string) {
  const { auth } = services();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Informe seu e-mail para recuperar a senha.");
  await sendPasswordResetEmail(auth, normalizedEmail);
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Troca a senha do usuário que está logado. Diferente de setManagedUserPassword
 * (que é o Super Admin redefinindo a senha de outra pessoa pelo Admin SDK),
 * aqui quem troca é o próprio dono da conta: o Firebase exige a senha atual
 * para reautenticar antes de aceitar a nova.
 *
 * Ao final baixa a flag mustChangePassword no perfil de acesso — as regras do
 * Firestore permitem que cada usuário altere exatamente esse campo no próprio
 * documento, e nada além dele.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const { auth, db } = services();
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) throw new Error("Entre no sistema para trocar a senha.");
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new Error(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (/^\d+$/.test(newPassword)) throw new Error("Escolha uma senha com letras e números, não apenas números.");
  if (newPassword === currentPassword) throw new Error("A nova senha precisa ser diferente da senha temporária.");

  await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, currentPassword));
  await updatePassword(currentUser, newPassword);

  try {
    await setDoc(doc(db, "userAccess", currentUser.uid), {
      mustChangePassword: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    // A senha já foi trocada no Authentication; se a baixa da flag falhar, o
    // usuário veria a tela de troca de novo sem entender o motivo.
    handleFirestoreError(error, OperationType.WRITE, `userAccess/${currentUser.uid}`);
  }
}

export async function bootstrapCurrentUserAsSuperAdmin() {
  const { auth } = services();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Entre no sistema para continuar.");
  const response = await fetch("/api/setup/bootstrap", {
    method: "POST",
    headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
  });
  const payload = await response.json().catch(() => ({})) as { data?: { success?: boolean }; error?: { message?: string; code?: string } };
  if (!response.ok || !payload.data?.success) {
    const error = new Error(payload.error?.message || "Não foi possível configurar o primeiro administrador.") as Error & { code?: string };
    error.code = payload.error?.code || "bootstrap-failed";
    throw error;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const { auth } = services();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function observeAccessProfile(uid: string, callback: (profile: FirebaseAccessProfile | null) => void, onError: (error: unknown) => void): Unsubscribe {
  const { auth, db } = services();
  let userDoc: DocumentData | null = null;
  let accessDoc: DocumentData | null = null;
  let userLoaded = false;
  let accessLoaded = false;

  const isBootstrapAdmin = (auth.currentUser?.email || "").toLowerCase() === "matheus2713.m@gmail.com";

  const emit = () => {
    if (!userLoaded || !accessLoaded) return;
    if (!userDoc && !accessDoc) {
      if (isBootstrapAdmin) {
        callback({
          uid,
          employeeId: "",
          name: auth.currentUser?.displayName?.trim() || "Matheus (Super Admin)",
          role: "Super Admin",
          active: true,
          permissions: [...allFirebasePermissions],
          mustChangePassword: false,
        });
        return;
      }
      return callback(null);
    }

    // Priority: 1. users/{uid}.name, 2. userAccess/{uid}.name, 3. user.displayName, 4. "Usuário"
    const resolvedName = (typeof userDoc?.name === "string" ? userDoc.name.trim() : "")
      || (typeof accessDoc?.name === "string" ? accessDoc.name.trim() : "")
      || auth.currentUser?.displayName?.trim()
      || (isBootstrapAdmin ? "Matheus (Super Admin)" : "Usuário");

    const role = (isBootstrapAdmin ? "Super Admin" : ((accessDoc?.role || userDoc?.role) ?? "Mecânico")) as FirebaseAccessProfile["role"];
    const employeeId = String(accessDoc?.employeeId ?? userDoc?.employeeId ?? "");
    const active = accessDoc ? accessDoc.active !== false : (userDoc ? userDoc.active !== false : true);
    const rawPermissions = isBootstrapAdmin ? allFirebasePermissions : (accessDoc?.permissions ?? userDoc?.permissions);
    const permissions = Array.isArray(rawPermissions)
      ? rawPermissions.filter((item): item is FirebasePermission => allFirebasePermissions.includes(item))
      : defaultFirebasePermissions(role);

    callback({
      uid,
      employeeId,
      name: resolvedName,
      role,
      active,
      permissions,
      // Só o perfil de acesso carrega a flag: o documento em users/ é só o
      // cadastro, quem controla credencial é userAccess/.
      mustChangePassword: accessDoc?.mustChangePassword === true,
    });
  };

  const stopUser = onSnapshot(doc(db, "users", uid), (snapshot) => {
    userLoaded = true;
    userDoc = snapshot.exists() ? snapshot.data() : null;
    emit();
  }, (err) => {
    userLoaded = true;
    userDoc = null;
    console.warn("Could not load users doc", err);
    emit();
  });

  const stopAccess = onSnapshot(doc(db, "userAccess", uid), (snapshot) => {
    accessLoaded = true;
    accessDoc = snapshot.exists() ? snapshot.data() : null;
    emit();
  }, (err) => {
    accessLoaded = true;
    accessDoc = null;
    if (!userDoc && !isBootstrapAdmin) {
      try {
        handleFirestoreError(err, OperationType.GET, `userAccess/${uid}`);
      } catch (formatted) {
        onError(formatted);
      }
    } else {
      emit();
    }
  });

  return () => {
    stopUser();
    stopAccess();
  };
}

function cleanDocument<T>(id: string, data: DocumentData): T {
  const record = { ...data };
  delete record.createdAt;
  delete record.updatedAt;
  return { id, ...record } as T;
}

export function observeCollection<T extends { id: string }>(name: string, callback: (records: T[]) => void, onError: (error: unknown) => void): Unsubscribe {
  const { db } = services();
  return onSnapshot(collection(db, name), (snapshot) => {
    const records = snapshot.docs.map((item) => cleanDocument<T>(item.id, item.data()));
    callback(records.sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true })));
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.LIST, name);
    } catch (formatted) {
      onError(formatted);
    }
  });
}

export async function replaceCollection<T extends { id: string }>(name: string, records: T[]) {
  const { db } = services();
  const reference = collection(db, name);
  try {
    const current = await getDocs(reference);
    const ids = new Set(records.map((record) => record.id));
    const batch = writeBatch(db);
    current.docs.forEach((item) => { if (!ids.has(item.id)) batch.delete(item.ref); });
    records.forEach((record) => {
      const { id, ...data } = record;
      batch.set(doc(reference, id), { ...withoutUndefined(data), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, name);
  }
}

// Escreve só os registros que mudaram (`changed`) e apaga só os removidos
// (`deletedIds`), em vez de ler e regravar a coleção inteira a cada edição
// local (era o que `replaceCollection` fazia sempre que qualquer campo de
// qualquer registro mudava). Quem chama já sabe o que mudou porque compara
// contra o último snapshot recebido do Firestore — ver useFirebaseSyncedCollection.
export async function syncCollectionDiff<T extends { id: string }>(name: string, changed: T[], deletedIds: string[]) {
  if (!changed.length && !deletedIds.length) return;
  const { db } = services();
  const reference = collection(db, name);
  try {
    const batch = writeBatch(db);
    deletedIds.forEach((id) => batch.delete(doc(reference, id)));
    changed.forEach((record) => {
      const { id, ...data } = record;
      batch.set(doc(reference, id), { ...withoutUndefined(data), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, name);
  }
}

function normalizeEmployeeData<T extends EmployeeLike>(id: string, raw: DocumentData): T {
  const data = cleanDocument<T>(id, raw) as unknown as Record<string, unknown>;
  const isMech = data.isMechanic === true
    || data.isResponsibleMechanic === true
    || data.canReceiveServiceOrders === true
    || (typeof data.position === "string" && (data.position.toLowerCase().includes("mecanic") || data.position.toLowerCase().includes("mecânic")))
    || (typeof data.role === "string" && (data.role.toLowerCase().includes("mecanic") || data.role.toLowerCase().includes("mecânic") || data.role === "mechanic"))
    || (typeof data.jobTitle === "string" && (data.jobTitle.toLowerCase().includes("mecanic") || data.jobTitle.toLowerCase().includes("mecânic") || data.jobTitle === "mechanic"));

  const isResp = data.isResponsibleMechanic === true
    || (typeof data.position === "string" && (data.position.toLowerCase().includes("responsável") || data.position.toLowerCase().includes("responsavel") || data.position.toLowerCase().includes("dono")));

  const active = data.active !== false && data.status !== "Inativo" && data.status !== "inactive";

  const rawPosition = data.position || data.jobTitle || (isMech ? "Mecânico" : "Atendente de Balcão");
  const position = String(rawPosition);

  return {
    ...data,
    id,
    name: String(data.name || data.displayName || "Funcionário"),
    position,
    role: data.role || (isMech ? "Mecânico" : (position.includes("Balcão") ? "Balcão" : "Super Admin")),
    phone: String(data.phone || data.whatsapp || ""),
    document: String(data.document || data.cpf || ""),
    active,
    isMechanic: isMech,
    isResponsibleMechanic: isResp,
    canReceiveServiceOrders: isMech,
    canManageAllOrders: Boolean(data.canManageAllOrders || data.canManageOrders || isResp),
    employmentType: data.employmentType === "Avulso" ? "Avulso" : "Fixo",
    currentOrders: Number(data.currentOrders || 0),
    serviceCommission: Number(data.serviceCommission ?? (isMech ? 10 : 0)),
    productCommission: Number(data.productCommission ?? 0),
  } as unknown as T;
}

export function observeEmployees<T extends EmployeeLike>(includeCompensation: boolean, callback: (records: T[]) => void, onError: (error: unknown) => void): Unsubscribe {
  const { db } = services();
  let employees: Array<Omit<T, "baseSalary" | "paymentDay"> & { id: string }> = [];
  let compensation = new Map<string, { baseSalary: number; paymentDay: number }>();
  const emit = () => callback(employees.map((employee) => ({
    ...employee,
    baseSalary: compensation.get(employee.id)?.baseSalary ?? 0,
    paymentDay: compensation.get(employee.id)?.paymentDay ?? 5,
  }) as T).sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true })));
  const stopEmployees = onSnapshot(collection(db, "employees"), (snapshot) => {
    employees = snapshot.docs.map((item) => normalizeEmployeeData<T>(item.id, item.data()));
    emit();
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.LIST, "employees");
    } catch (formatted) {
      onError(formatted);
    }
  });
  const stopCompensation = includeCompensation ? onSnapshot(collection(db, "employeeCompensation"), (snapshot) => {
    compensation = new Map(snapshot.docs.map((item) => [item.id, {
      baseSalary: Number(item.data().baseSalary ?? 0),
      paymentDay: Number(item.data().paymentDay ?? 5),
    }]));
    emit();
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.LIST, "employeeCompensation");
    } catch (formatted) {
      onError(formatted);
    }
  }) : () => undefined;
  return () => { stopEmployees(); stopCompensation(); };
}

export async function replaceEmployees<T extends EmployeeLike>(records: T[]) {
  const { db } = services();
  const employeeReference = collection(db, "employees");
  const compensationReference = collection(db, "employeeCompensation");
  try {
    const [currentEmployees, currentCompensation] = await Promise.all([getDocs(employeeReference), getDocs(compensationReference)]);
    const ids = new Set(records.map((record) => record.id));
    const batch = writeBatch(db);
    currentEmployees.docs.forEach((item) => { if (!ids.has(item.id)) batch.delete(item.ref); });
    currentCompensation.docs.forEach((item) => { if (!ids.has(item.id)) batch.delete(item.ref); });
    records.forEach((record) => {
      const { id, baseSalary, paymentDay, ...publicData } = record;
      batch.set(doc(employeeReference, id), { ...withoutUndefined(publicData), updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(compensationReference, id), { ...withoutUndefined({ baseSalary, paymentDay }), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "employees");
  }
}

// Equivalente a syncCollectionDiff, mas para o par employees/employeeCompensation.
export async function syncEmployeesDiff<T extends EmployeeLike>(changed: T[], deletedIds: string[]) {
  if (!changed.length && !deletedIds.length) return;
  const { db } = services();
  const employeeReference = collection(db, "employees");
  const compensationReference = collection(db, "employeeCompensation");
  try {
    const batch = writeBatch(db);
    deletedIds.forEach((id) => {
      batch.delete(doc(employeeReference, id));
      batch.delete(doc(compensationReference, id));
    });
    changed.forEach((record) => {
      const { id, baseSalary, paymentDay, ...publicData } = record;
      batch.set(doc(employeeReference, id), { ...withoutUndefined(publicData), updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(compensationReference, id), { ...withoutUndefined({ baseSalary, paymentDay }), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "employees");
  }
}

// O payload é inferido do próprio objeto passado pelo formulário. A assinatura
// antiga (`<T extends { id: string }>` recebendo `Partial<T>`) fazia o
// TypeScript inferir T como `{ id: string }` em todas as chamadas — nenhum
// formulário passa o tipo explicitamente —, e aí qualquer campo real do
// cadastro virava "propriedade desconhecida". Eram 7 dos erros de typecheck.
export async function saveFirestoreDoc<T extends Record<string, unknown>>(collectionName: string, id: string, data: T) {
  const { db } = services();
  const cleanData: Record<string, unknown> = { ...data };
  delete cleanData.id;
  try {
    await setDoc(doc(db, collectionName, id), { ...withoutUndefined(cleanData), updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
  }
}

/**
 * Cria a ordem de serviço com o próximo número livre da sequência.
 *
 * A numeração não vem de settings/global.nextOsNumber de propósito: as regras
 * do Firestore só deixam o Super Admin escrever em settings, então um usuário
 * de Balcão não conseguiria incrementar o contador ao abrir uma OS. O próximo
 * número sai da maior OS já existente, e antes de gravar conferimos se o
 * documento está livre — se duas pessoas abrirem uma OS no mesmo instante, a
 * segunda avança para o número seguinte em vez de sobrescrever a primeira
 * (setDoc com merge não reclamaria da colisão).
 */
export async function createServiceOrder(prefix: string, startNumber: number, data: Record<string, unknown>) {
  const { db } = services();
  const safePrefix = (prefix || "OS").trim().replace(/-+$/, "") || "OS";
  try {
    for (let number = Math.max(1, startNumber); number < startNumber + 50; number += 1) {
      const id = `${safePrefix}-${String(number).padStart(4, "0")}`;
      const reference = doc(db, "serviceOrders", id);
      if ((await getDoc(reference)).exists()) continue;
      await setDoc(reference, { ...withoutUndefined(data), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "serviceOrders");
  }
  throw new Error("Não foi possível gerar um número livre para a ordem de serviço. Tente novamente.");
}

/**
 * Grava a venda e a baixa de estoque no MESMO lote.
 *
 * Os dois precisam acontecer juntos: uma venda registrada sem a baixa deixa o
 * estoque mentindo, e uma baixa sem a venda tira a peça da prateleira sem o
 * dinheiro entrar. Como writeBatch é atômico, se o usuário não tiver permissão
 * para escrever em products a venda inteira falha com um erro claro, em vez de
 * gravar metade.
 */
export async function recordSale(
  saleId: string,
  sale: Record<string, unknown>,
  stockUpdates: Array<{ productId: string; quantity: number }>,
) {
  const { db } = services();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", saleId), { ...withoutUndefined(sale), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    stockUpdates.forEach(({ productId, quantity }) => {
      // increment() em vez de gravar (estoque - vendido): a quantidade que o
      // carrinho conhece foi lida quando o item entrou na venda e pode estar
      // velha. Duas vendas simultâneas da mesma peça, gravando valor absoluto,
      // fariam a segunda desfazer a baixa da primeira.
      batch.set(doc(db, "products", productId), { stock: increment(-quantity), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "sales");
  }
}

/**
 * Registra uma entrada de estoque: soma a quantidade e recalcula o custo de
 * cada peça.
 *
 * Usa runTransaction, e não writeBatch, porque o custo médio depende do estoque
 * e do custo que estão gravados AGORA — a transação lê e grava no mesmo passo
 * atômico. Com um batch, duas entradas simultâneas da mesma peça leriam o mesmo
 * custo antigo e a segunda apagaria a média da primeira.
 */
/**
 * Grava um ajuste de estoque.
 *
 * Diferente da entrada de compra em duas coisas que importam:
 *
 * 1. O saldo é DEFINIDO, não somado. O ajuste vem de uma contagem — "tem 8 na
 *    prateleira" —, e somar a diferença sobre um saldo que mudou entre abrir a
 *    tela e confirmar deixaria o número errado de novo.
 * 2. O custo NÃO muda. Ajuste é correção de quantidade, não compra: mexer no
 *    custo médio aqui faria uma perda de estoque baratear a peça.
 *
 * Tudo numa transação: o saldo e o registro do ajuste entram juntos ou não
 * entram. Estoque corrigido sem o papel que explica por quê é exatamente o que
 * faz ninguém confiar no número.
 */
export async function recordStockAdjustment(
  adjustmentId: string,
  adjustment: Record<string, unknown>,
  items: Array<{ productId: string; contado: number }>,
) {
  const { db } = services();
  try {
    await runTransaction(db, async (transaction) => {
      const references = items.map((item) => doc(db, "products", item.productId));
      // Todas as leituras antes de qualquer escrita: é exigência do Firestore.
      const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists()) throw new Error(`A peça ${items[index]!.productId} não existe mais no cadastro.`);
        transaction.set(references[index]!, {
          stock: items[index]!.contado,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      transaction.set(doc(db, "stockAdjustments", adjustmentId), {
        ...withoutUndefined(adjustment),
        createdAt: serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stockAdjustments/${adjustmentId}`);
  }
}

export async function recordStockEntry(
  entryId: string,
  entry: Record<string, unknown>,
  items: Array<{ productId: string; quantity: number; unitCost: number }>,
  useAverageCost: boolean,
) {
  const { db } = services();
  try {
    await runTransaction(db, async (transaction) => {
      const references = items.map((item) => doc(db, "products", item.productId));
      // Todas as leituras antes de qualquer escrita: é exigência do Firestore.
      const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));

      snapshots.forEach((snapshot, index) => {
        const item = items[index]!;
        const data = snapshot.data() ?? {};
        const currentStock = toAmount(data.stock);
        const currentCost = toAmount(data.cost);
        const newCost = costAfterEntry(useAverageCost, currentStock, currentCost, item.quantity, item.unitCost);
        transaction.set(references[index]!, {
          stock: currentStock + item.quantity,
          // O cadastro de produto grava o custo como texto em reais
          // ("R$ 12,50"); gravar número aqui deixaria os dois formatos
          // convivendo na mesma coleção e quebraria quem lê com parseBRL.
          cost: newCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      transaction.set(doc(db, "stockEntries", entryId), {
        ...withoutUndefined(entry),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "stockEntries");
  }
}

/**
 * Grava a OS e a baixa (ou devolução) das peças no mesmo lote.
 *
 * `deltas` positivos tiram do estoque, negativos devolvem — é o que acontece
 * quando uma peça sai da ordem ou quando a OS volta para orçamento. Usa
 * increment pelo mesmo motivo da venda no PDV: a quantidade lida na tela pode
 * estar velha, e gravar valor absoluto faria uma operação apagar a outra.
 */
export async function saveOrderWithStock(
  orderId: string,
  order: Record<string, unknown>,
  deltas: Array<{ productId: string; quantity: number }>,
) {
  const { db } = services();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "serviceOrders", orderId), { ...withoutUndefined(order), updatedAt: serverTimestamp() }, { merge: true });
    deltas.forEach(({ productId, quantity }) => {
      batch.set(doc(db, "products", productId), { stock: increment(-quantity), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceOrders/${orderId}`);
  }
}

/**
 * Grava a importação da planilha de estoque.
 *
 * As peças novas recebem um número livre da sequência — mesma busca usada nas
 * contas e na OS, e pelo mesmo motivo: a lista carregada na tela pode estar
 * velha e `set` não reclama de colisão, ele sobrescreve.
 *
 * Um batch do Firestore aceita no máximo 500 escritas, e uma planilha de
 * oficina passa disso com facilidade, então a gravação vai em blocos. Isso
 * abre mão da atomicidade, e a saída para isso é a importação ser repetível:
 * a quantidade da planilha substitui a do estoque em vez de somar, e a peça
 * criada no bloco que passou é reconhecida como já cadastrada na segunda
 * tentativa (casa por código de barras ou nome). Ou seja, se cair no meio,
 * basta importar o mesmo arquivo de novo — o erro diz quantas peças já
 * entraram para a pessoa não ficar no escuro.
 *
 * A atualização mexe só no que veio preenchido na planilha. Quem exportou o
 * estoque só com nome e quantidade para fazer a contagem não deveria voltar
 * com preço, categoria e fornecedor apagados.
 */
const IMPORT_BATCH_SIZE = 400;

export async function saveImportedProducts(
  create: Array<Record<string, unknown>>,
  update: Array<{ id: string; data: Record<string, unknown> }>,
) {
  if (!create.length && !update.length) return { created: [] as string[], updated: [] as string[] };
  const { db } = services();
  let written = 0;
  try {
    // Procura os códigos livres antes de gravar qualquer coisa: se faltar
    // código, nada foi escrito ainda e a pessoa pode tentar de novo limpo.
    const ids: string[] = [];
    for (let number = 1; ids.length < create.length && number <= 20000; number += 1) {
      const id = `PRD-${String(number).padStart(3, "0")}`;
      if ((await getDoc(doc(db, "products", id))).exists()) continue;
      ids.push(id);
    }
    if (ids.length < create.length) throw new Error("Não foi possível gerar o código das peças novas. Tente novamente.");

    const writes = [
      ...create.map((data, index) => ({ id: ids[index]!, data: { ...data, code: data.code || ids[index]!, createdAt: serverTimestamp() }, merge: false })),
      ...update.map(({ id, data }) => ({ id, data, merge: true })),
    ];

    for (let start = 0; start < writes.length; start += IMPORT_BATCH_SIZE) {
      const batch = writeBatch(db);
      const block = writes.slice(start, start + IMPORT_BATCH_SIZE);
      block.forEach(({ id, data, merge }) => {
        batch.set(doc(db, "products", id), { ...withoutUndefined(data), updatedAt: serverTimestamp() }, { merge });
      });
      await batch.commit();
      written += block.length;
    }
    return { created: ids, updated: update.map((item) => item.id) };
  } catch (error) {
    if (written > 0) {
      throw new Error(`A importação parou depois de gravar ${written} peça(s). Importe o mesmo arquivo de novo: as peças que já entraram serão reconhecidas e apenas atualizadas.`);
    }
    handleFirestoreError(error, OperationType.WRITE, "products");
  }
}

/**
 * Grava as parcelas de um lançamento de conta em um lote só.
 *
 * Parcelas separadas em gravações independentes deixariam a oficina com metade
 * do parcelamento no banco se a conexão caísse no meio.
 */
export async function saveAccounts(prefix: string, startNumber: number, accounts: Array<Record<string, unknown>>) {
  if (!accounts.length) return [] as string[];
  const { db } = services();
  const safePrefix = (prefix || "CT").trim().replace(/-+$/, "") || "CT";
  try {
    // Procura números livres antes de gravar. A tela só enxerga as contas se o
    // usuário tiver permissão de ver o financeiro — quem opera só o PDV recebe
    // a lista vazia, a sequência recomeçaria do 1 e o batch sobrescreveria uma
    // conta existente sem reclamar.
    const ids: string[] = [];
    let number = Math.max(1, startNumber);
    for (let attempts = 0; ids.length < accounts.length && attempts < accounts.length + 60; attempts += 1) {
      const id = `${safePrefix}-${String(number).padStart(4, "0")}`;
      number += 1;
      if ((await getDoc(doc(db, "accounts", id))).exists()) continue;
      ids.push(id);
    }
    if (ids.length < accounts.length) throw new Error("Não foi possível gerar a numeração das contas. Tente novamente.");

    const batch = writeBatch(db);
    accounts.forEach((data, index) => {
      batch.set(doc(db, "accounts", ids[index]!), { ...withoutUndefined(data), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    await batch.commit();
    return ids;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "accounts");
  }
}

/**
 * Lê todas as coleções da oficina para a cópia de segurança.
 *
 * Uma coleção que falhar (falta de permissão, por exemplo) não derruba o
 * backup inteiro: ela é reportada e o resto é salvo. Um backup com 17 das 18
 * coleções vale infinitamente mais que nenhum — e a tela avisa o que faltou,
 * para a pessoa saber o que NÃO está protegido.
 */
export async function readAllCollections(): Promise<{ data: Record<string, Array<Record<string, unknown>>>; failed: string[] }> {
  const { db } = services();
  const data: Record<string, Array<Record<string, unknown>>> = {};
  const failed: string[] = [];

  for (const name of BACKUP_COLLECTIONS) {
    try {
      const snapshot = await getDocs(collection(db, name));
      data[name] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    } catch {
      failed.push(name);
    }
  }
  return { data, failed };
}

/**
 * Grava uma movimentação de dinheiro lançada à mão.
 *
 * Numeração pela busca do próximo número livre, como nas contas e na OS: a
 * lista carregada na tela pode estar velha, e `set` sobrescreveria o
 * lançamento de outra pessoa sem reclamar.
 */
export async function recordMovement(data: Record<string, unknown>) {
  const { db } = services();
  try {
    for (let number = 1; number < 100000; number += 1) {
      const id = `MOV-${String(number).padStart(4, "0")}`;
      const reference = doc(db, "movements", id);
      if ((await getDoc(reference)).exists()) continue;
      await setDoc(reference, { ...withoutUndefined(data), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "movements");
  }
  throw new Error("Não foi possível gerar o número da movimentação. Tente novamente.");
}

/**
 * Abre o caixa do dia.
 *
 * Antes de gravar, confere no servidor se já não existe uma sessão aberta —
 * a lista carregada na tela pode estar velha, e duas sessões abertas fariam a
 * mesma venda ser contada nas duas, com nenhuma das duas conferências
 * fechando. Sobra uma janela mínima entre a consulta e a escrita: se duas
 * pessoas abrirem o caixa no mesmo segundo, em máquinas diferentes, as duas
 * passam. É pouco provável numa oficina (quem abre o caixa é uma pessoa só,
 * de manhã), e a tela mostra a sessão aberta com quem a abriu, então dá para
 * perceber e fechar a duplicada.
 */
export async function openCashSession(data: Record<string, unknown>) {
  const { db } = services();
  try {
    const existing = await getDocs(query(collection(db, "cashSessions"), where("status", "==", "aberto")));
    if (!existing.empty) throw new Error("Já existe um caixa aberto. Feche o caixa atual antes de abrir outro.");

    for (let number = 1; number < 10000; number += 1) {
      const id = `CX-${String(number).padStart(4, "0")}`;
      const reference = doc(db, "cashSessions", id);
      if ((await getDoc(reference)).exists()) continue;
      await setDoc(reference, { ...withoutUndefined(data), status: "aberto", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return id;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "cashSessions");
  }
  throw new Error("Não foi possível gerar o número do caixa. Tente novamente.");
}

/**
 * Lança um suprimento ou uma sangria na sessão aberta.
 *
 * Transação, e não escrita direta, porque a movimentação é acrescentada à
 * lista que já está gravada: duas pessoas lançando ao mesmo tempo com a lista
 * lida na tela fariam uma apagar a outra. Também recusa lançamento em caixa
 * já fechado, que entraria numa conferência que a oficina já deu por encerrada.
 */
export async function addCashMovement(sessionId: string, movement: Record<string, unknown>) {
  const { db } = services();
  try {
    await runTransaction(db, async (transaction) => {
      const reference = doc(db, "cashSessions", sessionId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Este caixa não existe mais.");
      const data = snapshot.data() ?? {};
      if (data.status !== "aberto") throw new Error("Este caixa já foi fechado.");
      const movements = Array.isArray(data.movements) ? data.movements : [];
      transaction.set(reference, { movements: withoutUndefined([...movements, movement]), updatedAt: serverTimestamp() }, { merge: true });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `cashSessions/${sessionId}`);
  }
}

/**
 * Fecha o caixa com a conferência.
 *
 * Grava junto o que o sistema esperava e o que foi contado, porque a diferença
 * precisa continuar fazendo sentido meses depois — recalcular o esperado com
 * os dados de hoje daria outro número se algum lançamento antigo for corrigido.
 *
 * Recusa fechar duas vezes: o segundo fechamento sobrescreveria a conferência
 * do primeiro, apagando justamente o registro da falta que alguém precisava ver.
 */
export async function closeCashSession(sessionId: string, closing: Record<string, unknown>) {
  const { db } = services();
  try {
    await runTransaction(db, async (transaction) => {
      const reference = doc(db, "cashSessions", sessionId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Este caixa não existe mais.");
      if ((snapshot.data() ?? {}).status !== "aberto") throw new Error("Este caixa já foi fechado.");
      transaction.set(reference, { ...withoutUndefined(closing), status: "fechado", updatedAt: serverTimestamp() }, { merge: true });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `cashSessions/${sessionId}`);
  }
}

/**
 * Registra uma baixa (total ou parcial) em uma conta.
 *
 * Usa transação porque a baixa é acrescentada à lista que já está gravada: ler
 * a conta na tela e regravar a lista inteira faria duas baixas simultâneas
 * apagarem uma à outra. Também impede baixa acima do saldo, que viraria crédito
 * fantasma na conta.
 */
export async function settleAccount(accountId: string, settlement: Record<string, unknown>) {
  const { db } = services();
  try {
    await runTransaction(db, async (transaction) => {
      const reference = doc(db, "accounts", accountId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Esta conta não existe mais.");
      const data = snapshot.data() ?? {};
      const settlements = Array.isArray(data.settlements) ? data.settlements : [];
      const paid = settlements.reduce((total: number, item: { amount?: number }) => total + (Number(item?.amount) || 0), 0);
      const open = Math.max(0, Number(data.amount ?? 0) - paid);
      const amount = Number(settlement.amount) || 0;
      if (amount <= 0) throw new Error("Informe o valor da baixa.");
      if (amount > open + 0.005) throw new Error(`O valor da baixa passa do saldo em aberto (${open.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`);
      transaction.set(reference, {
        settlements: withoutUndefined([...settlements, settlement]),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `accounts/${accountId}`);
  }
}

export async function deleteFirestoreDoc(collectionName: string, id: string) {
  const { db } = services();
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
  }
}

export function observeFirestoreDoc<T>(collectionName: string, id: string, callback: (doc: T | null) => void, onError?: (error: unknown) => void): Unsubscribe {
  const { db } = services();
  return onSnapshot(doc(db, collectionName, id), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
    } else {
      callback(cleanDocument<T>(snapshot.id, snapshot.data()));
    }
  }, (error) => {
    if (onError) {
      try {
        handleFirestoreError(error, OperationType.GET, `${collectionName}/${id}`);
      } catch (formatted) {
        onError(formatted);
      }
    }
  });
}

function managedUserFromData(uid: string, data: DocumentData): FirebaseManagedUser {
  const role = (data.role ?? "Mecânico") as FirebaseAccessProfile["role"];
  const employeeId = String(data.employeeId ?? "");
  return {
    uid,
    name: String(data.name ?? "Usuário"),
    email: String(data.email ?? ""),
    phone: String(data.phone ?? ""),
    role,
    employeeId,
    active: data.active !== false,
    hasAuthAccount: data.hasAuthAccount !== false,
    hasAccessProfile: data.hasAccessProfile !== false,
    permissions: Array.isArray(data.permissions) ? data.permissions.filter((item): item is FirebasePermission => allFirebasePermissions.includes(item)) : defaultFirebasePermissions(role),
    lastSignInAt: String(data.lastSignInAt ?? ""),
  };
}

function adminApiUnavailable(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  return ["admin/configuration", "admin/unavailable", "admin/not-found"].some((item) => code.includes(item));
}

async function callAdmin<TOutput>(input?: object): Promise<TOutput> {
  const { auth } = services();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    const error = new Error("Sua sessão expirou. Entre novamente para continuar.") as Error & { code?: string };
    error.code = "admin/unauthenticated";
    throw error;
  }
  let response: Response;
  try {
    response = await fetch("/api/admin/users", {
      method: input ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await currentUser.getIdToken()}`,
        ...(input ? { "Content-Type": "application/json" } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
  } catch {
    const error = new Error("Não foi possível acessar o backend administrativo.") as Error & { code?: string };
    error.code = "admin/unavailable";
    throw error;
  }
  // Resposta que NÃO é o JSON da API administrativa significa que quem
  // respondeu não foi ela: a função não subiu, um proxy devolveu uma página de
  // erro, ou o ambiente serve o index.html em qualquer rota. Isso é
  // indisponibilidade, não erro da operação — e precisa cair no plano B, que é
  // ler os perfis direto do Firestore.
  //
  // Antes, o código do erro virava "admin/internal" e o plano B não era usado:
  // a tela de Usuários ficava VAZIA, como se as contas tivessem sumido.
  let payload: { data?: TOutput; error?: { code?: string; message?: string } } | null = null;
  try {
    payload = await response.json() as { data?: TOutput; error?: { code?: string; message?: string } };
  } catch {
    const error = new Error("O backend administrativo não respondeu no formato esperado.") as Error & { code?: string };
    error.code = "admin/unavailable";
    throw error;
  }
  if (!response.ok || !payload?.data) {
    const error = new Error(payload?.error?.message || "Não foi possível concluir a operação administrativa.") as Error & { code?: string };
    error.code = `admin/${payload?.error?.code || (response.status === 404 ? "not-found" : response.status >= 500 ? "unavailable" : "internal")}`;
    throw error;
  }
  return payload.data;
}

async function listManagedUsersFromFirestore() {
  const { auth, db } = services();
  // Guardado em uma constante: `auth.currentUser` é um getter e o TypeScript
  // não mantém o estreitamento de null entre um acesso e o seguinte.
  const currentUser = auth.currentUser;
  const [accessSnapshot, usersSnapshot] = await Promise.all([
    getDocs(collection(db, "userAccess")).catch(() => ({ docs: [] as DocumentData[] })),
    getDocs(collection(db, "users")).catch(() => ({ docs: [] as DocumentData[] })),
  ]);
  const usersMap = new Map<string, DocumentData>();
  for (const docSnap of usersSnapshot.docs) {
    usersMap.set(docSnap.id, docSnap.data());
  }

  const accessUids = new Set<string>();
  const list: FirebaseManagedUser[] = [];

  for (const item of accessSnapshot.docs) {
    accessUids.add(item.id);
    const userDocData = usersMap.get(item.id);
    const resolvedName = (typeof userDocData?.name === "string" ? userDocData.name.trim() : "")
      || (typeof item.data()?.name === "string" ? item.data().name.trim() : "")
      || (currentUser && item.id === currentUser.uid ? currentUser.displayName?.trim() : "")
      || "Usuário";
    const mergedData = {
      ...item.data(),
      name: resolvedName,
    };
    const user = managedUserFromData(item.id, mergedData);
    if (currentUser && item.id === currentUser.uid) {
      user.email ||= currentUser.email ?? "";
      user.name = resolvedName;
      user.lastSignInAt ||= currentUser.metadata.lastSignInTime ?? "";
    }
    list.push(user);
  }

  for (const [uid, userDocData] of usersMap.entries()) {
    if (accessUids.has(uid)) continue;
    const resolvedName = (typeof userDocData?.name === "string" ? userDocData.name.trim() : "")
      || (currentUser && uid === currentUser.uid ? currentUser.displayName?.trim() : "")
      || "Usuário";
    const user = managedUserFromData(uid, { ...userDocData, name: resolvedName, hasAccessProfile: false });
    if (currentUser && uid === currentUser.uid) {
      user.email ||= currentUser.email ?? "";
      user.name = resolvedName;
      user.lastSignInAt ||= currentUser.metadata.lastSignInTime ?? "";
    }
    list.push(user);
  }

  return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function listManagedUsers(): Promise<{ users: FirebaseManagedUser[]; mode: "cloud" | "fallback" }> {
  try {
    const result = await callAdmin<{ users: FirebaseManagedUser[] }>();
    return { users: result.users, mode: "cloud" };
  } catch (error) {
    if (!adminApiUnavailable(error)) throw error;
    try {
      return { users: await listManagedUsersFromFirestore(), mode: "fallback" };
    } catch (fallbackError) {
      throw fallbackError instanceof Error ? fallbackError : error;
    }
  }
}

export async function createManagedUser(input: ManagedUserInput & { password: string }): Promise<ManagedUserOperation> {
  const result = await callAdmin<{ user: FirebaseManagedUser }>({ action: "create", ...input });
  return { user: result.user, mode: "cloud" };
}

export async function updateManagedUser(uid: string, input: ManagedUserInput): Promise<ManagedUserOperation> {
  const result = await callAdmin<{ user: FirebaseManagedUser }>({ action: "update", uid, ...input });
  return { user: result.user, mode: "cloud" };
}

export async function setManagedUserPassword(uid: string, _email: string, password: string): Promise<ManagedUserOperation> {
  await callAdmin<{ success: boolean }>({ action: "password", uid, password });
  return { mode: "cloud" };
}

export async function deleteManagedUser(uid: string): Promise<ManagedUserOperation> {
  await callAdmin<{ success: boolean }>({ action: "delete", uid });
  return { mode: "cloud" };
}

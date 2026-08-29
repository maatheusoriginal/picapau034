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
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { allFirebasePermissions, defaultPermissionsForRole, type FirebasePermission, type UserRole } from "../../src/types";

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

function services() {
  if (typeof window === "undefined") throw new Error("Firebase está disponível somente no navegador.");
  const app = getApps().length ? getApp() : initializeApp(resolveFirebaseConfig());
  const auth = getAuth(app);
  const db = getFirestore(app);
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
      : defaultFirebasePermissions(role, employeeId);

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
      batch.set(doc(reference, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
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
      batch.set(doc(reference, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
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
      batch.set(doc(employeeReference, id), { ...publicData, updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(compensationReference, id), { baseSalary, paymentDay, updatedAt: serverTimestamp() }, { merge: true });
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
      batch.set(doc(employeeReference, id), { ...publicData, updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(compensationReference, id), { baseSalary, paymentDay, updatedAt: serverTimestamp() }, { merge: true });
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
    await setDoc(doc(db, collectionName, id), { ...cleanData, updatedAt: serverTimestamp() }, { merge: true });
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
      await setDoc(reference, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    batch.set(doc(db, "sales", saleId), { ...sale, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    permissions: Array.isArray(data.permissions) ? data.permissions.filter((item): item is FirebasePermission => allFirebasePermissions.includes(item)) : defaultFirebasePermissions(role, employeeId),
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
  const payload = await response.json().catch(() => ({})) as { data?: TOutput; error?: { code?: string; message?: string } };
  if (!response.ok || !payload.data) {
    const error = new Error(payload.error?.message || "Não foi possível concluir a operação administrativa.") as Error & { code?: string };
    error.code = `admin/${payload.error?.code || (response.status === 404 ? "not-found" : "internal")}`;
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

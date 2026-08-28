import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD29XX1forYBID5KFbD4PptOi4IZSPibY8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "oficinapicapaumotos34.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "oficinapicapaumotos34",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "oficinapicapaumotos34.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "754527262085",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:754527262085:web:b9b94d26280639461e20ec",
};

export type FirebaseUserSummary = {
  uid: string;
  email: string;
  displayName: string;
};

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

export function defaultFirebasePermissions(role: FirebaseAccessProfile["role"], employeeId = ""): FirebasePermission[] {
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

export type FirebaseAccessProfile = {
  uid: string;
  employeeId: string;
  name: string;
  role: "Super Admin" | "Balcão" | "Mecânico";
  active: boolean;
  permissions: FirebasePermission[];
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
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (!persistenceReady) persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  return { app, auth, db };
}

export const firebaseProjectId = firebaseConfig.projectId;

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
  if (code.includes("unauthenticated")) return "Sua sessão expirou. Entre novamente para continuar.";
  if (code.includes("admin/configuration")) return "Configure a credencial do Firebase Admin nas variáveis protegidas do ambiente.";
  if (code.includes("admin/internal")) return "O backend administrativo não conseguiu concluir a operação. Confira os logs do ambiente.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação no Firebase.";
}

function summarizeUser(user: User | null): FirebaseUserSummary | null {
  if (!user) return null;
  return { uid: user.uid, email: user.email ?? "", displayName: user.displayName ?? user.email?.split("@")[0] ?? "Usuário" };
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

export function observeAccessProfile(uid: string, callback: (profile: FirebaseAccessProfile | null) => void, onError: (error: unknown) => void): Unsubscribe {
  const { db } = services();
  return onSnapshot(doc(db, "userAccess", uid), (snapshot) => {
    if (!snapshot.exists()) return callback(null);
    const data = snapshot.data();
    const role = (data.role ?? "Mecânico") as FirebaseAccessProfile["role"];
    const employeeId = String(data.employeeId ?? "");
    callback({
      uid,
      employeeId,
      name: String(data.name ?? "Usuário"),
      role,
      active: data.active !== false,
      permissions: Array.isArray(data.permissions) ? data.permissions.filter((item): item is FirebasePermission => allFirebasePermissions.includes(item)) : defaultFirebasePermissions(role, employeeId),
    });
  }, onError);
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
  }, onError);
}

export async function replaceCollection<T extends { id: string }>(name: string, records: T[]) {
  const { db } = services();
  const reference = collection(db, name);
  const current = await getDocs(reference);
  const ids = new Set(records.map((record) => record.id));
  const batch = writeBatch(db);
  current.docs.forEach((item) => { if (!ids.has(item.id)) batch.delete(item.ref); });
  records.forEach((record) => {
    const { id, ...data } = record;
    batch.set(doc(reference, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  });
  await batch.commit();
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
    employees = snapshot.docs.map((item) => cleanDocument(item.id, item.data()));
    emit();
  }, onError);
  const stopCompensation = includeCompensation ? onSnapshot(collection(db, "employeeCompensation"), (snapshot) => {
    compensation = new Map(snapshot.docs.map((item) => [item.id, {
      baseSalary: Number(item.data().baseSalary ?? 0),
      paymentDay: Number(item.data().paymentDay ?? 5),
    }]));
    emit();
  }, onError) : () => undefined;
  return () => { stopEmployees(); stopCompensation(); };
}

export async function replaceEmployees<T extends EmployeeLike>(records: T[]) {
  const { db } = services();
  const employeeReference = collection(db, "employees");
  const compensationReference = collection(db, "employeeCompensation");
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
  const snapshot = await getDocs(collection(db, "userAccess"));
  return snapshot.docs.map((item) => {
    const user = managedUserFromData(item.id, item.data());
    if (item.id === auth.currentUser?.uid) {
      user.email ||= auth.currentUser.email ?? "";
      user.name = user.name || auth.currentUser.displayName || "Usuário";
      user.lastSignInAt ||= auth.currentUser.metadata.lastSignInTime ?? "";
    }
    return user;
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
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

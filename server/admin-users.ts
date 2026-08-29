import type { Request, Response } from "express";
import type { UserRecord } from "firebase-admin/auth";
import { firebaseAdmin } from "./firebase-admin";
import { allFirebasePermissions, allUserRoles, defaultPermissionsForRole, type FirebasePermission, type UserRole } from "../src/types";

const roles = allUserRoles;
const permissions = allFirebasePermissions;
type UserPermission = FirebasePermission;

type UserInput = {
  uid?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
  role?: unknown;
  employeeId?: unknown;
  active?: unknown;
  permissions?: unknown;
  action?: unknown;
};

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function value(data: unknown) {
  return String(data ?? "").trim();
}

function roleValue(data: unknown): UserRole {
  const role = value(data) as UserRole;
  if (!roles.includes(role)) throw new ApiError(400, "invalid-argument", "Perfil de acesso inválido.");
  return role;
}

function permissionValues(data: unknown, role: UserRole, employeeId: string): UserPermission[] {
  if (role === "Super Admin") return [...permissions];
  if (!Array.isArray(data)) return defaultPermissionsForRole(role, employeeId);
  return data.filter((item): item is UserPermission => typeof item === "string" && permissions.includes(item as UserPermission));
}

async function callerFrom(request: Request) {
  const { auth, db } = firebaseAdmin();
  const authorization = request.header("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new ApiError(401, "unauthenticated", "Entre no sistema para continuar.");

  let decoded;
  try {
    decoded = await auth.verifyIdToken(authorization.slice(7));
  } catch {
    throw new ApiError(401, "unauthenticated", "Sua sessão expirou. Entre novamente.");
  }

  const profile = await db.collection("userAccess").doc(decoded.uid).get();
  if (!profile.exists || profile.data()?.active === false || profile.data()?.role !== "Super Admin") {
    throw new ApiError(403, "permission-denied", "Acesso restrito ao Super Admin.");
  }
  return decoded.uid;
}

async function assertAnotherAdminRemains(uid: string) {
  const { db } = firebaseAdmin();
  const snapshot = await db.collection("userAccess").get();
  const another = snapshot.docs.some((item) => item.id !== uid && item.data().active !== false && item.data().role === "Super Admin");
  if (!another) throw new ApiError(409, "failed-precondition", "Cadastre outro Super Admin ativo antes desta alteração.");
}

async function audit(callerUid: string, action: string, targetUid: string, summary: string) {
  const { db, FieldValue } = firebaseAdmin();
  await db.collection("auditLogs").add({
    actorUid: callerUid,
    action,
    entity: "userAccess",
    entityId: targetUid,
    summary,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function publicUser(uid: string, profile: Record<string, unknown>, authUser?: UserRecord, hasAccessProfile = true) {
  const role = roles.includes(profile.role as UserRole) ? (profile.role as UserRole) : "Mecânico";
  const employeeId = value(profile.employeeId);
  return {
    uid,
    name: value(profile.name) || authUser?.displayName?.trim() || "Usuário",
    email: value(profile.email) || authUser?.email || "",
    phone: value(profile.phone),
    role,
    employeeId,
    active: hasAccessProfile && profile.active !== false && !authUser?.disabled,
    hasAuthAccount: Boolean(authUser),
    hasAccessProfile,
    permissions: permissionValues(profile.permissions, role, employeeId),
    lastSignInAt: authUser?.metadata.lastSignInTime || "",
  };
}

async function listAllAuthenticationUsers() {
  const { auth } = firebaseAdmin();
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function sendError(response: Response, error: unknown) {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code.includes("email-already-exists")) {
    response.status(409).json({ error: { code: "already-exists", message: "Este e-mail já está cadastrado." } });
    return;
  }

  console.error("Firebase Admin API error", code || error);
  const configuration = error instanceof Error && /FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON|credencial do Firebase Admin/i.test(error.message);
  response.status(configuration ? 503 : 500).json({
    error: {
      code: configuration ? "configuration" : "internal",
      message: configuration ? (error as Error).message : "Não foi possível concluir a operação administrativa.",
    },
  });
}

export async function getAdminUsers(request: Request, response: Response) {
  try {
    await callerFrom(request);
    const { db } = firebaseAdmin();
    const [authenticationUsers, profiles, usersDocs] = await Promise.all([
      listAllAuthenticationUsers(),
      db.collection("userAccess").get(),
      db.collection("users").get(),
    ]);
    const authByUid = new Map(authenticationUsers.map((item) => [item.uid, item]));
    const usersByUid = new Map(usersDocs.docs.map((item) => [item.id, item.data()]));

    const users = profiles.docs.map((item) => {
      const userDoc = usersByUid.get(item.id);
      const mergedProfile = {
        ...item.data(),
        name: value(userDoc?.name) || value(item.data()?.name),
      };
      return publicUser(item.id, mergedProfile, authByUid.get(item.id), true);
    });

    const profileUids = new Set(profiles.docs.map((item) => item.id));

    for (const userDoc of usersDocs.docs) {
      if (profileUids.has(userDoc.id)) continue;
      profileUids.add(userDoc.id);
      const authUser = authByUid.get(userDoc.id);
      users.push(publicUser(userDoc.id, userDoc.data(), authUser, false));
    }

    for (const authUser of authenticationUsers) {
      if (profileUids.has(authUser.uid)) continue;
      users.push(publicUser(authUser.uid, {
        name: authUser.displayName,
        email: authUser.email,
        active: !authUser.disabled,
        role: authUser.customClaims?.role,
      }, authUser, false));
    }

    users.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    response.json({ data: { users } });
  } catch (error) {
    sendError(response, error);
  }
}

export async function postAdminUsers(request: Request, response: Response) {
  try {
    const callerUid = await callerFrom(request);
    const body = (request.body ?? {}) as UserInput;
    const action = value(body.action);
    const { auth, db, FieldValue } = firebaseAdmin();

    if (action === "create") {
      const name = value(body.name);
      const email = value(body.email).toLowerCase();
      const phone = value(body.phone);
      const password = value(body.password);
      const role = roleValue(body.role);
      const employeeId = value(body.employeeId);
      const active = body.active !== false;
      const userPermissions = permissionValues(body.permissions, role, employeeId);
      if (!name || !email) throw new ApiError(400, "invalid-argument", "Nome e e-mail são obrigatórios.");
      if (!/^\d{6}$/.test(password)) throw new ApiError(400, "invalid-argument", "A senha temporária deve ter exatamente 6 números.");

      let created: UserRecord | null = null;
      try {
        created = await auth.createUser({ email, password, displayName: name, disabled: !active });
        await auth.setCustomUserClaims(created.uid, { role, employeeId });
        const batch = db.batch();
        batch.set(db.collection("users").doc(created.uid), {
          uid: created.uid, name, email, phone, role, employeeId, active,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        batch.set(db.collection("userAccess").doc(created.uid), {
          uid: created.uid, name, email, phone, role, employeeId, active, permissions: userPermissions,
          mustChangePassword: true, createdAt: FieldValue.serverTimestamp(), createdBy: callerUid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (employeeId) batch.set(db.collection("employees").doc(employeeId), {
          userUid: created.uid, userEmail: email, systemRole: role, hasSystemAccess: active,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await batch.commit();
        await audit(callerUid, "CREATE_USER", created.uid, `Usuário ${name} criado como ${role}.`);
        response.json({ data: { user: publicUser(created.uid, { name, email, phone, role, employeeId, active, permissions: userPermissions }, created, true) } });
        return;
      } catch (error) {
        if (created) await auth.deleteUser(created.uid).catch(() => undefined);
        throw error;
      }
    }

    const uid = value(body.uid);
    if (!uid) throw new ApiError(400, "invalid-argument", "UID do usuário não informado.");

    if (action === "update") {
      const currentSnapshot = await db.collection("userAccess").doc(uid).get();
      const current = currentSnapshot.data() || {};
      const name = value(body.name);
      const email = value(body.email).toLowerCase();
      const phone = value(body.phone);
      const role = roleValue(body.role);
      const employeeId = value(body.employeeId);
      const active = body.active !== false;
      const userPermissions = permissionValues(body.permissions, role, employeeId);
      if (!name || !email) throw new ApiError(400, "invalid-argument", "Nome e e-mail são obrigatórios.");
      if (uid === callerUid && !active) throw new ApiError(409, "failed-precondition", "Você não pode desativar a própria conta.");
      if (current.role === "Super Admin" && (role !== "Super Admin" || !active)) await assertAnotherAdminRemains(uid);

      let authUser: UserRecord | undefined;
      try {
        authUser = await auth.updateUser(uid, { email, displayName: name, disabled: !active });
        await auth.setCustomUserClaims(uid, { role, employeeId });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
        if (!code.includes("user-not-found")) throw error;
      }

      const batch = db.batch();
      batch.set(db.collection("users").doc(uid), {
        uid, name, email, phone, role, employeeId, active,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(db.collection("userAccess").doc(uid), {
        uid, name, email, phone, role, employeeId, active, permissions: userPermissions,
        ...(!currentSnapshot.exists ? { createdAt: FieldValue.serverTimestamp(), createdBy: callerUid } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (current.employeeId && current.employeeId !== employeeId) batch.set(db.collection("employees").doc(value(current.employeeId)), {
        hasSystemAccess: false, userUid: FieldValue.delete(), userEmail: FieldValue.delete(), systemRole: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (employeeId) batch.set(db.collection("employees").doc(employeeId), {
        userUid: uid, userEmail: email, systemRole: role, hasSystemAccess: active, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      await audit(callerUid, "UPDATE_USER", uid, `Usuário ${name} atualizado.`);
      response.json({ data: { user: publicUser(uid, { name, email, phone, role, employeeId, active, permissions: userPermissions }, authUser, true) } });
      return;
    }

    if (action === "password") {
      const password = value(body.password);
      if (!/^\d{6}$/.test(password)) throw new ApiError(400, "invalid-argument", "Informe uma senha temporária com exatamente 6 números.");
      await auth.updateUser(uid, { password });
      await auth.revokeRefreshTokens(uid);
      await db.collection("userAccess").doc(uid).set({ mustChangePassword: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await audit(callerUid, "RESET_PASSWORD", uid, "Senha temporária redefinida e sessões anteriores encerradas.");
      response.json({ data: { success: true } });
      return;
    }

    if (action === "delete") {
      if (uid === callerUid) throw new ApiError(409, "failed-precondition", "Você não pode apagar a própria conta.");
      const profile = await db.collection("userAccess").doc(uid).get();
      const profileData = profile.data() || {};
      if (profileData.role === "Super Admin" && profileData.active !== false) await assertAnotherAdminRemains(uid);
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
        if (!code.includes("user-not-found")) throw error;
      }
      const batch = db.batch();
      batch.delete(db.collection("users").doc(uid));
      batch.delete(db.collection("userAccess").doc(uid));
      if (profileData.employeeId) batch.set(db.collection("employees").doc(value(profileData.employeeId)), {
        hasSystemAccess: false, userUid: FieldValue.delete(), userEmail: FieldValue.delete(), systemRole: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      await audit(callerUid, "DELETE_USER", uid, `Usuário ${value(profileData.name) || uid} removido.`);
      response.json({ data: { success: true } });
      return;
    }

    throw new ApiError(400, "invalid-argument", "Ação administrativa inválida.");
  } catch (error) {
    sendError(response, error);
  }
}

import { firebaseAdmin } from "./firebase-admin.js";
import { header, type ApiRequest, type ApiResponse } from "./http.js";
import { allFirebasePermissions } from "../src/types.js";

function sendError(response: ApiResponse, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}

export async function bootstrapSuperAdmin(request: ApiRequest, response: ApiResponse) {
  try {
    const authorization = header(request, "authorization");
    if (!authorization.startsWith("Bearer ")) {
      sendError(response, 401, "unauthenticated", "Entre no sistema para continuar.");
      return;
    }

    const { auth, db, FieldValue } = firebaseAdmin();
    let decoded: Awaited<ReturnType<typeof auth.verifyIdToken>>;
    try {
      decoded = await auth.verifyIdToken(authorization.slice(7));
    } catch {
      sendError(response, 401, "unauthenticated", "Sua sessão expirou. Entre novamente.");
      return;
    }

    const allowedEmail = (process.env.INITIAL_SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const callerEmail = (decoded.email ?? "").trim().toLowerCase();
    if (!allowedEmail) {
      sendError(response, 503, "configuration", "Defina INITIAL_SUPER_ADMIN_EMAIL no ambiente do servidor antes de criar o primeiro administrador.");
      return;
    }
    if (!callerEmail || callerEmail !== allowedEmail) {
      sendError(response, 403, "permission-denied", "Esta conta não está autorizada a concluir a configuração inicial.");
      return;
    }

    const existingProfiles = await db.collection("userAccess").get();
    const activeSuperAdminExists = existingProfiles.docs.some((item) => item.data().active !== false && item.data().role === "Super Admin");
    if (activeSuperAdminExists) {
      sendError(response, 409, "already-initialized", "Já existe um Super Admin ativo. Ele deve liberar esta conta em Usuários e acessos.");
      return;
    }

    const userDocSnap = await db.collection("users").doc(decoded.uid).get();
    const userDocData = userDocSnap.exists ? userDocSnap.data() : null;
    const authUser = await auth.getUser(decoded.uid);
    const name = String(userDocData?.name ?? "").trim() || authUser.displayName?.trim() || "Administrador";
    const permissions = [...allFirebasePermissions];

    await auth.setCustomUserClaims(decoded.uid, {
      role: "Super Admin",
    });

    if (!authUser.displayName && name) {
      await auth.updateUser(decoded.uid, { displayName: name }).catch(() => undefined);
    }

    const batch = db.batch();
    batch.set(db.collection("users").doc(decoded.uid), {
      uid: decoded.uid,
      name,
      email: callerEmail,
      phone: authUser.phoneNumber ?? "",
      role: "Super Admin",
      employeeId: "",
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    batch.set(db.collection("userAccess").doc(decoded.uid), {
      uid: decoded.uid,
      name,
      email: callerEmail,
      phone: authUser.phoneNumber ?? "",
      role: "Super Admin",
      employeeId: "",
      active: true,
      permissions,
      mustChangePassword: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: decoded.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    await db.collection("auditLogs").add({
      actorUid: decoded.uid,
      action: "BOOTSTRAP_SUPER_ADMIN",
      entity: "userAccess",
      entityId: decoded.uid,
      summary: `Primeiro Super Admin configurado: ${callerEmail}.`,
      createdAt: FieldValue.serverTimestamp(),
    });

    response.json({ data: { success: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a configuração inicial.";
    const configuration = /FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON|credencial do Firebase Admin/i.test(message);
    console.error("Bootstrap error", error);
    sendError(response, configuration ? 503 : 500, configuration ? "configuration" : "internal", configuration ? message : "Não foi possível concluir a configuração inicial.");
  }
}

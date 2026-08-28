import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function serviceAccount() {
  const envName = ["FIREBASE", "ADMIN", "SERVICE", "ACCOUNT", "JSON"].join("_");
  const raw = process.env[envName];
  if (!raw) {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON não foi configurada neste ambiente.");
  }

  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON não contém um JSON válido.");
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("A credencial do Firebase Admin está incompleta.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function adminApp() {
  if (getApps().length) return getApps()[0]!;
  return initializeApp({ credential: cert(serviceAccount()) });
}

export function firebaseAdmin() {
  const app = adminApp();
  return {
    auth: getAuth(app),
    db: getFirestore(app),
    FieldValue,
  };
}

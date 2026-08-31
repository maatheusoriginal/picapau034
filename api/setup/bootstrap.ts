import { bootstrapSuperAdmin } from "../../server/bootstrap";
import type { ApiRequest, ApiResponse } from "../../server/http";

/** Cria o primeiro Super Admin. Só aceita POST, como no servidor Express. */
export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: { code: "method-not-allowed", message: "Método não suportado." } });
  }
  return bootstrapSuperAdmin(request, response);
}

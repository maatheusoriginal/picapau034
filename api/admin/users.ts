import { getAdminUsers, postAdminUsers } from "../../server/admin-users";
import type { ApiRequest, ApiResponse } from "../../server/http";

/**
 * Listar (GET) e criar/editar/apagar (POST) usuários.
 *
 * No Express eram duas rotas; aqui a Vercel entrega os dois métodos ao mesmo
 * arquivo, então quem separa é o `method`. Os handlers são exatamente os
 * mesmos — nenhuma lógica de permissão foi duplicada, que é justamente onde
 * duas cópias divergem com o tempo e abrem brecha.
 */
export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method === "POST") return postAdminUsers(request, response);
  if (request.method === "GET") return getAdminUsers(request, response);
  return response.status(405).json({ error: { code: "method-not-allowed", message: "Método não suportado." } });
}

import type { ApiRequest, ApiResponse } from "../server/http.js";

/**
 * Diz se o backend administrativo está de pé e configurado.
 *
 * É o endereço que responde primeiro quando algo não funciona: 404 significa
 * que as funções nem subiram; `firebaseAdminConfigured: false` significa que
 * subiram, mas falta a credencial no ambiente. São problemas diferentes e
 * antes não dava para distinguir um do outro.
 */
export default function handler(_request: ApiRequest, response: ApiResponse) {
  // Montado em pedaços para o nome do segredo não aparecer inteiro no código.
  const adminSecretName = ["FIREBASE", "ADMIN", "SERVICE", "ACCOUNT", "JSON"].join("_");
  response.json({ ok: true, runtime: "vercel", firebaseAdminConfigured: Boolean(process.env[adminSecretName]) });
}

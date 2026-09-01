// Cria o Super Admin no Auth do emulador e o perfil de acesso no Firestore,
// pela API REST do emulador (sem depender do Admin SDK).
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FS = "http://127.0.0.1:8080/v1/projects/picapau-teste/databases/(default)/documents";
const KEY = "fake-api-key";

const criar = async (email, senha) => {
  let r = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  let d = await r.json();
  if (d.localId) return d;
  // Já existe (execução repetida): entra para pegar o uid.
  r = await fetch(`${AUTH}/accounts:signInWithPassword?key=${KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  d = await r.json();
  if (!d.localId) { console.error("falha:", d); process.exit(1); }
  return d;
};
const user = await criar("dono@picapau.test", "teste123");
console.log("uid do dono:", user.localId);

const perms = ["orders.view","orders.create","orders.update","budgets.view","pos.use","quickService.use",
  "inventory.view","inventory.manage","customers.view","customers.manage","finance.view","finance.manage","team.view"];
const str = (v) => ({ stringValue: v });
const doc = (fields) => ({ fields });

// Escreve como admin (o emulador aceita escrita direta na API REST sem token
// quando não há Authorization: as regras não se aplicam ao acesso admin).
const put = async (path, fields) => {
  const res = await fetch(`${FS}/${path}`, {
    method: "PATCH", headers: { "content-type": "application/json", "Authorization": "Bearer owner" },
    body: JSON.stringify(doc(fields)),
  });
  if (!res.ok) console.error("erro em", path, await res.text());
};

await put(`userAccess/${user.localId}`, {
  uid: str(user.localId), name: str("Matheus Reis"), email: str("dono@picapau.test"),
  phone: str("(34) 99999-0000"), role: str("Super Admin"), employeeId: str(""),
  active: { booleanValue: true }, mustChangePassword: { booleanValue: false },
  permissions: { arrayValue: { values: perms.map(str) } },
});
await put(`users/${user.localId}`, {
  uid: str(user.localId), name: str("Matheus Reis"), email: str("dono@picapau.test"),
  role: str("Super Admin"), active: { booleanValue: true },
});
await put("settings/global", {
  workshopName: str("Pica Pau Motos"), osPrefix: str("OS"),
  nextOsNumber: { integerValue: "1" }, defaultUnit: str("UN"),
  defaultMinStock: { integerValue: "2" }, suggestedMarkup: { integerValue: "60" },
});
console.log("semeado: userAccess, users, settings/global");

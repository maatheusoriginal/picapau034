/**
 * Confere a limpeza dos campos vazios antes de gravar no Firestore.
 *
 * O Firestore recusa o documento inteiro quando encontra um `undefined`, e a
 * gravação em lote é atômica. O formulário de gasto caiu nisso: na tela o gasto
 * aparecia lançado e o saldo caía, no banco não havia nada.
 *
 * Rode com: npm run check:firestore-data
 */
import { withoutUndefined } from "../src/firestore-data";

const json = (value: unknown) => JSON.stringify(value);
// Só JSON.stringify não serve de prova: ele já some com undefined sozinho.
// A conferência precisa olhar as chaves que sobraram de verdade.
const chaves = (value: unknown) => Object.keys(value as object).join(",");

const gasto = {
  description: "Óleo para a bancada", amount: 40, status: "Pago",
  supplierId: undefined, supplierName: undefined,
  paidAt: "2026-09-01T12:00:00.000Z", order: undefined, charged: undefined, employeeId: undefined,
};
const limpo = withoutUndefined(gasto);

const aninhado = withoutUndefined({
  id: "VEN-0001",
  payments: [{ method: "Dinheiro", amount: 35, fee: undefined, machineName: undefined }],
  cliente: { nome: "Rayane", telefone: undefined },
});

const casos: Array<[string, unknown, unknown]> = [
  ["o gasto sem fornecedor perde só os campos vazios", chaves(limpo), "description,amount,status,paidAt"],
  ["o que tem valor continua igual", (limpo as { amount: number }).amount, 40],
  ["zero não é campo vazio", chaves(withoutUndefined({ desconto: 0, taxa: undefined })), "desconto"],
  ["texto vazio não é campo vazio", chaves(withoutUndefined({ obs: "", taxa: undefined })), "obs"],
  ["false não é campo vazio", chaves(withoutUndefined({ pago: false, taxa: undefined })), "pago"],
  ["null é gravável e permanece", chaves(withoutUndefined({ fim: null, taxa: undefined })), "fim"],
  ["limpa dentro de objeto aninhado", chaves((aninhado as { cliente: object }).cliente), "nome"],
  ["limpa dentro de item de lista", chaves((aninhado as { payments: object[] }).payments[0]!), "method,amount"],
  ["a lista continua com o mesmo tamanho", (aninhado as { payments: object[] }).payments.length, 1],
  ["não mexe no que já estava limpo", json(withoutUndefined({ a: 1, b: "x" })), json({ a: 1, b: "x" })],
  ["data continua sendo data, não vira objeto vazio", withoutUndefined(new Date(0)) instanceof Date, true],
  ["não altera o objeto original", chaves(gasto).includes("supplierId"), true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nNenhum campo vazio escapa para o Firestore." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere a ponte entre conta de acesso e cadastro de funcionário.
 *
 * Rode com: npm run check:team-link
 */
import { accessIsMechanic, employeeForAccount, employeeFromAccount, mechanicsForOrders, mechanicsWithoutEmployee, type AccessAccount, type EmployeeLike } from "../src/team-link";

const conta = (partes: Partial<AccessAccount>): AccessAccount => ({
  uid: "uid-x", name: "", role: "Balcão", ...partes,
});
const func = (partes: Partial<EmployeeLike>): EmployeeLike => ({
  id: "USR-X", name: "", ...partes,
});

const funcionarios = [
  func({ id: "USR-001", name: "MATHEUS REIS", position: "Responsável", role: "Super Admin", active: true }),
  func({ id: "USR-002", name: "Erasmo", position: "Mecânico", isMechanic: true, active: true }),
  func({ id: "USR-003", name: "ANTIGO INATIVO", position: "Mecânico", isMechanic: true, active: false }),
];
const contas = [
  conta({ uid: "u1", name: "MATHEUS REIS", role: "Super Admin", employeeId: "USR-001" }),
  // Cadastrado só em "Usuários e acessos", com o nome escrito diferente.
  conta({ uid: "u2", name: "erasmo", role: "Mecânico" }),
  // Mecânico que não existe como funcionário: é o caso que sumia da OS.
  conta({ uid: "u3", name: "RONALDO", role: "Mecânico" }),
  conta({ uid: "u4", name: "RAYANE", role: "Balcão", permissions: ["pos.use"] }),
  conta({ uid: "u5", name: "DESLIGADO", role: "Mecânico", active: false }),
];

const faltando = mechanicsWithoutEmployee(contas, funcionarios);
const daOs = mechanicsForOrders(funcionarios);
const novo = employeeFromAccount(contas[2], "USR-004");

const casos: Array<[string, unknown, unknown]> = [
  ["cargo Mecânico é mecânico", accessIsMechanic(conta({ role: "Mecânico" })), true],
  ["quem atualiza OS também é", accessIsMechanic(conta({ role: "Balcão", permissions: ["orders.update"] })), true],
  ["Super Admin que atualiza OS não vira mecânico", accessIsMechanic(conta({ role: "Super Admin", permissions: ["orders.update"] })), false],
  ["balcão sem OS não é mecânico", accessIsMechanic(conta({ role: "Balcão", permissions: ["pos.use"] })), false],

  ["acha o funcionário pelo vínculo", employeeForAccount(contas[0], funcionarios)?.id, "USR-001"],
  // O vínculo não existia antes; o nome é o que sobra, e o cadastro passou a
  // gravar em maiúsculo enquanto os antigos ficaram como estavam.
  ["acha pelo nome quando não há vínculo", employeeForAccount(contas[1], funcionarios)?.id, "USR-002"],
  ["não inventa funcionário", employeeForAccount(contas[2], funcionarios), null],
  ["conta sem nome não casa com ninguém", employeeForAccount(conta({ name: "" }), funcionarios), null],
  ["vínculo apontando para funcionário apagado cai no nome", employeeForAccount(conta({ name: "ERASMO", employeeId: "USR-999" }), funcionarios)?.id, "USR-002"],

  ["só o mecânico sem cadastro é apontado", faltando.map((item) => item.uid).join(","), "u3"],
  ["quem já tem cadastro não aparece", faltando.some((item) => item.uid === "u2"), false],
  ["balcão não aparece", faltando.some((item) => item.uid === "u4"), false],
  ["conta desativada não aparece", faltando.some((item) => item.uid === "u5"), false],

  ["o funcionário novo nasce como mecânico", novo.isMechanic, true],
  ["e recebendo OS", novo.canReceiveServiceOrders, true],
  ["com o nome em maiúsculo, como o resto do cadastro", novo.name, "RONALDO"],
  ["guardando de qual conta veio", novo.userId, "u3"],
  ["com o id que o sistema deu", novo.id, "USR-004"],
  ["sem salário chutado", novo.baseSalary, 0],

  ["a OS lista os mecânicos ativos", daOs.map((item) => item.name).join(","), "Erasmo"],
  ["e não lista o inativo", daOs.some((item) => item.id === "USR-003"), false],
  ["nem o responsável que não é mecânico", daOs.some((item) => item.id === "USR-001"), false],
  // Ordem fixa: a lista não pode trocar de posição a cada carregamento.
  ["em ordem alfabética", mechanicsForOrders([
    func({ id: "A", name: "Ronaldo", isMechanic: true }),
    func({ id: "B", name: "erasmo", isMechanic: true }),
  ]).map((item) => item.id).join(","), "B,A"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nA ponte entre acesso e funcionário fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

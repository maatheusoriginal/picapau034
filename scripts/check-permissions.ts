/**
 * Confere quem recebe qual permissão.
 *
 * Este é o script que protege o dono da oficina de si mesmo. Permissão é a
 * única coisa no sistema que, quando erra, erra em silêncio: ninguém percebe
 * que o mecânico podia mexer no financeiro até o dia em que ele mexe.
 *
 * O caso que motivou o script: o mecânico vinculado ao funcionário de id
 * "USR-003" ganhava "abrir OS" e "ver equipe" automaticamente, porque era o que
 * fazia sentido para o Ronaldo dos dados de exemplo. Numa oficina de verdade
 * esse id é outra pessoa qualquer. Os casos abaixo garantem que nenhuma
 * exceção assim volte a existir.
 *
 * Rode com: npm run check:permissions
 */
import { allFirebasePermissions, allUserRoles, defaultPermissionsForRole } from "../src/types";

const json = (value: unknown) => JSON.stringify(value);
const has = (role: Parameters<typeof defaultPermissionsForRole>[0], permission: string) =>
  defaultPermissionsForRole(role).includes(permission as never);

const admin = defaultPermissionsForRole("Super Admin");
const balcao = defaultPermissionsForRole("Balcão");
const mecanico = defaultPermissionsForRole("Mecânico");

// Nenhum cargo pode receber permissão que não existe na lista oficial: uma
// permissão escrita errado nunca seria concedida e ninguém entenderia por quê.
const inventadas = allUserRoles.flatMap((role) =>
  defaultPermissionsForRole(role).filter((permission) => !allFirebasePermissions.includes(permission)));

const casos: Array<[string, unknown, unknown]> = [
  // --- Super Admin ---
  ["Super Admin recebe tudo", admin.length, allFirebasePermissions.length],
  ["e nada fica de fora", allFirebasePermissions.every((p) => admin.includes(p)), true],

  // --- Balcão ---
  ["Balcão opera o PDV", has("Balcão", "pos.use"), true],
  ["Balcão abre OS", has("Balcão", "orders.create"), true],
  ["Balcão mexe no financeiro", has("Balcão", "finance.manage"), true],
  ["Balcão gerencia estoque", has("Balcão", "inventory.manage"), true],
  ["Balcão NÃO vê a equipe por padrão", has("Balcão", "team.view"), false],
  ["Balcão não recebe tudo", balcao.length < allFirebasePermissions.length, true],

  // --- Mecânico: o cargo mais restrito ---
  ["mecânico vê as OS", has("Mecânico", "orders.view"), true],
  ["mecânico atualiza a OS que está fazendo", has("Mecânico", "orders.update"), true],
  ["mecânico consulta o estoque", has("Mecânico", "inventory.view"), true],
  ["mecânico NÃO abre OS por padrão", has("Mecânico", "orders.create"), false],
  ["mecânico NÃO vê a equipe por padrão", has("Mecânico", "team.view"), false],
  ["mecânico NÃO opera o PDV", has("Mecânico", "pos.use"), false],
  ["mecânico NÃO vê o financeiro", has("Mecânico", "finance.view"), false],
  ["mecânico NÃO mexe no financeiro", has("Mecânico", "finance.manage"), false],
  ["mecânico NÃO gerencia estoque", has("Mecânico", "inventory.manage"), false],
  ["mecânico NÃO cadastra cliente", has("Mecânico", "customers.manage"), false],

  // --- Nenhuma exceção escondida ---
  // O padrão do cargo depende SÓ do cargo. Se um dia alguém acrescentar um
  // segundo parâmetro (funcionário, loja, dia da semana), estes casos quebram.
  ["o padrão depende só do cargo", defaultPermissionsForRole.length, 1],
  ["chamar duas vezes dá o mesmo resultado", json(defaultPermissionsForRole("Mecânico")), json(mecanico)],
  ["nenhum cargo recebe permissão inexistente", json(inventadas), json([])],
  ["mecânico é o mais restrito dos três", mecanico.length < balcao.length && balcao.length < admin.length, true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nNinguém recebe acesso que não foi dado." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

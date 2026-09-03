/**
 * A ponte entre quem tem ACESSO ao sistema e quem é FUNCIONÁRIO da oficina.
 *
 * O sistema tem duas telas que parecem "cadastrar uma pessoa":
 *
 * - **Funcionários** grava na coleção `employees`. É de onde a OS tira a lista
 *   de mecânicos, de onde saem as comissões e o que o mecânico vê como "minhas
 *   OS".
 * - **Usuários e acessos** grava na coleção `users`: é a conta de login, o
 *   cargo e as permissões.
 *
 * Cadastrar alguém como Mecânico só em "Usuários e acessos" criava uma pessoa
 * que entra no sistema mas **não existe para a oficina**: não aparecia no
 * seletor de mecânicos da OS, não recebia serviço e não entrava em comissão.
 * Nada avisava — o seletor simplesmente não tinha aquele nome.
 *
 * Aqui ficam as regras que ligam os dois lados. Sem tela e sem Firestore, para
 * poderem ser conferidas por `npm run check:team-link`.
 */
import type { FirebasePermission, UserConfig, UserRole } from "./types";
import { isMechanicUser } from "./types";

/** O mínimo que precisamos saber de uma conta de acesso. */
export type AccessAccount = {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  employeeId?: string;
  active?: boolean;
  permissions?: FirebasePermission[];
};

/** Só o que interessa de um funcionário para casar com a conta de acesso. */
export type EmployeeLike = Pick<UserConfig, "id" | "name"> & Partial<UserConfig>;

const chave = (texto: string) => (texto ?? "").trim().toLocaleUpperCase("pt-BR");

/**
 * A conta de acesso é de um mecânico?
 *
 * Vale o cargo escolhido na tela e também a permissão de atualizar OS: quem
 * pode mexer no andamento do serviço é, na prática, quem trabalha nele.
 */
export function accessIsMechanic(account: Pick<AccessAccount, "role" | "permissions">): boolean {
  if (account.role === "Mecânico") return true;
  return (account.permissions ?? []).includes("orders.update") && account.role !== "Super Admin";
}

/**
 * O funcionário correspondente a uma conta de acesso, se existir.
 *
 * Casa pelo vínculo explícito (`employeeId`) e, na falta dele, pelo nome — que
 * é como as duas telas foram preenchidas antes de o vínculo existir. O nome é
 * comparado sem depender de maiúscula/minúscula porque os cadastros passaram a
 * gravar em maiúsculo e os antigos não estão.
 */
export function employeeForAccount(account: AccessAccount, employees: EmployeeLike[]): EmployeeLike | null {
  if (account.employeeId) {
    const porVinculo = employees.find((employee) => employee.id === account.employeeId);
    if (porVinculo) return porVinculo;
  }
  const nome = chave(account.name);
  if (!nome) return null;
  return employees.find((employee) => chave(employee.name) === nome) ?? null;
}

/**
 * As contas de mecânico que ainda não têm cadastro de funcionário.
 *
 * É essa lista que a tela mostra para o dono resolver com um clique, em vez de
 * ele descobrir sozinho, meses depois, que a OS nunca teve aquele nome.
 */
export function mechanicsWithoutEmployee(accounts: AccessAccount[], employees: EmployeeLike[]): AccessAccount[] {
  return accounts.filter((account) =>
    account.active !== false
    && accessIsMechanic(account)
    && employeeForAccount(account, employees) === null);
}

/**
 * O cadastro de funcionário a criar a partir de uma conta de acesso.
 *
 * `id` vem de fora porque quem numera os funcionários é o sistema, não este
 * módulo — e o mesmo id precisa voltar para a conta como `employeeId`, senão
 * na próxima vez casaria de novo pelo nome e criaria um segundo cadastro.
 */
export function employeeFromAccount(account: AccessAccount, id: string): UserConfig {
  const mecanico = accessIsMechanic(account);
  return {
    id,
    name: chave(account.name),
    role: account.role,
    position: mecanico ? "Mecânico" : account.role === "Super Admin" ? "Responsável" : "Atendente de Balcão",
    phone: account.phone ?? "",
    active: account.active !== false,
    isMechanic: mecanico,
    isResponsibleMechanic: false,
    canReceiveServiceOrders: mecanico,
    canManageAllOrders: account.role === "Super Admin",
    employmentType: "Fixo",
    baseSalary: 0,
    paymentDay: 5,
    currentOrders: 0,
    userId: account.uid,
  };
}

/**
 * Os mecânicos que a OS pode escolher.
 *
 * Fica aqui, e não solto na tela, porque três telas fazem a mesma pergunta —
 * a nova OS, o serviço rápido e o detalhe da OS — e elas precisam responder
 * igual. Funcionário inativo não entra; a ordem é a do alfabeto, para a lista
 * não trocar de posição a cada carregamento do Firestore.
 */
export function mechanicsForOrders(employees: EmployeeLike[]): EmployeeLike[] {
  return employees
    .filter((employee) => employee.active !== false && isMechanicUser(employee))
    .sort((um, outro) => chave(um.name).localeCompare(chave(outro.name), "pt-BR"));
}

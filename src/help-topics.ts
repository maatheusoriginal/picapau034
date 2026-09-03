/**
 * A ajuda do sistema, escrita para quem toca a oficina.
 *
 * O botão "Precisa de ajuda?" abria um aviso e mais nada. Ajuda que não
 * responde nada é pior do que não ter: a pessoa clica, não acha, e não clica de
 * novo.
 *
 * O conteúdo fica aqui, e não espalhado na tela, porque é texto que muda quando
 * o sistema muda — e assim dá para conferir por `npm run check:help` que todo
 * assunto tem título, passos e para onde ir.
 */
export type HelpStep = { title: string; detail: string };

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  /** Aba do sistema que resolve o assunto. */
  destination: string;
  steps: HelpStep[];
};

export const helpTopics: HelpTopic[] = [
  {
    id: "os",
    title: "Abrir e fechar uma OS",
    summary: "Da moto entrando no portão até o dinheiro na gaveta.",
    destination: "Ordens de serviço",
    steps: [
      { title: "Escolha quem responde", detail: "Um cliente da casa ou uma empresa parceira. Na busca dá para digitar a placa, o telefone ou o nome — pela placa, a moto já vem escolhida." },
      { title: "Cliente novo, ou nenhum", detail: "\"Cadastrar cliente\" pede só nome e WhatsApp. Se o cliente deixou a moto e saiu, use \"Atender sem cadastrar agora\": a OS abre pela placa e os dados são cobrados na hora de receber." },
      { title: "Escolha a moto", detail: "As motos do cliente aparecem para clicar. \"Outra moto\" abre o cadastro rápido com marca, modelo e versão saindo do catálogo." },
      { title: "Recepção e itens", detail: "Quilometragem, combustível e o problema relatado. As peças saem do estoque com o preço do cadastro; a mão de obra é digitada para esta OS." },
      { title: "Encerrar e receber", detail: "No detalhe da OS, mude a situação para Entrega e finalize. É aí que a forma de pagamento é escolhida e o valor entra no caixa." },
    ],
  },
  {
    id: "preco",
    title: "Como o preço é formado",
    summary: "Custo, margem e até onde dá para dar desconto.",
    destination: "Produtos e estoque",
    steps: [
      { title: "Custo é o que você pagou", detail: "Ao dar entrada de uma compra, o sistema recalcula o custo médio: comprar mais caro hoje não apaga o que estava mais barato no estoque." },
      { title: "Margem sobre o custo", detail: "\"+60%\" quer dizer que o preço é o custo mais 60%: custo 25 vira preço 40." },
      { title: "Margem sobre a venda", detail: "Os mesmos 25 → 40 são 37,5% sobre a venda. É essa a porcentagem que se compara com a taxa do cartão e com o preço do concorrente." },
      { title: "Desconto sem prejuízo", detail: "O cadastro mostra até quantos por cento dá para descontar antes de vender abaixo do que você pagou." },
      { title: "Peça tem preço fixo", detail: "Na OS da empresa parceira o desconto combinado vale só na mão de obra: peça mantém o preço." },
    ],
  },
  {
    id: "estoque",
    title: "Estoque e entrada de peças",
    summary: "Como o saldo sobe, desce e quando o sistema avisa.",
    destination: "Compras e entradas",
    steps: [
      { title: "O saldo desce sozinho", detail: "Peça vendida no PDV e peça usada numa OS saem do estoque. Tirar a peça da OS devolve o saldo." },
      { title: "Entrada de compra", detail: "Em Compras e entradas você lança a quantidade e o custo. O saldo sobe e o custo médio é recalculado." },
      { title: "Estoque mínimo", detail: "Abaixo do mínimo, a peça aparece como Crítico na lista e no aviso da Visão geral. Zerada, aparece como Sem estoque." },
      { title: "Peça sem código de barras", detail: "No cadastro, o botão Gerar cria um código EAN-13 de uso interno, que a leitora do balcão lê." },
    ],
  },
  {
    id: "caixa",
    title: "Caixa: abrir, sangrar e fechar",
    summary: "O dinheiro do dia, conferido na hora de fechar.",
    destination: "Financeiro",
    steps: [
      { title: "Abrir com o fundo de troco", detail: "O caixa começa com o valor que ficou na gaveta. Sem caixa aberto, a venda em dinheiro não tem onde entrar." },
      { title: "Sangria e suprimento", detail: "Sangria tira dinheiro da gaveta (depósito, pagamento). Suprimento põe. Os dois ficam no histórico do dia." },
      { title: "Só dinheiro entra na gaveta", detail: "Cartão, Pix e faturado no parceiro contam como faturamento, mas não como dinheiro em espécie — por isso a conferência do fechamento bate." },
      { title: "Fechar conferindo", detail: "Você digita quanto tem na gaveta e o sistema mostra a diferença para o esperado, em vez de aceitar qualquer número." },
    ],
  },
  {
    id: "parceira",
    title: "Empresa parceira e frota",
    summary: "A moto sai hoje, o dinheiro vem na fatura do mês.",
    destination: "Ordens de serviço",
    steps: [
      { title: "Cadastre a parceira", detail: "Em Configurações → Parceiros e frotas, com o desconto combinado na mão de obra." },
      { title: "Motos da frota", detail: "Elas ficam cadastradas sem dono individual, com a parceira como responsável. Na OS, escolher a parceira já mostra a frota dela." },
      { title: "A OS anda normalmente", detail: "A peça sai do estoque e o serviço é feito no dia, como em qualquer OS." },
      { title: "O dinheiro vem depois", detail: "No encerramento não se escolhe forma de pagamento: o valor vira conta a receber no nome da empresa, com vencimento no dia 1º do mês seguinte." },
    ],
  },
  {
    id: "acessos",
    title: "Quem pode fazer o quê",
    summary: "Funcionário, login e permissão são três coisas.",
    destination: "Usuários e acessos",
    steps: [
      { title: "Funcionário é quem trabalha", detail: "Cadastre em Funcionários. É de lá que sai a lista de mecânicos da OS e a comissão." },
      { title: "Login é o acesso", detail: "Em Usuários e acessos você cria a conta e escolhe o cargo. Se criar um mecânico só aqui, a tela avisa e cria o cadastro de funcionário com um clique." },
      { title: "Permissão é marcada", detail: "Cada permissão é uma caixa na tela: ver e alterar são separados. Quem atende pode consultar as Configurações sem poder mudá-las." },
      { title: "Super Admin é diferente", detail: "Só ele cria usuário, muda a permissão dos outros e vê salário e comissão." },
    ],
  },
  {
    id: "backup",
    title: "Backup e segurança dos dados",
    summary: "O que fazer para não perder o cadastro da oficina.",
    destination: "Administração",
    steps: [
      { title: "Baixar tudo", detail: "Em Administração, o botão de backup baixa um arquivo com todas as coleções gravadas." },
      { title: "Guarde fora do computador", detail: "Nuvem, e-mail ou pendrive. Backup que fica só na máquina da oficina se perde junto com ela." },
      { title: "O sistema avisa quando está velho", detail: "Passando do prazo sem backup, aparece o aviso na tela de Administração." },
    ],
  },
];

/** O assunto pedido, ou nada. */
export function helpTopic(id: string): HelpTopic | null {
  return helpTopics.find((topic) => topic.id === id) ?? null;
}

/** Assuntos que casam com o que foi digitado na busca da ajuda. */
export function searchHelp(termo: string): HelpTopic[] {
  const busca = (termo ?? "").trim().toLowerCase();
  if (busca.length < 2) return helpTopics;
  return helpTopics.filter((topic) =>
    `${topic.title} ${topic.summary} ${topic.destination} ${topic.steps.map((step) => `${step.title} ${step.detail}`).join(" ")}`
      .toLowerCase()
      .includes(busca));
}

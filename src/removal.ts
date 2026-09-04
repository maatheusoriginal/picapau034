/**
 * Apagar cadastro sem apagar a história da oficina.
 *
 * Os cadastros principais — produto, cliente, moto, fornecedor e funcionário —
 * não tinham exclusão nenhuma: dava para editar e nunca remover. Quem digitou o
 * nome errado, cadastrou a mesma peça duas vezes ou criou um cliente de teste
 * ficava com o lixo na lista para sempre.
 *
 * Mas apagar de verdade só é seguro quando o cadastro nunca foi usado. Um
 * produto que já foi vendido, um cliente que já tem OS, uma moto que já passou
 * pela bancada: apagar esses não limpa nada, quebra. A OS antiga passa a
 * apontar para um produto que não existe, o relatório do mês muda sozinho, e o
 * custo médio da peça perde a origem. Nada disso dá erro na hora — só aparece
 * semanas depois, quando ninguém mais liga uma coisa à outra.
 *
 * Então são dois caminhos, e a tela diz qual dos dois vai acontecer ANTES de
 * confirmar:
 *
 *   - sem nenhum vínculo → apaga mesmo, o documento sai do banco;
 *   - com vínculo → desativa: o cadastro fica, some das buscas e dos seletores,
 *     e todo o histórico continua de pé. Dá para reativar.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-removal.ts).
 */
import { normalizePlate } from "./plate";

export type TipoDeCadastro = "produto" | "cliente" | "moto" | "fornecedor" | "funcionario";

/** Um lugar onde o cadastro aparece, com quantas vezes. */
export type Vinculo = {
  /** Como se lê no singular: "1 ordem de serviço". */
  um: string;
  /** E no plural: "3 ordens de serviço". */
  varios: string;
  quantidade: number;
};

export type Decisao = {
  /** "apagar" tira do banco; "desativar" guarda o cadastro e some das buscas. */
  modo: "apagar" | "desativar";
  /** Onde o cadastro aparece. Vazio quando dá para apagar. */
  vinculos: Vinculo[];
  /** Soma das aparições. Zero quando dá para apagar. */
  total: number;
};

/** O que precisa ser lido para decidir. Tudo opcional: o que falta conta zero. */
export type BaseDaOficina = {
  orders?: Array<{ items?: Array<{ productId?: string }>; clientId?: string; motorcycleId?: string; plate?: string; mechanicIds?: string[] }>;
  sales?: Array<{ items?: Array<{ id?: string; productId?: string }>; clientId?: string; mechanicId?: string }>;
  entries?: Array<{ items?: Array<{ productId?: string }>; supplierId?: string }>;
  expenses?: Array<{ supplierId?: string; employeeId?: string }>;
  accounts?: Array<{ personId?: string }>;
  motorcycles?: Array<{ id: string; plate?: string; ownerId?: string }>;
  products?: Array<{ id: string; supplierId?: string }>;
  /** As contas de login, para não apagar funcionário que ainda entra no sistema. */
  access?: Array<{ employeeId?: string }>;
};

const conta = <T,>(lista: T[] | undefined, bate: (item: T) => boolean): number =>
  (lista ?? []).filter(bate).length;

const usaProduto = (itens: Array<{ id?: string; productId?: string }> | undefined, id: string): boolean =>
  (itens ?? []).some((item) => item.productId === id);

/**
 * O mesmo, para os itens de venda do balcão.
 *
 * As vendas antigas não gravavam `productId`: o id do produto ia no campo `id`
 * do item (o item de OS usa `id` para o código da peça e `productId` para o
 * documento, e a venda seguia outra convenção). Sem olhar os dois, uma peça
 * vendida antes desta correção parecia nunca ter sido usada — e seria apagada.
 */
const vendaUsaProduto = (itens: Array<{ id?: string; productId?: string }> | undefined, id: string): boolean =>
  (itens ?? []).some((item) => item.productId === id || (!item.productId && item.id === id));

/**
 * Tudo que segura este cadastro, na ordem em que a oficina entende.
 *
 * Só entram os vínculos com quantidade maior que zero: uma lista com "0 vendas"
 * faz a pessoa procurar uma venda que não existe.
 */
export function vinculosDe(tipo: TipoDeCadastro, id: string, base: BaseDaOficina): Vinculo[] {
  if (!id) return [];
  const achados: Vinculo[] = [];
  const anotar = (um: string, varios: string, quantidade: number) => {
    if (quantidade > 0) achados.push({ um, varios, quantidade });
  };

  if (tipo === "produto") {
    anotar("ordem de serviço", "ordens de serviço", conta(base.orders, (os) => usaProduto(os.items, id)));
    anotar("venda no balcão", "vendas no balcão", conta(base.sales, (venda) => vendaUsaProduto(venda.items, id)));
    anotar("entrada de estoque", "entradas de estoque", conta(base.entries, (entrada) => usaProduto(entrada.items, id)));
  }

  if (tipo === "cliente") {
    anotar("ordem de serviço", "ordens de serviço", conta(base.orders, (os) => os.clientId === id));
    anotar("venda no balcão", "vendas no balcão", conta(base.sales, (venda) => venda.clientId === id));
    anotar("conta a receber", "contas a receber", conta(base.accounts, (conta) => conta.personId === id));
    // A moto não é histórico, é cadastro — mas apagar o dono deixaria a moto
    // órfã, sem ninguém a quem cobrar na próxima entrada.
    anotar("moto no nome dele", "motos no nome dele", conta(base.motorcycles, (moto) => moto.ownerId === id));
  }

  if (tipo === "moto") {
    // A OS guarda o id da moto quando ela já era cadastrada, e sempre a placa.
    // Contar só pelo id perderia a OS aberta pela placa, sem cadastro — que é
    // justamente a que ninguém lembra que existe na hora de apagar a moto.
    const placa = normalizePlate((base.motorcycles ?? []).find((moto) => moto.id === id)?.plate ?? "");
    anotar("ordem de serviço", "ordens de serviço", conta(base.orders, (os) =>
      os.motorcycleId === id || (Boolean(placa) && normalizePlate(os.plate ?? "") === placa)));
  }

  if (tipo === "fornecedor") {
    anotar("peça cadastrada", "peças cadastradas", conta(base.products, (produto) => produto.supplierId === id));
    anotar("entrada de estoque", "entradas de estoque", conta(base.entries, (entrada) => entrada.supplierId === id));
    anotar("gasto lançado", "gastos lançados", conta(base.expenses, (gasto) => gasto.supplierId === id));
    anotar("conta a pagar", "contas a pagar", conta(base.accounts, (conta) => conta.personId === id));
  }

  if (tipo === "funcionario") {
    anotar("ordem de serviço", "ordens de serviço", conta(base.orders, (os) => (os.mechanicIds ?? []).includes(id)));
    anotar("venda no balcão", "vendas no balcão", conta(base.sales, (venda) => venda.mechanicId === id));
    anotar("lançamento no financeiro", "lançamentos no financeiro", conta(base.expenses, (gasto) => gasto.employeeId === id));
    // Login é a trava mais dura: apagar o funcionário deixaria alguém entrando
    // no sistema sem cadastro nenhum na oficina.
    anotar("conta de acesso", "contas de acesso", conta(base.access, (item) => item.employeeId === id));
  }

  return achados;
}

/** Apagar de verdade ou desativar? */
export function decidirExclusao(tipo: TipoDeCadastro, id: string, base: BaseDaOficina): Decisao {
  const vinculos = vinculosDe(tipo, id, base);
  const total = vinculos.reduce((soma, vinculo) => soma + vinculo.quantidade, 0);
  return { modo: total > 0 ? "desativar" : "apagar", vinculos, total };
}

/** "3 ordens de serviço", "1 venda no balcão". */
export function textoDoVinculo(vinculo: Vinculo): string {
  return `${vinculo.quantidade} ${vinculo.quantidade === 1 ? vinculo.um : vinculo.varios}`;
}

/**
 * A frase que a tela mostra antes de confirmar.
 *
 * Diz o que vai acontecer e por quê, com o nome do cadastro no meio: quem
 * confirma sem ler precisa pelo menos ter visto qual dos dois botões apertou.
 */
export function textoDaDecisao(decisao: Decisao, nome: string): string {
  const alvo = nome.trim() || "Este cadastro";
  if (decisao.modo === "apagar") return `${alvo} nunca foi usado em nada. Vai sair do sistema de vez.`;
  return `${alvo} já aparece em ${decisao.vinculos.map(textoDoVinculo).join(", ")}. Apagar quebraria esse histórico, então o cadastro vai ficar como inativo: some das buscas e dos seletores, e tudo que já foi feito continua no lugar. Dá para reativar depois.`;
}

/** O rótulo do botão que confirma. */
export function rotuloDaAcao(decisao: Decisao): string {
  return decisao.modo === "apagar" ? "Apagar de vez" : "Desativar cadastro";
}

/**
 * O cadastro ainda pode ser escolhido em trabalho novo?
 *
 * `active` ausente conta como ativo: os cadastros antigos, feitos antes de a
 * exclusão existir, não têm o campo — e sumir com eles seria bem pior que o
 * problema que a exclusão veio resolver.
 */
export function estaAtivo(registro: { active?: boolean }): boolean {
  return registro.active !== false;
}

/**
 * Só o que ainda pode ser escolhido.
 *
 * Usada nos SELETORES — a peça que entra numa OS, o cliente que abre uma OS, a
 * moto que entra na oficina —, nunca nas listas de cadastro nem no histórico.
 * Desativar tem de sumir do que se escolhe hoje e continuar visível no que já
 * foi feito, senão a OS antiga passa a mostrar item em branco.
 */
export function somenteAtivos<T extends { active?: boolean }>(lista: T[]): T[] {
  return lista.filter(estaAtivo);
}

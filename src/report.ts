/**
 * Relatório do período.
 *
 * A aba "Relatórios" era uma casca: a lista nascia vazia (`records = []`) e o
 * botão de exportar só disparava um aviso dizendo "Relatório exportado em
 * formato PDF" — sem gerar arquivo nenhum. Mentir que gerou é pior que não ter
 * o botão: quem confia procura o arquivo, não acha, e desconfia do resto.
 *
 * O resto do financeiro só sabia responder "hoje" e "acumulado". Nenhuma
 * pergunta que o dono faz de verdade cabe nesses dois: quanto entrou no mês
 * passado, qual peça deu mais lucro na semana, quanto a maquininha comeu de
 * taxa, se o mês está melhor que o anterior. Todas precisam de PERÍODO.
 *
 * Funções puras: quem lê o banco e desenha é a tela (ver scripts/check-report.ts).
 */
import { parseBRDate, revenueEntries, round2, type FinanceEntry } from "./finance";
import type { ExpenseRecord, MovementRecord, OrderRecord, SaleRecord, ServiceOrderItem } from "./types";

/** Período fechado, com os dois extremos incluídos. Datas em ISO (aaaa-mm-dd). */
export type Periodo = { de: string; ate: string };

/** Os atalhos que a tela oferece, na ordem em que a oficina pergunta. */
export const atalhosDePeriodo = ["Hoje", "Últimos 7 dias", "Este mês", "Mês passado", "Este ano"] as const;
export type AtalhoDePeriodo = (typeof atalhosDePeriodo)[number];

const iso = (data: Date): string =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

/** O período de um atalho, calculado a partir de uma data base (hoje, por padrão). */
export function periodoDe(atalho: AtalhoDePeriodo, base: Date = new Date()): Periodo {
  const hoje = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (atalho === "Hoje") return { de: iso(hoje), ate: iso(hoje) };
  if (atalho === "Últimos 7 dias") {
    const inicio = new Date(hoje);
    // Sete dias contando hoje: de segunda a domingo dá sete, não oito.
    inicio.setDate(inicio.getDate() - 6);
    return { de: iso(inicio), ate: iso(hoje) };
  }
  if (atalho === "Este mês") {
    return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) };
  }
  if (atalho === "Mês passado") {
    const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimo = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { de: iso(primeiro), ate: iso(ultimo) };
  }
  return { de: iso(new Date(hoje.getFullYear(), 0, 1)), ate: iso(hoje) };
}

const ultimoDiaDoMes = (ano: number, mes: number): number => new Date(ano, mes + 1, 0).getDate();
const partes = (texto: string) => texto.split("-").map(Number) as [number, number, number];

/**
 * O período imediatamente anterior, para comparar.
 *
 * Ver "este mês" é bom; ver contra o mês passado é o que faz decidir preço. Mas
 * "o anterior" não é sempre a mesma conta: comparar 1 a 4 de setembro com 28 a
 * 31 de agosto responderia a pergunta errada. As regras, na ordem:
 *
 * 1. Mês inteiro (dia 1 ao último) → o mês inteiro anterior.
 * 2. Mês corrente até hoje → os mesmos dias do mês passado, e não os últimos
 *    dias dele. Se o mês anterior for mais curto, para no último dia que ele
 *    tem: 1 a 31 de março compara com 1 a 28 de fevereiro.
 * 3. Ano até hoje → o mesmo trecho do ano passado.
 * 4. Qualquer outro → a mesma quantidade de dias, terminando na véspera.
 *
 * Em janeiro as regras 2 e 3 descrevem o mesmo período; vale a do mês, porque
 * quem olha 1 a 15 de janeiro compara com 1 a 15 de dezembro.
 */
export function periodoAnterior(periodo: Periodo): Periodo {
  const [anoDe, mesDe, diaDe] = partes(periodo.de);
  const [anoAte, mesAte, diaAte] = partes(periodo.ate);
  const inicio = new Date(anoDe, mesDe - 1, diaDe);
  const fim = new Date(anoAte, mesAte - 1, diaAte);

  if (diaDe === 1 && anoDe === anoAte && mesDe === mesAte) {
    const anteriorMes = mesDe - 2;
    const base = new Date(anoDe, anteriorMes, 1);
    const ultimoDesteMes = ultimoDiaDoMes(anoDe, mesDe - 1);
    const ultimoDoAnterior = ultimoDiaDoMes(base.getFullYear(), base.getMonth());
    // Mês inteiro compara com mês inteiro; mês pela metade, com o mesmo trecho.
    const ateDia = diaAte >= ultimoDesteMes ? ultimoDoAnterior : Math.min(diaAte, ultimoDoAnterior);
    return { de: iso(base), ate: iso(new Date(base.getFullYear(), base.getMonth(), ateDia)) };
  }

  if (diaDe === 1 && mesDe === 1 && anoDe === anoAte) {
    const ultimoLaAtras = ultimoDiaDoMes(anoDe - 1, mesAte - 1);
    return {
      de: iso(new Date(anoDe - 1, 0, 1)),
      ate: iso(new Date(anoDe - 1, mesAte - 1, Math.min(diaAte, ultimoLaAtras))),
    };
  }

  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1;
  const fimAnterior = new Date(inicio);
  fimAnterior.setDate(fimAnterior.getDate() - 1);
  const inicioAnterior = new Date(fimAnterior);
  inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));
  return { de: iso(inicioAnterior), ate: iso(fimAnterior) };
}

/**
 * Quanto mudou, em porcentagem.
 *
 * Devolve `null` quando não havia nada antes: "subiu 100%" a partir de zero não
 * quer dizer nada, e mostrado como número faz o mês parecer melhor do que foi.
 * A tela mostra "sem base para comparar" nesse caso.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

/**
 * A data brasileira do registro cai dentro do período?
 *
 * Compara pelo texto ISO, e não por Date: fuso horário em comparação de datas
 * é o que faz uma venda das 21h aparecer no dia seguinte. Registro sem data
 * fica de fora — entrar num período sem se saber em qual é o que faz o
 * relatório de dois meses somar mais que o do ano.
 */
export function dentroDoPeriodo(dataBR: string | undefined, periodo: Periodo): boolean {
  const data = parseBRDate(dataBR);
  if (!data) return false;
  const alvo = iso(data);
  return alvo >= periodo.de && alvo <= periodo.ate;
}

/** Como o período aparece escrito na tela e no arquivo exportado. */
export function periodoEmTexto(periodo: Periodo): string {
  const br = (texto: string) => texto.split("-").reverse().join("/");
  return periodo.de === periodo.ate ? br(periodo.de) : `${br(periodo.de)} a ${br(periodo.ate)}`;
}

export type ResultadoDoPeriodo = {
  /** Tudo que foi cobrado do cliente e virou dinheiro no período. */
  faturamento: number;
  /** O que as peças vendidas custaram, conforme gravado na venda. */
  custoDasPecas: number;
  /** O que a maquininha ficou. */
  taxas: number;
  /** Gastos pagos no período. */
  despesas: number;
  /** Entradas lançadas à mão (sucata, aporte, reembolso). */
  entradasAvulsas: number;
  /** Saídas lançadas à mão. */
  saidasAvulsas: number;
  /** Faturamento − custo das peças − taxas − despesas + avulsas. */
  lucro: number;
  /** Lucro sobre o faturamento, em porcentagem. */
  margem: number;
  /** Quantas vendas e OS entraram. */
  atendimentos: number;
  /** Faturamento dividido pelos atendimentos. */
  ticketMedio: number;
  /** Desconto concedido no período. */
  descontos: number;
};

/**
 * O resultado do período, na ordem em que se lê um DRE.
 *
 * O custo das peças entra porque sem ele o "lucro" é fantasia: vender R$ 1.000
 * de peça que custou R$ 700 não são R$ 1.000 de resultado. O valor é o que foi
 * gravado NO ITEM no momento da venda, e não o custo de hoje — senão um
 * aumento do fornecedor mudaria o lucro de um mês que já fechou.
 */
export function resultadoDoPeriodo(
  periodo: Periodo,
  fontes: { sales?: SaleRecord[]; orders?: OrderRecord[]; expenses?: ExpenseRecord[]; movements?: MovementRecord[] },
): ResultadoDoPeriodo {
  const entradas = revenueEntries(fontes.sales ?? [], fontes.orders ?? []).filter((e) => dentroDoPeriodo(e.date, periodo));
  const faturamento = round2(entradas.reduce((soma, e) => soma + e.settled, 0));
  const custoDasPecas = round2(entradas.reduce((soma, e) => soma + e.cost, 0));
  const taxas = round2(entradas.reduce((soma, e) => soma + e.fee, 0));
  const despesas = round2((fontes.expenses ?? [])
    .filter((gasto) => gasto.status === "Pago" && dentroDoPeriodo(gasto.dueDate, periodo))
    .reduce((soma, gasto) => soma + gasto.amount, 0));
  const avulsas = (fontes.movements ?? []).filter((m) => dentroDoPeriodo(m.date, periodo));
  const entradasAvulsas = round2(avulsas.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0));
  const saidasAvulsas = round2(avulsas.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0));
  const lucro = round2(faturamento - custoDasPecas - taxas - despesas + entradasAvulsas - saidasAvulsas);
  const descontos = round2((fontes.sales ?? [])
    .filter((venda) => dentroDoPeriodo(venda.date, periodo))
    .reduce((soma, venda) => soma + (venda.discount ?? 0), 0));
  return {
    faturamento, custoDasPecas, taxas, despesas, entradasAvulsas, saidasAvulsas, lucro,
    margem: faturamento > 0 ? Math.round((lucro / faturamento) * 1000) / 10 : 0,
    atendimentos: entradas.length,
    ticketMedio: entradas.length ? round2(faturamento / entradas.length) : 0,
    descontos,
  };
}

export type LinhaDePagamento = { forma: string; atendimentos: number; total: number; taxa: number; liquido: number };

/**
 * Quanto entrou por forma de pagamento.
 *
 * É o que responde "vale a pena a maquininha?": a taxa aparece ao lado do
 * total, e não diluída no resultado do mês.
 */
export function porFormaDePagamento(periodo: Periodo, sales: SaleRecord[] = [], orders: OrderRecord[] = []): LinhaDePagamento[] {
  const porForma = new Map<string, LinhaDePagamento>();
  for (const entrada of revenueEntries(sales, orders).filter((e) => dentroDoPeriodo(e.date, periodo))) {
    const forma = entrada.method || "Não informado";
    const atual = porForma.get(forma) ?? { forma, atendimentos: 0, total: 0, taxa: 0, liquido: 0 };
    atual.atendimentos += 1;
    atual.total = round2(atual.total + entrada.settled);
    atual.taxa = round2(atual.taxa + entrada.fee);
    atual.liquido = round2(atual.total - atual.taxa);
    porForma.set(forma, atual);
  }
  return [...porForma.values()].sort((a, b) => b.total - a.total);
}

export type FatiaDoResultado = {
  /** Quanto entrou desta parte do negócio, no período. */
  faturamento: number;
  /** O que custou. Zero na mão de obra: o sistema não sabe o custo da hora. */
  custo: number;
  lucro: number;
  margem: number;
};

export type ResultadoPorTipo = {
  pecas: FatiaDoResultado;
  maoDeObra: FatiaDoResultado;
  /**
   * O que não deu para separar por falta de item gravado.
   *
   * Aparece na tela em vez de ser jogado num dos dois lados: empurrar tudo para
   * "mão de obra" faria a revenda parecer menor do que é, e o contrário faria a
   * oficina parecer uma loja de peças.
   */
  naoClassificado: number;
};

/**
 * O resultado separado entre revenda de peça e mão de obra.
 *
 * São dois negócios diferentes dentro da mesma oficina: um vive de comprar e
 * revender, o outro de hora trabalhada. Com o faturamento somado, não dá para
 * saber qual dos dois está sustentando o mês — e é isso que decide se vale
 * aumentar a margem da peça ou o preço da hora.
 *
 * Quando a venda foi paga em parte, o recebido é repartido na mesma proporção
 * dos itens: uma OS de R$ 1.000 (600 de peça, 400 de serviço) que recebeu R$
 * 500 entra com 300 e 200. Chutar tudo para um lado inventaria faturamento
 * onde não houve.
 *
 * O custo da mão de obra fica em zero de propósito: o sistema não sabe quanto
 * custa a hora do mecânico. Mostrar "margem de 100%" no serviço seria mentira
 * confortável — por isso a tela mostra o faturamento do serviço sem margem.
 */
export function resultadoPorTipo(
  periodo: Periodo,
  fontes: { sales?: SaleRecord[]; orders?: OrderRecord[] },
): ResultadoPorTipo {
  const sales = fontes.sales ?? [];
  const orders = fontes.orders ?? [];
  const itens = new Map<string, ServiceOrderItem[]>();
  sales.forEach((venda) => itens.set(venda.id, venda.items ?? []));
  orders.forEach((os) => itens.set(os.id, os.items ?? []));

  const entradas = revenueEntries(sales, orders).filter((e) => dentroDoPeriodo(e.date, periodo));
  let pecasFat = 0, maoFat = 0, semClasse = 0, pecasCusto = 0;

  for (const entrada of entradas) {
    const lista = itens.get(entrada.id) ?? [];
    const dePeca = lista.filter((i) => i.type === "Peça").reduce((soma, i) => soma + i.price, 0);
    const deMao = lista.filter((i) => i.type === "Mão de obra").reduce((soma, i) => soma + i.price, 0);
    const cheio = dePeca + deMao;
    if (cheio <= 0) {
      // Sem item gravado não há como repartir. O serviço rápido é mão de obra
      // por natureza; o resto fica declarado como não classificado.
      if (/rápido|rapido/i.test(entrada.source)) maoFat += entrada.settled;
      else semClasse += entrada.settled;
      continue;
    }
    pecasFat += entrada.settled * (dePeca / cheio);
    maoFat += entrada.settled * (deMao / cheio);
    pecasCusto += entrada.cost;
  }

  const pecas = round2(pecasFat);
  const mao = round2(maoFat);
  const custo = round2(pecasCusto);
  const lucroPecas = round2(pecas - custo);

  return {
    pecas: {
      faturamento: pecas, custo, lucro: lucroPecas,
      margem: pecas > 0 ? Math.round((lucroPecas / pecas) * 1000) / 10 : 0,
    },
    maoDeObra: { faturamento: mao, custo: 0, lucro: mao, margem: mao > 0 ? 100 : 0 },
    naoClassificado: round2(semClasse),
  };
}

export type LinhaDeItem = { nome: string; quantidade: number; total: number; custo: number; lucro: number };

function contarItens(
  entradas: FinanceEntry[],
  itensDe: (id: string) => ServiceOrderItem[],
  tipo: ServiceOrderItem["type"],
): LinhaDeItem[] {
  const porNome = new Map<string, LinhaDeItem>();
  for (const entrada of entradas) {
    for (const item of itensDe(entrada.id).filter((i) => i.type === tipo)) {
      const nome = item.name || "Sem nome";
      const atual = porNome.get(nome) ?? { nome, quantidade: 0, total: 0, custo: 0, lucro: 0 };
      atual.quantidade += item.quantity ?? 1;
      atual.total = round2(atual.total + item.price);
      atual.custo = round2(atual.custo + (item.cost ?? 0));
      atual.lucro = round2(atual.total - atual.custo);
      porNome.set(nome, atual);
    }
  }
  return [...porNome.values()].sort((a, b) => b.total - a.total);
}

/**
 * As peças que mais saíram no período, com o lucro de cada uma.
 *
 * Ordenado por faturamento, e não por quantidade: vinte parafusos de R$ 2 não
 * dizem mais sobre o mês que um kit de relação de R$ 300.
 */
export function pecasMaisVendidas(
  periodo: Periodo,
  sales: SaleRecord[] = [],
  orders: OrderRecord[] = [],
  limite = 10,
): LinhaDeItem[] {
  const itens = new Map<string, ServiceOrderItem[]>();
  sales.forEach((v) => itens.set(v.id, v.items ?? []));
  orders.forEach((os) => itens.set(os.id, os.items ?? []));
  const entradas = revenueEntries(sales, orders).filter((e) => dentroDoPeriodo(e.date, periodo));
  return contarItens(entradas, (id) => itens.get(id) ?? [], "Peça").slice(0, limite);
}

/** O mesmo para a mão de obra: qual serviço sustenta a oficina. */
export function servicosMaisFeitos(
  periodo: Periodo,
  sales: SaleRecord[] = [],
  orders: OrderRecord[] = [],
  limite = 10,
): LinhaDeItem[] {
  const itens = new Map<string, ServiceOrderItem[]>();
  sales.forEach((v) => itens.set(v.id, v.items ?? []));
  orders.forEach((os) => itens.set(os.id, os.items ?? []));
  const entradas = revenueEntries(sales, orders).filter((e) => dentroDoPeriodo(e.date, periodo));
  return contarItens(entradas, (id) => itens.get(id) ?? [], "Mão de obra").slice(0, limite);
}

/**
 * O arquivo que o botão de exportar entrega.
 *
 * CSV com ponto e vírgula e vírgula decimal: é o que o Excel em português abre
 * com as colunas separadas ao dar duplo clique. Vírgula como separador de campo
 * faria "R$ 1.234,56" virar duas colunas.
 */
export function paraCSV(cabecalho: string[], linhas: Array<Array<string | number>>): string {
  const celula = (valor: string | number) => {
    const texto = typeof valor === "number" ? valor.toFixed(2).replace(".", ",") : String(valor ?? "");
    return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return [cabecalho.map(celula).join(";"), ...linhas.map((linha) => linha.map(celula).join(";"))].join("\r\n");
}

/** O nome do arquivo, com o período dentro: dois relatórios não se confundem na pasta. */
export function nomeDoArquivo(prefixo: string, periodo: Periodo): string {
  return `${prefixo}-${periodo.de}-a-${periodo.ate}.csv`;
}

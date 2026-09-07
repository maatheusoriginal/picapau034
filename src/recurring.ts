/**
 * Contas que se repetem: aluguel, energia, internet, contador, seguro.
 *
 * Elas eram relançadas na mão todo mês. É exatamente o tipo de conta que se
 * esquece — e a que se esquece é a que chega com juros. Dava para lançar 12
 * parcelas de uma vez, mas parcelamento é outra coisa: parcela tem fim e valor
 * fixo, e a conta de energia não tem nem um nem outro.
 *
 * Não existe servidor rodando de madrugada para criar a conta do mês que vem.
 * Então o sistema não inventa lançamento sozinho: ele calcula o que está
 * faltando e mostra na tela, para alguém confirmar. Um gerador automático sem
 * ninguém olhando é como nasce conta duplicada — e conta duplicada em contas a
 * pagar some no meio das outras até o dia em que o saldo não fecha.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-recurring.ts).
 */
import { parseBRDate } from "./finance";
import type { AccountRecord } from "./types";

/** Cada quanto a conta volta. */
export const periodicidades = ["Mensal", "Bimestral", "Trimestral", "Semestral", "Anual"] as const;
export type Periodicidade = (typeof periodicidades)[number];

const mesesDe: Record<Periodicidade, number> = {
  Mensal: 1, Bimestral: 2, Trimestral: 3, Semestral: 6, Anual: 12,
};

const paraBR = (data: Date): string => data.toLocaleDateString("pt-BR");

/**
 * O vencimento seguinte.
 *
 * O dia é preservado quando o mês alcança: aluguel que vence dia 31 vence dia
 * 28 em fevereiro, e volta para 31 em março — e não vira dia 3 de março, que é
 * o que acontece quando se soma um mês sem olhar. E não vira dia 28 para
 * sempre, que é o outro erro: a conta andaria para trás sozinha.
 */
export function proximoVencimento(dueDate: string, periodicidade: Periodicidade, diaOriginal?: number): string {
  const base = parseBRDate(dueDate);
  if (!base) return "";
  const dia = diaOriginal && diaOriginal > 0 ? diaOriginal : base.getDate();
  const avancado = new Date(base.getFullYear(), base.getMonth() + mesesDe[periodicidade], 1);
  const ultimoDia = new Date(avancado.getFullYear(), avancado.getMonth() + 1, 0).getDate();
  return paraBR(new Date(avancado.getFullYear(), avancado.getMonth(), Math.min(dia, ultimoDia)));
}

/** É uma conta que se repete? */
export function ehRecorrente(account: Pick<AccountRecord, "recurrence">): boolean {
  return Boolean(account.recurrence && (periodicidades as readonly string[]).includes(account.recurrence));
}

/**
 * A série a que a conta pertence.
 *
 * Sem um identificador da série, "já lancei o mês que vem?" viraria uma
 * comparação por nome e valor — e duas contas de energia de valores diferentes
 * são a mesma série, enquanto duas de R$ 300 para fornecedores diferentes não
 * são.
 */
export function serieDe(account: AccountRecord): string {
  return account.recurrenceId || account.groupId || account.id;
}

/**
 * Já existe uma conta desta série vencendo nesta data?
 *
 * É a trava contra duplicar. Compara pela série e pela data, e não pelo valor:
 * a conta de luz do mês que vem vai ter outro valor e continua sendo a mesma.
 */
export function jaLancada(accounts: AccountRecord[], serie: string, vencimento: string): boolean {
  return accounts.some((conta) => serieDe(conta) === serie && conta.dueDate === vencimento);
}

/** A conta da próxima competência, pronta para gravar (sem o id, que é da tela). */
export function proximaConta(base: AccountRecord, vencimento: string): Omit<AccountRecord, "id"> {
  return {
    kind: base.kind,
    person: base.person,
    ...(base.personId ? { personId: base.personId } : {}),
    description: base.description,
    category: base.category,
    // O valor do último lançamento é uma sugestão, não uma verdade: energia
    // muda todo mês. Quem confirma corrige antes de gravar.
    amount: base.amount,
    dueDate: vencimento,
    settlements: [],
    ...(base.notes ? { notes: base.notes } : {}),
    origin: "Recorrente",
    installment: 1,
    installments: 1,
    recurrence: base.recurrence,
    recurrenceId: serieDe(base),
    ...(base.recurrenceDay ? { recurrenceDay: base.recurrenceDay } : {}),
    ...(base.recurrenceEndsOn ? { recurrenceEndsOn: base.recurrenceEndsOn } : {}),
  };
}

/** A série acabou? Vale para quem marcou uma data de término. */
export function serieEncerrada(base: AccountRecord, vencimento: string): boolean {
  const limite = parseBRDate(base.recurrenceEndsOn);
  const alvo = parseBRDate(vencimento);
  if (!limite || !alvo) return false;
  return alvo.getTime() > limite.getTime();
}

export type Pendencia = {
  /** A conta mais recente da série, de onde a próxima é copiada. */
  base: AccountRecord;
  serie: string;
  /** O vencimento que está faltando lançar. */
  vencimento: string;
  /** Quantos dias faltam (negativo quando já venceu). */
  emDias: number;
};

/**
 * As próximas contas que ainda não foram lançadas.
 *
 * Só olha para frente até `diasDeAntecedencia`: lançar o aluguel de dezembro em
 * março encheria a tela de contas que ninguém vai pagar tão cedo e faria o
 * total a pagar do mês parecer três vezes maior do que é.
 *
 * Uma série pode estar atrasada em mais de uma competência — quem ficou dois
 * meses sem abrir o sistema —, e aí todas as que faltam aparecem, da mais
 * antiga para a mais nova.
 */
export function pendenciasRecorrentes(
  accounts: AccountRecord[],
  hoje: Date = new Date(),
  diasDeAntecedencia = 10,
): Pendencia[] {
  const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const limite = new Date(hojeZerado);
  limite.setDate(limite.getDate() + diasDeAntecedencia);

  // A última conta de cada série é a base: é ela que tem o valor mais recente.
  const ultimaDaSerie = new Map<string, AccountRecord>();
  accounts.filter(ehRecorrente).forEach((conta) => {
    const serie = serieDe(conta);
    const atual = ultimaDaSerie.get(serie);
    const data = parseBRDate(conta.dueDate)?.getTime() ?? 0;
    const dataAtual = atual ? parseBRDate(atual.dueDate)?.getTime() ?? 0 : -1;
    if (!atual || data > dataAtual) ultimaDaSerie.set(serie, conta);
  });

  const pendencias: Pendencia[] = [];
  ultimaDaSerie.forEach((base, serie) => {
    let vencimento = proximoVencimento(base.dueDate, base.recurrence as Periodicidade, base.recurrenceDay);
    // Um teto de repetições protege contra série muito antiga virar um laço
    // longo — e contra data inválida devolver texto vazio para sempre.
    for (let volta = 0; volta < 24 && vencimento; volta += 1) {
      const data = parseBRDate(vencimento);
      if (!data || data.getTime() > limite.getTime()) break;
      if (serieEncerrada(base, vencimento)) break;
      if (!jaLancada(accounts, serie, vencimento)) {
        pendencias.push({
          base, serie, vencimento,
          emDias: Math.round((data.getTime() - hojeZerado.getTime()) / 86400000),
        });
      }
      vencimento = proximoVencimento(vencimento, base.recurrence as Periodicidade, base.recurrenceDay);
    }
  });

  return pendencias.sort((a, b) =>
    (parseBRDate(a.vencimento)?.getTime() ?? 0) - (parseBRDate(b.vencimento)?.getTime() ?? 0));
}

/** Como a pendência é anunciada na tela. */
export function textoDaPendencia(pendencia: Pendencia): string {
  const quando = pendencia.emDias < 0
    ? `venceu há ${Math.abs(pendencia.emDias)} dia(s)`
    : pendencia.emDias === 0 ? "vence hoje" : `vence em ${pendencia.emDias} dia(s)`;
  return `${pendencia.base.description} · ${pendencia.vencimento} (${quando})`;
}

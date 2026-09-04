/**
 * Confere as contas recorrentes: aluguel, energia, internet.
 *
 * O que interessa aqui é não duplicar e não errar o dia. Conta duplicada em
 * contas a pagar some no meio das outras até o dia em que o saldo não fecha, e
 * um aluguel que vence dia 31 e vira dia 28 para sempre anda para trás sozinho.
 *
 * Rode com: npm run check:recurring
 */
import {
  ehRecorrente, jaLancada, pendenciasRecorrentes, periodicidades, proximaConta,
  proximoVencimento, serieDe, serieEncerrada, textoDaPendencia,
} from "../src/recurring";
import type { AccountRecord } from "../src/types";

const json = (value: unknown) => JSON.stringify(value);
// 10/03/2026 como "hoje" de referência.
const hoje = new Date(2026, 2, 10);

const conta = (extra: Partial<AccountRecord> = {}): AccountRecord => ({
  id: "CP-0001", kind: "pagar", person: "IMOBILIARIA CENTRO", description: "ALUGUEL DA OFICINA",
  category: "Contas fixas", amount: 2500, dueDate: "05/03/2026", settlements: [], origin: "Manual",
  installment: 1, installments: 1, recurrence: "Mensal", recurrenceId: "SERIE-ALUGUEL",
  ...extra,
});

const carteira: AccountRecord[] = [
  // Aluguel: lançado até março, falta abril.
  conta({ id: "CP-0001", dueDate: "05/01/2026" }),
  conta({ id: "CP-0002", dueDate: "05/02/2026" }),
  conta({ id: "CP-0003", dueDate: "05/03/2026" }),
  // Energia: parou em janeiro, então fevereiro E março estão faltando.
  conta({ id: "CP-0010", description: "ENERGIA", person: "CEMIG", recurrenceId: "SERIE-ENERGIA",
    amount: 480, dueDate: "12/01/2026" }),
  // Seguro anual: o próximo é daqui a meses, não deve aparecer agora.
  conta({ id: "CP-0020", description: "SEGURO", person: "SEGURADORA", recurrenceId: "SERIE-SEGURO",
    recurrence: "Anual", amount: 1200, dueDate: "20/07/2025" }),
  // Conta comum, não recorrente: nunca entra na lista.
  conta({ id: "CP-0030", description: "PECAS DO FORNECEDOR", recurrenceId: undefined, recurrence: undefined,
    amount: 900, dueDate: "08/03/2026" }),
];

const pendencias = pendenciasRecorrentes(carteira, hoje);
const daEnergia = pendencias.filter((p) => p.serie === "SERIE-ENERGIA");

const casos: Array<[string, unknown, unknown]> = [
  // --- O próximo vencimento ---
  ["um mês depois", proximoVencimento("05/03/2026", "Mensal"), "05/04/2026"],
  ["a virada do ano", proximoVencimento("15/12/2026", "Mensal"), "15/01/2027"],
  ["bimestral pula dois meses", proximoVencimento("10/01/2026", "Bimestral"), "10/03/2026"],
  ["trimestral pula três", proximoVencimento("10/01/2026", "Trimestral"), "10/04/2026"],
  ["semestral pula seis", proximoVencimento("10/01/2026", "Semestral"), "10/07/2026"],
  ["anual pula doze", proximoVencimento("20/07/2025", "Anual"), "20/07/2026"],
  // Somar "um mês" ao dia 31 de janeiro sem olhar dá 3 de março.
  ["dia 31 em fevereiro para no dia 28", proximoVencimento("31/01/2026", "Mensal"), "28/02/2026"],
  ["e em ano bissexto, no 29", proximoVencimento("31/01/2024", "Mensal"), "29/02/2024"],
  ["dia 31 num mês de 30 para no 30", proximoVencimento("31/03/2026", "Mensal"), "30/04/2026"],
  // O outro erro: depois de encolher para 28, a conta ficaria no 28 para sempre.
  ["o dia original volta no mês que alcança", proximoVencimento("28/02/2026", "Mensal", 31), "31/03/2026"],
  ["data inválida não inventa vencimento", proximoVencimento("", "Mensal"), ""],

  // --- O que é recorrente ---
  ["conta com periodicidade é recorrente", ehRecorrente(conta()), true],
  ["conta sem periodicidade não é", ehRecorrente(conta({ recurrence: undefined })), false],
  ["periodicidade inventada não vale", ehRecorrente(conta({ recurrence: "Quinzenal" })), false],
  ["todas as periodicidades da lista valem", periodicidades.every((p) => ehRecorrente(conta({ recurrence: p }))), true],

  // --- A série ---
  ["a série vem do recurrenceId", serieDe(conta()), "SERIE-ALUGUEL"],
  ["sem recurrenceId, o próprio id serve", serieDe(conta({ recurrenceId: undefined })), "CP-0001"],
  ["já lançada acha pela série e pela data", jaLancada(carteira, "SERIE-ALUGUEL", "05/03/2026"), true],
  ["e não confunde com outra data", jaLancada(carteira, "SERIE-ALUGUEL", "05/04/2026"), false],
  // Duas contas de R$ 300 para fornecedores diferentes não são a mesma série.
  ["nem com outra série", jaLancada(carteira, "SERIE-ENERGIA", "05/03/2026"), false],

  // --- O que está faltando lançar ---
  // Em 10/03, o aluguel do dia 5 de abril ainda está a 26 dias: lançá-lo agora
  // inflaria o total a pagar do mês com uma conta que ninguém vai pagar tão cedo.
  ["o aluguel de abril ainda não aparece em 10 de março",
    pendencias.some((p) => p.serie === "SERIE-ALUGUEL"), false],
  ["mas aparece quando chega perto",
    pendenciasRecorrentes(carteira, new Date(2026, 2, 28)).some((p) => p.serie === "SERIE-ALUGUEL" && p.vencimento === "05/04/2026"), true],
  // A energia parou em janeiro: fevereiro e março estão em falta, não só um.
  ["a energia atrasada aparece nas duas competências", daEnergia.length, 2],
  ["da mais antiga para a mais nova", json(daEnergia.map((p) => p.vencimento)), json(["12/02/2026", "12/03/2026"])],
  ["e diz quantos dias faz que venceu", daEnergia[0]!.emDias, -26],
  // Lançar o seguro de julho em março encheria a tela e inflaria o total a pagar.
  ["o que vence longe não aparece ainda", pendencias.some((p) => p.serie === "SERIE-SEGURO"), false],
  ["conta comum nunca vira pendência", pendencias.some((p) => p.base.id === "CP-0030"), false],
  ["a base é a conta mais recente da série",
    pendenciasRecorrentes(carteira, new Date(2026, 2, 28)).find((p) => p.serie === "SERIE-ALUGUEL")!.base.id, "CP-0003"],
  ["carteira vazia não gera pendência", pendenciasRecorrentes([], hoje).length, 0],
  // A trava contra duplicar: lançar e recalcular não pode trazer a mesma de novo.
  ["depois de lançada, a pendência some", (() => {
    const nova = { ...proximaConta(conta({ id: "CP-0003" }), "05/04/2026"), id: "CP-0040" } as AccountRecord;
    return pendenciasRecorrentes([...carteira, nova], new Date(2026, 2, 28))
      .some((p) => p.vencimento === "05/04/2026" && p.serie === "SERIE-ALUGUEL");
  })(), false],
  ["e lançar o mês seguinte não ressuscita o anterior", (() => {
    const nova = { ...proximaConta(conta({ id: "CP-0003" }), "05/04/2026"), id: "CP-0040" } as AccountRecord;
    return pendenciasRecorrentes([...carteira, nova], new Date(2026, 2, 28))
      .filter((p) => p.serie === "SERIE-ALUGUEL").length;
  })(), 0],

  // --- A conta que vai ser gravada ---
  ["copia o favorecido", proximaConta(conta(), "05/04/2026").person, "IMOBILIARIA CENTRO"],
  ["copia o valor da última", proximaConta(conta({ amount: 2600 }), "05/04/2026").amount, 2600],
  ["nasce sem baixa nenhuma", proximaConta(conta(), "05/04/2026").settlements.length, 0],
  ["nasce marcada como recorrente", proximaConta(conta(), "05/04/2026").origin, "Recorrente"],
  ["continua na mesma série", proximaConta(conta(), "05/04/2026").recurrenceId, "SERIE-ALUGUEL"],
  ["não é parcela de nada", proximaConta(conta(), "05/04/2026").installments, 1],

  // --- Fim da série ---
  ["antes do fim, continua", serieEncerrada(conta({ recurrenceEndsOn: "31/12/2026" }), "05/04/2026"), false],
  ["depois do fim, para", serieEncerrada(conta({ recurrenceEndsOn: "31/03/2026" }), "05/04/2026"), true],
  ["sem data de fim, nunca para", serieEncerrada(conta(), "05/04/2030"), false],
  ["a série encerrada não vira pendência",
    pendenciasRecorrentes([conta({ dueDate: "05/03/2026", recurrenceEndsOn: "31/03/2026" })], hoje).length, 0],

  // --- Como aparece escrito ---
  ["o texto diz o que venceu e quando",
    textoDaPendencia(daEnergia[0]!), "ENERGIA · 12/02/2026 (venceu há 26 dia(s))"],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nAs contas recorrentes fecham." : `\n${falhas} caso(s) errados.`);

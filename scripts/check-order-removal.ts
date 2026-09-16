/**
 * Confere as regras de apagar uma ordem de serviço.
 *
 * Apagar é o botão que não tem volta. A conferência existe para que a trava do
 * dinheiro e a devolução da peça não dependam de alguém lembrar delas ao mexer
 * na tela.
 *
 * Rode com: npm run check:order-removal
 */
import {
  decidirExclusaoDaOS,
  devolucaoAoEstoque,
  pecasAdevolver,
  registroDaExclusao,
  rotuloDaExclusao,
  tituloDaExclusao,
} from "../src/order-removal";
import type { OrderRecord } from "../src/types";

const os = (partes: Partial<OrderRecord>): OrderRecord => ({
  id: "OS-0001", customer: "MARIA SOUZA", bike: "HONDA BIZ 125", plate: "XYZ-9999",
  mechanic: "RONALDO", mechanicIds: [], time: "16/09/2026, 09:00", status: "Recepção",
  tone: "amber", ...partes,
});

const aberta = os({});
const comPecas = os({ deductedItems: [{ productId: "PRD-1", quantity: 2 }, { productId: "PRD-2", quantity: 1 }] });
const encerrada = os({ closed: true, total: 250, paymentMethod: "PIX", closedAt: "16/09/2026" });
const soHistorico = os({ closed: true, backfilled: true, total: 500 });

const daAberta = decidirExclusaoDaOS(aberta);
const dasPecas = decidirExclusaoDaOS(comPecas);
const daEncerrada = decidirExclusaoDaOS(encerrada);
const doHistorico = decidirExclusaoDaOS(soHistorico);

const casos: Array<[string, unknown, unknown]> = [
  // OS aberta em duplicidade, ou na moto errada, ou cliente que desistiu.
  ["OS ainda aberta pode ser apagada", daAberta.modo, "apagar"],
  ["e o texto diz que não mexe em mais nada", daAberta.motivo.includes("não mexe em mais nada"), true],
  ["sem peça, nada volta para o estoque", daAberta.pecasDevolvidas, 0],

  /*
    A trava é uma só: OS encerrada que passou pelo caixa.

    Encerrar gera dinheiro — gaveta do caixa, faturamento do dia, relatório do
    mês, e conta a receber quando fica fiado. Apagar o documento não desfaz nada
    disso: sobraria lançamento apontando para OS que não existe, e a conferência
    do caixa fecharia com diferença que ninguém explica.
  */
  ["OS encerrada NÃO pode ser apagada", daEncerrada.modo, "bloqueado"],
  ["e a tela diz por quê", daEncerrada.motivo.includes("entrou no caixa"), true],
  ["e diz o que fazer no lugar", daEncerrada.saida?.includes("estorno"), true],
  ["OS aberta não recebe recado de estorno", daAberta.saida, undefined],

  // A lançada só para histórico nasce encerrada, mas nunca tocou em dinheiro:
  // é justamente a que alguém digita errado ao lançar a pilha de papel antiga.
  ["OS lançada só para histórico pode ser apagada", doHistorico.modo, "apagar"],
  ["e o texto explica que ela não entrou no caixa", doHistorico.motivo.includes("só para o histórico"), true],
  ["e não devolve peça, porque nunca baixou", doHistorico.pecasDevolvidas, 0],

  // A peça precisa voltar para a prateleira, senão o estoque passa a mentir.
  ["OS com peça avisa quantas voltam", dasPecas.pecasDevolvidas, 3],
  ["e o texto diz isso antes de confirmar", dasPecas.motivo.includes("3 peças"), true],
  ["uma peça só é escrita no singular", decidirExclusaoDaOS(os({ deductedItems: [{ productId: "PRD-1", quantity: 1 }] })).motivo.includes("1 peça do estoque"), true],
  ["a contagem soma as quantidades, não as linhas", pecasAdevolver(comPecas), 3],

  // A devolução vai com sinal NEGATIVO porque quem grava subtrai o delta do
  // saldo: é a mesma convenção de saveOrderWithStock.
  ["a devolução tem uma linha por peça", devolucaoAoEstoque(comPecas).length, 2],
  ["e entra negativa, para somar no saldo", devolucaoAoEstoque(comPecas)[0].quantity, -2],
  ["OS sem peça não devolve nada", devolucaoAoEstoque(aberta).length, 0],
  ["linha sem produto não vira devolução fantasma", devolucaoAoEstoque(os({ deductedItems: [{ productId: "", quantity: 5 }] })).length, 0],
  ["nem linha com quantidade zero", devolucaoAoEstoque(os({ deductedItems: [{ productId: "PRD-1", quantity: 0 }] })).length, 0],

  // Os rótulos: o botão precisa dizer o que vai acontecer.
  ["o botão avisa que devolve ao estoque", rotuloDaExclusao(dasPecas), "Apagar e devolver ao estoque"],
  ["sem peça, o botão é direto", rotuloDaExclusao(daAberta), "Apagar a OS"],
  ["e no caso bloqueado não convida a apagar", rotuloDaExclusao(daEncerrada), "Entendi"],
  ["o título pergunta antes de apagar", tituloDaExclusao(daAberta), "Apagar esta ordem de serviço?"],
  ["e afirma quando não dá", tituloDaExclusao(daEncerrada), "Esta OS não pode ser apagada"],

  /*
    O rastro mora FORA da OS, porque a OS some. Sem isso "sumiu uma OS" vira
    discussão sem resposta — e é pergunta que aparece semanas depois.
  */
  ["o registro guarda o número da OS", registroDaExclusao(comPecas, { uid: "u1", name: "RONALDO" }).orderId, "OS-0001"],
  ["e quem apagou", registroDaExclusao(comPecas, { uid: "u1", name: "RONALDO" }).actorName, "RONALDO"],
  ["com o uid, que é o que a regra do banco exige", registroDaExclusao(comPecas, { uid: "u1", name: "RONALDO" }).actorUid, "u1"],
  ["e o que a OS era, já que ela não existe mais", registroDaExclusao(comPecas, { uid: "u1", name: "RONALDO" }).summary, "MARIA SOUZA · HONDA BIZ 125 · XYZ-9999"],
  ["quantas peças voltaram", registroDaExclusao(comPecas, { uid: "u1", name: "RONALDO" }).returnedParts, 3],
  ["OS sem dado nenhum não vira registro em branco", registroDaExclusao(os({ customer: "", bike: "", plate: "" }), { uid: "u1", name: "R" }).summary, "OS sem dados"],
  ["o valor entra como número, mesmo sem total", registroDaExclusao(aberta, { uid: "u1", name: "R" }).total, 0],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nApagar OS obedece as travas." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

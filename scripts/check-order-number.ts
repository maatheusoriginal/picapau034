/**
 * O próximo número de OS.
 *
 * Esta conferência nasce de um defeito que a oficina encontrou: "Não foi
 * possível gerar um número livre para a ordem de serviço" com o banco cheio de
 * números livres. O primeiro caso aqui é exatamente aquela tela.
 *
 * Rode com: npm run check:order-number
 */
import { buscarNumeroLivre } from "../src/order-number";

/** Um banco de mentira: os números destas OS estão ocupados. */
const banco = (ocupados: number[]) => async (numero: number) => ocupados.includes(numero);
const ate = (fim: number) => Array.from({ length: fim }, (_, i) => i + 1);

async function main() {
  const casos: Array<[string, unknown, unknown]> = [];
  const achar = async (ocupados: number[], sugerido: number) => buscarNumeroLivre(banco(ocupados), sugerido);

  // O CASO DA OFICINA: 60 OS no banco e o palpite chegando como 1.
  const daOficina = await achar(ate(60), 1);
  casos.push(
    ["com 60 OS e o palpite chegando como 1, acha o 61", daOficina.numero, 61],
    // Antes eram 50 leituras e uma recusa. O salto dobrado resolve com poucas.
    ["e resolve em poucas leituras, não uma por número", daOficina.leituras <= 15, true],
  );

  // O caminho normal: o palpite está certo e é livre. Uma leitura, e pronto.
  const normal = await achar(ate(60), 61);
  casos.push(
    ["palpite certo devolve o palpite", normal.numero, 61],
    ["com uma leitura só", normal.leituras, 1],
  );

  // Oficina grande, palpite muito baixo.
  casos.push(
    ["3000 OS e palpite 1: acha o 3001", (await achar(ate(3000), 1)).numero, 3001],
    ["e continua sendo cerca de duas dezenas de leituras", (await achar(ate(3000), 1)).leituras <= 30, true],
  );

  // Palpite estragado não pode derrubar a abertura da OS.
  for (const [rotulo, palpite] of [["zero", 0], ["negativo", -5], ["quebrado", NaN]] as Array<[string, number]>) {
    casos.push([`palpite ${rotulo} começa do 1 em vez de quebrar`, (await achar([], palpite)).numero, 1]);
    casos.push([`palpite ${rotulo}, com banco cheio, ainda acha livre`, (await achar(ate(10), palpite)).numero, 11]);
  }

  // Banco vazio.
  casos.push(["banco vazio devolve o palpite", (await achar([], 1)).numero, 1]);

  /*
    Numeração com buraco.

    A busca binária devolve UM número livre com o anterior ocupado, e não
    necessariamente o menor livre do banco. Isto está escrito aqui para ficar
    combinado: o que ela NUNCA pode fazer é devolver número ocupado.
  */
  const comBuraco = [1, 2, 3, 5, 6, 7, 8, 9, 10];
  const escolhido = (await achar(comBuraco, 1)).numero;
  casos.push(
    ["com buraco na numeração, nunca devolve número ocupado", comBuraco.includes(escolhido), false],
    ["e o número devolvido é maior que zero", escolhido > 0, true],
  );

  // O invariante que importa em todos os casos: o devolvido está livre.
  for (const [rotulo, ocupados, palpite] of [
    ["oficina cheia", ate(500), 1],
    ["palpite no meio", ate(500), 250],
    ["palpite além do fim", ate(500), 900],
    ["ímpares ocupados", ate(200).filter((n) => n % 2 === 1), 1],
  ] as Array<[string, number[], number]>) {
    const resultado = await achar(ocupados, palpite);
    casos.push([`${rotulo}: o número devolvido está livre`, ocupados.includes(resultado.numero), false]);
  }

  let falhas = 0;
  for (const [nome, obtido, esperado] of casos) {
    const ok = obtido === esperado;
    if (!ok) falhas += 1;
    console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
  }
  console.log(falhas === 0 ? "\nA OS sempre acha um número livre." : `\n${falhas} caso(s) errados.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((erro) => { console.error(erro); process.exit(1); });

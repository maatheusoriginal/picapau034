/**
 * O próximo número de ordem de serviço.
 *
 * A oficina viu isto quebrar: "Não foi possível gerar um número livre para a
 * ordem de serviço. Tente novamente." — com o banco cheio de números livres.
 *
 * A causa era o formato da busca. O número sugerido vem da tela: o maior id que
 * a LISTA CARREGADA conhece, mais um. Esse palpite pode chegar baixo — a lista
 * ainda não terminou de sincronizar, ou quem clicou não enxerga todas as OS — e
 * a versão anterior tentava 50 números a partir dele e desistia. Numa oficina
 * com 60 OS, um palpite de 1 batia em 50 números ocupados e parava, sem nunca
 * chegar no 61 que estava livre.
 *
 * Aqui o palpite é só o ponto de partida. Ocupado? O salto DOBRA até achar um
 * livre, e a busca binária volta para o menor livre daquele intervalo. Isso
 * são umas duas dezenas de leituras mesmo com milhares de OS, contra uma
 * leitura por número.
 *
 * A decisão fica separada da leitura de propósito: assim ela é conferida com
 * dados na mão (`npm run check:order-number`), sem navegador e sem banco.
 */

/** Responde se aquele número já tem OS. */
export type NumeroOcupado = (numero: number) => Promise<boolean>;

export type BuscaDeNumero = {
  /** O número livre encontrado. */
  numero: number;
  /** Quantas vezes foi preciso perguntar ao banco. Serve para a conferência. */
  leituras: number;
};

/** Teto de dobras. 24 alcançam 16 milhões de OS: garantia, não expectativa. */
const DOBRAS = 24;

export async function buscarNumeroLivre(ocupado: NumeroOcupado, sugerido: number): Promise<BuscaDeNumero> {
  let leituras = 0;
  const perguntar = async (numero: number) => { leituras += 1; return ocupado(numero); };

  // Palpite estragado (vazio, zero, negativo, quebrado) começa do 1 em vez de
  // derrubar a abertura da OS.
  const base = Number.isFinite(sugerido) && sugerido >= 1 ? Math.floor(sugerido) : 1;
  if (!(await perguntar(base))) return { numero: base, leituras };

  let ultimoOcupado = base;
  let primeiroLivre = 0;
  for (let passo = 1, dobra = 0; dobra < DOBRAS; passo *= 2, dobra += 1) {
    const alvo = base + passo;
    if (!(await perguntar(alvo))) { primeiroLivre = alvo; break; }
    ultimoOcupado = alvo;
  }
  if (!primeiroLivre) throw new Error("A numeração das ordens de serviço chegou ao limite do sistema. Fale com o suporte.");

  /*
    Busca binária entre o último ocupado e o primeiro livre.

    Ela devolve UM número livre com o anterior ocupado — não necessariamente o
    menor livre do banco inteiro. Numeração com buraco (OS apagada) pode deixar
    um número vago para trás, e isso é de propósito: pular um número vago não
    custa nada, e varrer o banco atrás dele custaria uma leitura por OS a cada
    abertura de atendimento.
  */
  while (primeiroLivre - ultimoOcupado > 1) {
    const meio = Math.floor((ultimoOcupado + primeiroLivre) / 2);
    if (await perguntar(meio)) ultimoOcupado = meio; else primeiroLivre = meio;
  }
  return { numero: primeiroLivre, leituras };
}

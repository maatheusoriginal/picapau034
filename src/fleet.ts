/**
 * Achar a moto na OS de empresa parceira.
 *
 * A busca olhava só as motos com `partnerId` da parceira escolhida e comparava
 * o texto cru. Duas coisas quebravam por causa disso, as duas reproduzidas na
 * oficina:
 *
 * 1. A placa é gravada com hífen ("FLA-2C34"). Quem digita "FLA2" — que é como
 *    se digita placa quando se está com pressa — não achava a moto que estava
 *    ali, na frota, na lista logo abaixo.
 *
 * 2. Uma moto que já existe no sistema, cadastrada para um cliente, nunca
 *    aparecia. E é o caso comum: a oficina já atendeu aquela moto como cliente
 *    direto antes de ela passar a rodar para a parceira. Sem achá-la, o jeito
 *    era cadastrar de novo — duas motos com a mesma placa e o histórico da moto
 *    partido no meio.
 *
 * Por isso a busca devolve DOIS grupos separados, nunca uma lista só: o que é
 * da frota e o que existe no sistema mas é de outro. A tela mostra os dois com
 * o rótulo de cada um, porque escolher a moto de um cliente para uma OS da
 * parceira é uma decisão de quem atende — e incluir a moto na frota é uma ação
 * à parte, com botão próprio. Puxar a moto para a OS não muda de quem ela é.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-fleet.ts).
 */
import { normalizePlate } from "./plate";

/** O que a busca precisa saber de uma moto. */
export type MotoBuscavel = {
  id: string;
  plate: string;
  brand?: string;
  model?: string;
  year?: string;
  partnerId?: string;
  partnerName?: string;
  ownerId?: string;
  ownerName?: string;
};

/** Sem acento e sem maiúscula: "GONÇALVES" e "goncalves" são a mesma palavra. */
function comparavel(valor: string): string {
  return (valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * A moto casa com o que foi digitado?
 *
 * A placa é comparada normalizada dos dois lados — sem hífen, sem espaço, sem
 * maiúscula —, então "FLA2", "fla-2c34" e "FLA 2C34" acham a mesma moto. O
 * resto (marca, modelo, ano) é comparado sem acento, como texto solto.
 */
export function motoBate(moto: MotoBuscavel, texto: string): boolean {
  const busca = texto.trim();
  if (!busca) return true;
  const placaBuscada = normalizePlate(busca);
  if (placaBuscada && normalizePlate(moto.plate).includes(placaBuscada)) return true;
  const alvo = comparavel(`${moto.brand ?? ""} ${moto.model ?? ""} ${moto.year ?? ""} ${moto.ownerName ?? ""}`);
  return alvo.includes(comparavel(busca));
}

/** A moto já está na frota desta parceira? */
export function estaNaFrota(moto: MotoBuscavel, partnerId: string): boolean {
  return Boolean(partnerId) && moto.partnerId === partnerId;
}

export type BuscaDeFrota = {
  /** As motos da parceira que casam com a busca. */
  daFrota: MotoBuscavel[];
  /**
   * As motos do sistema que casam com a busca e NÃO são da parceira. Só sai da
   * lista vazia quando há busca: sem texto digitado, despejar o sistema inteiro
   * embaixo da frota transformaria escolher em procurar.
   */
  foraDaFrota: MotoBuscavel[];
};

/** Quantos caracteres a busca precisa ter para varrer fora da frota. */
export const MINIMO_PARA_BUSCAR_FORA = 2;

/**
 * Separa o que é da frota do que existe no sistema.
 *
 * Nenhuma moto aparece nos dois grupos, e a ordem é pela placa: numa frota de
 * dezenas de motos, ordem alfabética é a única em que a pessoa sabe onde olhar.
 */
export function buscarMotos(motos: MotoBuscavel[], partnerId: string, texto: string): BuscaDeFrota {
  const busca = (texto ?? "").trim();
  const porPlaca = (a: MotoBuscavel, b: MotoBuscavel) =>
    normalizePlate(a.plate).localeCompare(normalizePlate(b.plate), "pt-BR");
  const daFrota = motos.filter((moto) => estaNaFrota(moto, partnerId) && motoBate(moto, busca)).sort(porPlaca);
  if (busca.length < MINIMO_PARA_BUSCAR_FORA) return { daFrota, foraDaFrota: [] };
  const foraDaFrota = motos.filter((moto) => !estaNaFrota(moto, partnerId) && motoBate(moto, busca)).sort(porPlaca);
  return { daFrota, foraDaFrota };
}

/**
 * O aviso de quem é a moto escolhida, quando ela não é da parceira.
 *
 * Devolve texto vazio quando não há o que avisar. Escolher a moto de um cliente
 * numa OS de parceira é legítimo — a moto está lá, quem paga é a parceira —,
 * mas quem atende tem de ver isso escrito antes de salvar, senão a fatura do
 * mês chega com uma moto que ninguém reconhece.
 */
export function avisoDeMotoDeFora(moto: MotoBuscavel | null | undefined, partnerId: string, parceira: string): string {
  if (!moto || !partnerId || estaNaFrota(moto, partnerId)) return "";
  if (moto.ownerName) return `Esta moto é de ${moto.ownerName}, não da frota da ${parceira}.`;
  if (moto.partnerId) return `Esta moto é de outra empresa parceira, não da ${parceira}.`;
  return `Esta moto ainda não está na frota da ${parceira}.`;
}

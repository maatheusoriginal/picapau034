/**
 * Moto elétrica: a que não tem placa.
 *
 * A oficina passou a pegar motos elétricas para consertar, e elas não têm
 * placa. Isso não é "um campo a menos": a placa é o que IDENTIFICA a moto no
 * sistema inteiro — é o id dela no banco (`MOTO-ABC1D23`), é o que a busca
 * procura, é o que sai no cupom e é como o balcão acha o histórico quando a
 * moto volta. Tirar a placa sem pôr nada no lugar faria a moto elétrica sumir
 * no meio das outras no dia em que o cliente voltasse.
 *
 * No lugar dela entra um CÓDIGO DA OFICINA, que o sistema gera sozinho:
 * ELET-001, ELET-002. Ele aparece na OS e no cupom, para a oficina escrever
 * numa etiqueta e colar na moto — é o que faz a moto sem placa ter nome.
 *
 * A FORMA DO CÓDIGO NÃO É ENFEITE. Placa brasileira é três letras e quatro
 * números (ABC-1234) ou três letras, um número, uma letra e dois números
 * (ABC-1D23). "ELET" tem QUATRO letras, então ELET-001 não cabe em nenhum dos
 * dois padrões — e por isso nenhum código de moto elétrica pode colidir com a
 * placa de uma moto de verdade. Duas motos com o mesmo id seriam duas motos
 * dividindo o mesmo histórico, e é o tipo de erro que só aparece meses depois.
 */
import type { MotorcycleRecord } from "./types";

/** O começo de todo código de moto elétrica. Quatro letras, de propósito. */
export const ELECTRIC_PREFIX = "ELET";

/** O código de número n: ELET-001, ELET-042, ELET-1000. */
export function electricCode(n: number): string {
  const numero = Math.max(1, Math.floor(Number(n) || 1));
  return `${ELECTRIC_PREFIX}-${String(numero).padStart(3, "0")}`;
}

/** Este texto é um código de moto elétrica, e não uma placa? */
export function isElectricCode(value: string): boolean {
  return /^ELET-?\d{3,}$/i.test(String(value ?? "").trim());
}

/**
 * O id da moto elétrica no banco.
 *
 * Não passa pelo `motorcycleIdFor`: aquele corta em 7 caracteres, e a partir
 * de ELET-1000 o corte faria "ELET1000" virar "ELET100" — o mesmo id do
 * ELET-100. Duas motos, um documento, histórico misturado.
 */
export function electricBikeId(code: string): string {
  return `MOTO-${String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
}

/**
 * O próximo código livre, olhando as motos que já existem.
 *
 * Conta a partir do MAIOR já usado, e não da quantidade de motos: apagar a
 * ELET-003 não pode fazer a próxima nascer ELET-003 de novo e herdar a OS
 * antiga daquela outra moto.
 */
export function nextElectricCode(motorcycles: Array<Pick<MotorcycleRecord, "plate" | "electric">>): string {
  let maior = 0;
  for (const moto of motorcycles ?? []) {
    const texto = String(moto?.plate ?? "").trim();
    if (!isElectricCode(texto)) continue;
    const numero = Number(texto.replace(/\D/g, ""));
    if (Number.isFinite(numero) && numero > maior) maior = numero;
  }
  return electricCode(maior + 1);
}

/**
 * Como esta moto é identificada, e com que nome chamar isso na tela.
 *
 * A moto comum tem placa; a elétrica tem código. Chamar o código de "placa" na
 * tela faria o balcão procurar uma placa que não existe, e chamar a placa de
 * "código" faria o contrário. Uma função só para os dois casos: no dia em que
 * cada tela decidir sozinha, elas divergem.
 */
export function bikeIdLabel(electric?: boolean): string {
  return electric ? "Código" : "Placa";
}

/** A moto é elétrica? Vale a marca gravada, e o código serve de segunda pista. */
export function isElectricBike(moto: Pick<MotorcycleRecord, "plate" | "electric"> | null | undefined): boolean {
  if (!moto) return false;
  return moto.electric === true || isElectricCode(String(moto.plate ?? ""));
}

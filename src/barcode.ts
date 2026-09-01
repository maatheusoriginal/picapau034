/**
 * Código de barras EAN-13 de uso interno.
 *
 * Nem toda peça vem com código de fábrica — adesivo, parafuso avulso, peça
 * usada, serviço embalado. Sem código, a leitora não serve para nada e a venda
 * volta a ser digitada à mão, que é onde o erro entra.
 *
 * O padrão GS1 reserva os prefixos 20 a 29 para código de circulação restrita:
 * vale dentro do estabelecimento e não conflita com nenhum produto de
 * fabricante do mundo. É exatamente o caso aqui, e é por isso que o gerado
 * começa com 2.
 */

/**
 * O 13º dígito do EAN, calculado a partir dos 12 primeiros.
 *
 * Multiplica alternadamente por 1 e 3 da esquerda para a direita, soma, e o
 * dígito é o que falta para o próximo múltiplo de 10. É essa conta que faz a
 * leitora recusar um código digitado errado em vez de trazer a peça errada.
 */
export function ean13CheckDigit(body: string): number {
  const digitos = body.replace(/\D/g, "").slice(0, 12).padStart(12, "0");
  let soma = 0;
  for (let i = 0; i < 12; i += 1) {
    soma += Number(digitos[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (soma % 10)) % 10;
}

/** O código está bem formado e o dígito verificador confere? */
export function isValidEan13(code: string): boolean {
  const digitos = (code ?? "").replace(/\D/g, "");
  if (digitos.length !== 13) return false;
  return ean13CheckDigit(digitos.slice(0, 12)) === Number(digitos[12]);
}

/** É um código de uso interno da oficina, e não de um fabricante? */
export function isInternalEan13(code: string): boolean {
  const digitos = (code ?? "").replace(/\D/g, "");
  return digitos.length === 13 && digitos[0] === "2";
}

/**
 * Gera um EAN-13 interno.
 *
 * `random` é injetável para o teste conseguir conferir um código conhecido —
 * sorteio dentro da função não dá para verificar.
 */
export function generateInternalEan13(random: () => number = Math.random): string {
  let corpo = "2";
  for (let i = 0; i < 11; i += 1) {
    corpo += String(Math.floor(Math.min(0.999999, Math.max(0, random())) * 10));
  }
  return corpo + String(ean13CheckDigit(corpo));
}

/**
 * Um código interno que ainda não está em uso.
 *
 * Sortear sem olhar o que já existe é o caminho para duas peças com o mesmo
 * código — e aí a leitora traz a errada no balcão. Depois de muitas tentativas
 * sem achar um livre, devolve vazio para quem chamou avisar, em vez de gravar
 * um código repetido.
 */
export function uniqueInternalEan13(taken: string[], random: () => number = Math.random, attempts = 40): string {
  const usados = new Set(taken.map((code) => (code ?? "").replace(/\D/g, "")).filter(Boolean));
  for (let i = 0; i < attempts; i += 1) {
    const candidato = generateInternalEan13(random);
    if (!usados.has(candidato)) return candidato;
  }
  return "";
}

/**
 * Confere o gerador de código de barras interno.
 *
 * Rode com: npm run check:barcode
 */
import { ean13CheckDigit, generateInternalEan13, isInternalEan13, isValidEan13, uniqueInternalEan13 } from "../src/barcode";

// Sorteio previsível, para o teste conferir um código conhecido.
const fixo = (valores: number[]) => { let i = 0; return () => valores[i++ % valores.length]!; };

const gerado = generateInternalEan13(fixo([0.5]));

const casos: Array<[string, unknown, unknown]> = [
  // Dígito verificador, contra códigos reais conhecidos
  ["dígito do EAN do livro de exemplo (978020137962_)", ean13CheckDigit("978020137962"), 4],
  ["dígito de 400638133393_", ean13CheckDigit("400638133393"), 1],
  ["dígito de 789100031234_", ean13CheckDigit("789100031234"), 6],
  ["corpo curto é completado com zero à esquerda", ean13CheckDigit("1"), ean13CheckDigit("000000000001")],
  ["letras no meio são ignoradas", ean13CheckDigit("97802013796a2"), ean13CheckDigit("978020137962")],

  // Validação
  ["EAN real é aceito", isValidEan13("9780201379624"), true],
  ["um dígito trocado é recusado", isValidEan13("9780201379625"), false],
  ["código com 12 dígitos é recusado", isValidEan13("978020137962"), false],
  ["código com 14 dígitos é recusado", isValidEan13("97802013796241"), false],
  ["texto vazio é recusado", isValidEan13(""), false],
  ["com hífen e espaço continua válido", isValidEan13("978-0201 379624"), true],

  // O gerado
  ["o gerado tem 13 dígitos", gerado.length, 13],
  ["o gerado é um EAN válido", isValidEan13(gerado), true],
  ["o gerado começa com 2 (uso interno GS1)", gerado[0], "2"],
  ["o gerado é reconhecido como interno", isInternalEan13(gerado), true],
  ["EAN de fabricante não é interno", isInternalEan13("7891000312346"), false],
  ["sorteio fixo dá sempre o mesmo código", generateInternalEan13(fixo([0.5])), gerado],
  ["sorteio no limite de baixo não quebra", isValidEan13(generateInternalEan13(() => 0)), true],
  ["sorteio no limite de cima não vira dígito 10", isValidEan13(generateInternalEan13(() => 1)), true],
  ["sorteio no limite de cima ainda tem 13 dígitos", generateInternalEan13(() => 1).length, 13],

  // Sem repetir o que já está no estoque
  ["não devolve um código já usado", uniqueInternalEan13([gerado], fixo([0.5, 0.5, 0.5, 0.1])) === gerado, false],
  ["com o estoque vazio devolve o primeiro sorteado", uniqueInternalEan13([], fixo([0.5])), gerado],
  ["o código livre continua válido", isValidEan13(uniqueInternalEan13(["7891000312346"])), true],
  ["sem código livre devolve vazio em vez de repetir", uniqueInternalEan13([gerado], fixo([0.5]), 5), ""],
  ["código guardado com hífen também conta como usado", uniqueInternalEan13([gerado.replace(/^(\d{3})/, "$1-")], fixo([0.5]), 3), ""],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nO código de barras interno fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

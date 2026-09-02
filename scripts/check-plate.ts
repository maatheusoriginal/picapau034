/**
 * Confere as regras de placa.
 *
 * Rode com: npm run check:plate
 */
import { formatPlate, isValidPlate, motorcycleIdFor, normalizePlate, platePattern, samePlate } from "../src/plate";

const casos: Array<[string, unknown, unknown]> = [
  ["tira o hífen para comparar", normalizePlate("abc-1d23"), "ABC1D23"],
  ["ignora espaço e ponto", normalizePlate(" abc.1234 "), "ABC1234"],
  ["não passa de 7 caracteres", normalizePlate("ABC1234567"), "ABC1234"],
  ["texto vazio continua vazio", normalizePlate(""), ""],

  ["escreve com hífen", formatPlate("abc1d23"), "ABC-1D23"],
  ["placa pela metade não ganha hífen cedo demais", formatPlate("ab"), "AB"],
  ["três letras ainda não levam hífen", formatPlate("abc"), "ABC"],

  ["a mesma moto escrita de dois jeitos", samePlate("ABC-1D23", "abc1d23"), true],
  ["motos diferentes", samePlate("ABC-1D23", "XYZ-9999"), false],
  ["placa vazia não é igual a nada", samePlate("", ""), false],
  ["placa vazia não casa com uma preenchida", samePlate("", "ABC1D23"), false],

  ["padrão antigo é válido", isValidPlate("ABC-1234"), true],
  ["padrão Mercosul é válido", isValidPlate("ABC-1D23"), true],
  ["faltando um caractere não é válida", isValidPlate("ABC-123"), false],
  ["letra na posição errada não é válida", isValidPlate("ABC-12A3"), false],
  ["só números não é válida", isValidPlate("1234567"), false],
  ["vazia não é válida", isValidPlate(""), false],

  ["a dica pede os 7 caracteres", platePattern("ABC-12"), "Digite os 7 caracteres"],
  ["reconhece o padrão antigo", platePattern("ABC-1234"), "Padrão antigo"],
  ["reconhece o Mercosul", platePattern("ABC-1D23"), "Padrão Mercosul"],
  ["avisa quando os 7 caracteres não formam placa", platePattern("ABC-12A3"), "Placa fora dos padrões brasileiros"],

  // O id sai da placa: a mesma moto cadastrada por telas diferentes precisa
  // cair no MESMO documento, senão vira duas motos.
  ["o id da moto sai da placa", motorcycleIdFor("abc-1d23"), "MOTO-ABC1D23"],
  ["placa escrita diferente dá o mesmo id", motorcycleIdFor("ABC1D23"), motorcycleIdFor("abc-1d23")],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}
console.log(falhas === 0 ? "\nAs regras de placa fecham." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

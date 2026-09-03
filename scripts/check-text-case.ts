/**
 * Confere o cadastro em maiúsculo — a regra e as telas.
 *
 * A segunda metade é uma guarda de verdade: varre os formulários de cadastro
 * procurando campo de texto que grava sem passar pelo maiúsculo. Sem isso,
 * o próximo campo adicionado a qualquer um deles entraria minúsculo em
 * silêncio, e só se descobriria meses depois com o cadastro já sujo.
 *
 * Rode com: npm run check:text-case
 */
import { readFileSync } from "node:fs";
import { emMaiusculo, estaEmMaiusculo } from "../src/text-case";

const casos: Array<[string, unknown, unknown]> = [
  ["passa para maiúsculo", emMaiusculo("óleo 20w50"), "ÓLEO 20W50"],
  ["mantém o cedilha", emMaiusculo("manutenção"), "MANUTENÇÃO"],
  ["mantém os acentos", emMaiusculo("relação e válvula"), "RELAÇÃO E VÁLVULA"],
  ["o que já está maiúsculo não muda", emMaiusculo("CG 160 FAN"), "CG 160 FAN"],
  ["número e pontuação passam inteiros", emMaiusculo("kit 428h - 118l"), "KIT 428H - 118L"],
  ["texto vazio continua vazio", emMaiusculo(""), ""],
  ["reconhece o que já está no formato", estaEmMaiusculo("ÓLEO 20W50"), true],
  ["reconhece o que não está", estaEmMaiusculo("Óleo 20W50"), false],
];

/**
 * Formulários de cadastro e os campos que ficam de fora, com o motivo.
 *
 * `emMaiusculo` no onChange é o jeito certo; os formatadores da lista já
 * devolvem maiúsculo por conta própria (placa) ou tratam de número (telefone,
 * dinheiro, código de barras), onde maiúsculo não significa nada.
 */
const FORMULARIOS = [
  "src/components/ClientFormModal.tsx",
  "src/components/ProductFormModal.tsx",
  "src/components/MotorcycleFormModal.tsx",
  "src/components/SupplierFormModal.tsx",
  "src/components/EmployeeFormModal.tsx",
];
const LIBERADOS = /emMaiusculo\(|formatPhone\(|formatPlate\(|onlyDigits\(|somenteNumeros\(|type="email"|type="password"|type="number"|type="date"|type="checkbox"|type="radio"|NumberField|readOnly|disabled/;

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

for (const arquivo of FORMULARIOS) {
  const fonte = readFileSync(arquivo, "utf8");
  // Cada <input ...> inteiro, mesmo quebrado em várias linhas.
  const campos = fonte.match(/<input[\s\S]*?\/>/g) ?? [];
  const escaparam = campos.filter((campo) => campo.includes("onChange") && !LIBERADOS.test(campo));
  const ok = escaparam.length === 0;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${arquivo}: ${campos.length} campo(s), ${escaparam.length} fora do maiúsculo`);
  for (const campo of escaparam) console.log(`      ${campo.replace(/\s+/g, " ").slice(0, 150)}`);
}

console.log(falhas === 0 ? "\nO cadastro em maiúsculo fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

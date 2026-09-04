/**
 * Confere a exclusão de cadastro.
 *
 * O que este script protege: apagar um produto que já foi vendido, um cliente
 * que já tem OS ou uma moto que já passou pela bancada não limpa nada — quebra.
 * A OS antiga passa a apontar para um produto que não existe, o relatório do mês
 * muda sozinho, e nada disso dá erro na hora: aparece semanas depois, quando
 * ninguém mais liga uma coisa à outra.
 *
 * Rode com: npm run check:removal
 */
import { decidirExclusao, rotuloDaAcao, textoDaDecisao, textoDoVinculo, vinculosDe, type BaseDaOficina } from "../src/removal";

const json = (value: unknown) => JSON.stringify(value);

const base: BaseDaOficina = {
  orders: [
    { items: [{ productId: "PRD-001" }, { productId: "PRD-002" }], clientId: "CLI-001", motorcycleId: "MOTO-AAA1A11", plate: "AAA-1A11", mechanicIds: ["USR-003"] },
    { items: [{ productId: "PRD-001" }], clientId: "CLI-001", motorcycleId: "MOTO-BBB2B22", plate: "BBB-2B22", mechanicIds: ["USR-003", "USR-007"] },
    // OS aberta só pela placa, sem cadastro de moto: prende a moto do mesmo
    // jeito, e é a que ninguém lembra na hora de apagar.
    { items: [], clientId: "", plate: "CCC-3C33", mechanicIds: [] },
  ],
  sales: [
    { items: [{ productId: "PRD-002" }], clientId: "CLI-002", mechanicId: "USR-007" },
    // Venda antiga: o id do produto ia no campo `id` do item, sem `productId`.
    // Sem olhar os dois campos, esta peça pareceria nunca ter sido vendida.
    { items: [{ id: "PRD-777" }], clientId: "CLI-003" },
  ],
  entries: [
    { items: [{ productId: "PRD-002" }], supplierId: "FOR-001" },
  ],
  expenses: [
    { supplierId: "FOR-001" },
    { employeeId: "USR-003" },
  ],
  accounts: [
    { personId: "CLI-002" },
    { personId: "FOR-001" },
  ],
  motorcycles: [
    { id: "MOTO-AAA1A11", plate: "AAA-1A11", ownerId: "CLI-001" },
    { id: "MOTO-BBB2B22", plate: "BBB-2B22", ownerId: "CLI-001" },
    { id: "MOTO-CCC3C33", plate: "CCC-3C33" },
    { id: "MOTO-ZZZ9Z99", plate: "ZZZ-9Z99", ownerId: "CLI-009" },
  ],
  products: [
    { id: "PRD-001" },
    { id: "PRD-002", supplierId: "FOR-001" },
    { id: "PRD-999" },
  ],
  access: [{ employeeId: "USR-003" }],
};

const produtoUsado = decidirExclusao("produto", "PRD-002", base);
const produtoLimpo = decidirExclusao("produto", "PRD-999", base);
const clienteComOs = decidirExclusao("cliente", "CLI-001", base);
const clienteSemNada = decidirExclusao("cliente", "CLI-777", base);
const motoComOs = decidirExclusao("moto", "MOTO-AAA1A11", base);
const motoSoPelaPlaca = decidirExclusao("moto", "MOTO-CCC3C33", base);
const motoLimpa = decidirExclusao("moto", "MOTO-ZZZ9Z99", base);
const fornecedor = decidirExclusao("fornecedor", "FOR-001", base);
const mecanico = decidirExclusao("funcionario", "USR-003", base);
const semNada = decidirExclusao("funcionario", "USR-555", base);

const casos: Array<[string, unknown, unknown]> = [
  // --- Produto ---
  ["peça já vendida não é apagada", produtoUsado.modo, "desativar"],
  ["e a tela diz em quantos lugares ela aparece",
    json(produtoUsado.vinculos.map(textoDoVinculo)),
    json(["1 ordem de serviço", "1 venda no balcão", "1 entrada de estoque"])],
  ["peça usada só em OS conta as duas OS", vinculosDe("produto", "PRD-001", base)[0]!.quantidade, 2],
  ["peça que nunca foi usada é apagada de vez", produtoLimpo.modo, "apagar"],
  // O campo mudou de nome no meio do caminho: a venda antiga guardava o id do
  // produto em `id`. Olhar só `productId` apagaria peça que já saiu pela porta.
  ["peça de venda antiga, sem productId, também segura", decidirExclusao("produto", "PRD-777", base).modo, "desativar"],
  ["e conta a venda certa", decidirExclusao("produto", "PRD-777", base).total, 1],
  ["e não lista vínculo nenhum", produtoLimpo.vinculos.length, 0],

  // --- Cliente ---
  ["cliente com OS não é apagado", clienteComOs.modo, "desativar"],
  // Apagar o dono deixaria a moto órfã, sem ninguém a quem cobrar na entrada
  // seguinte — por isso a moto conta como vínculo, mesmo não sendo histórico.
  ["as motos dele também seguram o cadastro",
    json(clienteComOs.vinculos.map(textoDoVinculo)),
    json(["2 ordens de serviço", "2 motos no nome dele"])],
  ["cliente com venda e conta a receber também fica",
    json(decidirExclusao("cliente", "CLI-002", base).vinculos.map(textoDoVinculo)),
    json(["1 venda no balcão", "1 conta a receber"])],
  ["cliente que nunca voltou é apagado", clienteSemNada.modo, "apagar"],

  // --- Moto ---
  ["moto com OS não é apagada", motoComOs.modo, "desativar"],
  ["moto que só aparece pela placa também não", motoSoPelaPlaca.modo, "desativar"],
  ["e conta a OS certa", motoSoPelaPlaca.total, 1],
  ["moto que nunca entrou na oficina é apagada", motoLimpa.modo, "apagar"],

  // --- Fornecedor ---
  ["fornecedor com peça, entrada, gasto e conta fica",
    json(fornecedor.vinculos.map(textoDoVinculo)),
    json(["1 peça cadastrada", "1 entrada de estoque", "1 gasto lançado", "1 conta a pagar"])],
  ["e o total soma os quatro", fornecedor.total, 4],

  // --- Funcionário ---
  ["mecânico com OS não é apagado", mecanico.modo, "desativar"],
  // Apagar o funcionário deixaria alguém entrando no sistema sem cadastro
  // nenhum na oficina.
  ["a conta de acesso aparece entre os vínculos",
    mecanico.vinculos.some((v) => v.um === "conta de acesso"), true],
  ["funcionário que nunca pegou OS é apagado", semNada.modo, "apagar"],

  // --- As frases da confirmação ---
  ["a frase de apagar avisa que é de vez",
    textoDaDecisao(produtoLimpo, "ÓLEO NOVO"), "ÓLEO NOVO nunca foi usado em nada. Vai sair do sistema de vez."],
  ["a frase de desativar lista os vínculos",
    /já aparece em 1 ordem de serviço, 1 venda no balcão, 1 entrada de estoque/.test(textoDaDecisao(produtoUsado, "ÓLEO 20W50")), true],
  ["e promete que o histórico fica", /continua no lugar/.test(textoDaDecisao(produtoUsado, "ÓLEO 20W50")), true],
  ["sem nome, a frase não fica truncada", /^Este cadastro/.test(textoDaDecisao(produtoLimpo, "  ")), true],
  ["o botão de apagar diz apagar", rotuloDaAcao(produtoLimpo), "Apagar de vez"],
  ["o botão de desativar diz desativar", rotuloDaAcao(produtoUsado), "Desativar cadastro"],

  // --- Bordas ---
  ["id vazio não acha vínculo nenhum", vinculosDe("produto", "", base).length, 0],
  ["base vazia deixa apagar", decidirExclusao("produto", "PRD-001", {}).modo, "apagar"],
  ["singular e plural saem certos",
    json([textoDoVinculo({ um: "ordem de serviço", varios: "ordens de serviço", quantidade: 1 }),
          textoDoVinculo({ um: "ordem de serviço", varios: "ordens de serviço", quantidade: 2 })]),
    json(["1 ordem de serviço", "2 ordens de serviço"])],
  ["vínculo zerado não entra na lista", vinculosDe("cliente", "CLI-009", base).every((v) => v.quantidade > 0), true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nA exclusão de cadastro está certa." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere a leitura da planilha de estoque.
 *
 * Planilha de oficina não vem limpa: vem do Excel com BOM e ";", do Sheets com
 * ",", com acento no cabeçalho ou sem, com vírgula decimal, com aspas no meio
 * do nome e com a peça repetida em duas linhas. Cada caso abaixo é um desses
 * que, se passar batido, entra errado no estoque — e estoque errado só aparece
 * na hora de vender.
 *
 * Rode com: npm run check:import
 */
import { decodeSheetBytes, newProductPayload, parseCsv, parseStockSheet, planStockImport, toStoredAmount, updatedProductPayload } from "../src/import";
import type { ProductRecord, SettingsConfig } from "../src/types";

const json = (value: unknown) => JSON.stringify(value);
// "R$ 25,00" com espaço normal NÃO é igual ao que toLocaleString devolve: o
// separador ali é um espaço não separável (U+00A0). Escrever o esperado com o
// mesmo formatador evita comparar contra um valor que nunca vai existir.
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// --- Planilhas de exemplo ---------------------------------------------------

// O jeito que o Excel brasileiro salva: BOM na frente e ";" separando.
const excelBr = "﻿Nome;Código de barras;Quantidade;Preço de custo;Preço de venda\r\n"
  + "Óleo 20W50;7891234567890;10;25,00;45,00\r\n"
  + "Pastilha de freio;7899876543210;4;30,50;60\r\n";

// O jeito que o Sheets em inglês salva: "," separando, sem BOM.
const sheetsEn = "Nome,Codigo de barras,Quantidade,Preco de custo,Preco de venda\n"
  + "Vela de ignição,7890000000001,6,12.00,28.00\n";

const comAspas = 'Nome;Quantidade;Compatibilidade\n'
  + '"Kit relação; completo";2;"CG 160, Titan"\n'
  + '"Filtro 3"" de óleo";1;Universal\n';

const foraDeOrdem = "Quantidade;Preço de venda;Nome;Marca\n"
  + "7;80,00;Corrente;DID\n";

const comProblemas = "Nome;Código de barras;Quantidade;Preço de custo;Preço de venda\n"
  + "Óleo 20W50;7891234567890;10;25,00;45,00\n"
  + ";;5;10,00;20,00\n"
  + "Cabo de embreagem;;abc;5,00;15,00\n"
  + "Retrovisor;;-3;10,00;20,00\n"
  + "Bateria;;2;200,00;150,00\n"
  + "Óleo repetido;7891234567890;3;25,00;45,00\n"
  + "\n";

const semColunas = "Produto;Marca;Preço\nAlgo;X;10\n";

// O cabeçalho exato que downloadStockTemplate() escreve em app/page.tsx. Se
// alguém renomear uma coluna lá e esquecer daqui, a importação passaria a
// ignorar a coluna em silêncio — este caso quebra antes disso acontecer.
const modelo = ["Nome", "Código de barras", "Código da peça (opcional)", "Quantidade", "Categoria", "Marca", "Unidade", "Preço de custo", "Preço de venda", "Estoque mínimo", "Compatibilidade", "Localização", "Fornecedor"];
const doModelo = parseStockSheet(
  "\uFEFF" + [modelo, ["EXEMPLO - Óleo 20W50 (pode apagar esta linha)", "7890000000000", "", "10", "Óleos", "Marca", "UN", "25,00", "39,90", "5", "CG 125 / CG 150", "Prateleira A1", "Fornecedor"],
    ["Coroa 45 dentes", "7890000000123", "CR-45", "3", "Transmissão", "Vaz", "PC", "60,00", "110,00", "2", "CG 160", "B2", "Distribuidora"]]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n"));

const excel = parseStockSheet(excelBr);
const sheets = parseStockSheet(sheetsEn);
const aspas = parseStockSheet(comAspas);
const ordem = parseStockSheet(foraDeOrdem);
const problemas = parseStockSheet(comProblemas);
const faltando = parseStockSheet(semColunas);

const produtos = [
  { id: "PRD-001", name: "Óleo 20W50", barcode: "7891234567890", stock: 3 },
  { id: "PRD-002", name: "Pastilha de freio", barcode: "", stock: 0 },
  { id: "PRD-003", name: "Corrente", barcode: "7890000009999", stock: 1 },
] as unknown as ProductRecord[];

const plano = planStockImport(excel.rows, produtos, excel.issues);
const planoNome = planStockImport(ordem.rows, produtos, ordem.issues);

// Configuração da oficina, para o que a planilha não trouxer.
const config = { defaultUnit: "PC", defaultMinStock: 4, pricingMode: "markup", suggestedMarkup: 60 } as Partial<SettingsConfig>;

const novaCompleta = newProductPayload(excel.rows[0]!, config);
const novaSemPreco = newProductPayload({ ...excel.rows[0]!, price: 0, unit: "", minimum: 0, category: "" }, config);
const atualizaTudo = updatedProductPayload(excel.rows[0]!, produtos[0]!);
const atualizaSoContagem = updatedProductPayload(
  { ...excel.rows[0]!, cost: 0, price: 0, category: "", brand: "", unit: "", minimum: 0, barcode: "", partNumber: "", compatibility: "", location: "", supplier: "" },
  { ...produtos[0]!, cost: "R$ 30,00", price: "R$ 70,00", minimum: 2 },
);

const casos: Array<[string, unknown, unknown]> = [
  // --- Leitura crua do CSV ---
  ["separador ';' do Excel brasileiro", json(parseCsv("a;b;c\n1;2;3")), json([["a", "b", "c"], ["1", "2", "3"]])],
  ["separador ',' do Sheets em inglês", json(parseCsv("a,b,c\n1,2,3")), json([["a", "b", "c"], ["1", "2", "3"]])],
  ["o BOM do Excel não gruda no primeiro cabeçalho", parseCsv("﻿Nome;Qtd\nX;1")[0]![0], "Nome"],
  ["quebra de linha do Windows não deixa \\r na célula", parseCsv("a;b\r\n1;2")[1]![1], "2"],
  ["célula entre aspas guarda o próprio separador", parseCsv('"a;b";c')[0]![0], "a;b"],
  ["aspas duplas viram uma aspa literal", parseCsv('"3"" de óleo";1')[0]![0], '3" de óleo'],
  ["linha em branco no fim do arquivo é descartada", parseCsv("a;b\n1;2\n\n").length, 2],
  ["arquivo vazio não vira linha nenhuma", parseCsv("   ").length, 0],
  ["separador é decidido pelo cabeçalho, não pelo texto das células", parseCsv('Nome,Qtd\n"Kit; completo",2')[1]!.length, 2],

  // --- Planilha do Excel brasileiro ---
  ["lê as duas peças da planilha do Excel", excel.rows.length, 2],
  ["não reclama de nada numa planilha limpa", excel.issues.length, 0],
  ["a numeração da linha é a que aparece no Excel", excel.rows[0]!.line, 2],
  ["quantidade com vírgula decimal", excel.rows[0]!.stock, 10],
  ["custo em reais vira número", excel.rows[0]!.cost, 25],
  ["preço em reais vira número", excel.rows[0]!.price, 45],
  ["preço sem centavos também vale", excel.rows[1]!.price, 60],
  ["código de barras vem como texto", excel.rows[0]!.barcode, "7891234567890"],

  // --- Planilha do Sheets, cabeçalho sem acento ---
  ["cabeçalho sem acento casa igual", sheets.rows.length, 1],
  ["ponto decimal do Sheets também é lido", sheets.rows[0]!.cost, 12],
  ["nome com acento no corpo é preservado", sheets.rows[0]!.name, "Vela de ignição"],

  // --- Aspas ---
  ["nome com ';' dentro das aspas fica inteiro", aspas.rows[0]!.name, "Kit relação; completo"],
  ["compatibilidade com vírgula fica inteira", aspas.rows[0]!.compatibility, "CG 160, Titan"],
  ["polegada no nome não quebra a leitura", aspas.rows[1]!.name, 'Filtro 3" de óleo'],

  // --- Cabeçalho fora de ordem ---
  ["coluna fora de ordem ainda casa", ordem.rows[0]!.name, "Corrente"],
  ["quantidade fora de ordem casa", ordem.rows[0]!.stock, 7],
  ["marca fora de ordem casa", ordem.rows[0]!.brand, "DID"],

  // --- Cabeçalho faltando ---
  ["sem Nome e Quantidade não importa nada", faltando.rows.length, 0],
  ["\"Produto\" já vale como Nome; só a Quantidade falta", json(faltando.missingColumns), json(["stock"])],
  ["e a mensagem nomeia a coluna que falta", faltando.issues[0]!.message.includes("Falta a coluna Quantidade"), true],
  ["e explica em uma linha só", faltando.issues.length, 1],

  // --- Problemas linha a linha ---
  ["as linhas boas passam mesmo com problemas em volta", problemas.rows.length, 2],
  ["aponta todos os problemas de uma vez", problemas.issues.length, 5],
  ["linha sem nome é recusada", problemas.issues.some((i) => i.line === 3 && i.message.includes("sem nome")), true],
  ["quantidade que não é número é recusada", problemas.issues.some((i) => i.line === 4 && i.message.includes("não é um número")), true],
  ["quantidade negativa é recusada", problemas.issues.some((i) => i.line === 5 && i.message.includes("negativa")), true],
  ["venda abaixo do custo é avisada", problemas.issues.some((i) => i.line === 6 && i.message.includes("menor que o custo")), true],
  ["mas a peça com preço abaixo do custo ainda entra", problemas.rows.some((r) => r.name === "Bateria"), true],
  ["repetida na própria planilha é recusada", problemas.issues.some((i) => i.line === 7 && i.message.includes("linha 2")), true],
  ["a repetida não entra duas vezes", problemas.rows.filter((r) => r.barcode === "7891234567890").length, 1],
  ["o problema diz o nome da peça", problemas.issues.find((i) => i.line === 5)!.name, "Retrovisor"],

  // --- O que é peça nova e o que é atualização ---
  ["casa por código de barras", plano.update.length, 2],
  ["e nada é criado quando já existe", plano.create.length, 0],
  ["a atualização aponta o produto certo", plano.update[0]!.product.id, "PRD-001"],
  ["sem código de barras, casa por nome", plano.update[1]!.product.id, "PRD-002"],
  ["nome igual com código diferente ainda casa pelo nome", planoNome.update[0]!.product.id, "PRD-003"],
  ["peça que não existe é criada", planStockImport(sheets.rows, produtos).create.length, 1],
  ["planilha sem nada não gera plano", planStockImport([], produtos).create.length, 0],
  ["os problemas seguem junto do plano", plano.issues.length, 0],

  // --- O modelo que o sistema oferece para baixar ---
  ["toda coluna do modelo é reconhecida", json(doModelo.missingColumns), json([])],
  ["o modelo é lido sem problema nenhum", doModelo.issues.length, 0],
  ["a linha de exemplo do modelo não vira produto", doModelo.rows.length, 1],
  ["e a peça de verdade é lida", doModelo.rows[0]!.name, "Coroa 45 dentes"],
  ["com a categoria da coluna certa", doModelo.rows[0]!.category, "Transmissão"],
  ["com a unidade da coluna certa", doModelo.rows[0]!.unit, "PC"],
  ["com o código da peça da coluna certa", doModelo.rows[0]!.partNumber, "CR-45"],
  ["com o estoque mínimo da coluna certa", doModelo.rows[0]!.minimum, 2],
  ["com a localização da coluna certa", doModelo.rows[0]!.location, "B2"],
  ["com o fornecedor da coluna certa", doModelo.rows[0]!.supplier, "Distribuidora"],
  ["com a compatibilidade da coluna certa", doModelo.rows[0]!.compatibility, "CG 160"],

  // --- Codificação do arquivo ---
  ["arquivo em UTF-8 é lido como UTF-8", decodeSheetBytes(new TextEncoder().encode("Óleo 20W50")), "Óleo 20W50"],
  // 0xD3 é "Ó" em windows-1252 e byte inválido em UTF-8 — é o que o Excel em
  // português produz quando salva a planilha em ANSI.
  ["arquivo ANSI do Excel não vira caractere quebrado", decodeSheetBytes(new Uint8Array([0xd3, 0x6c, 0x65, 0x6f])), "Óleo"],
  ["arquivo vazio decodifica para texto vazio", decodeSheetBytes(new Uint8Array([])), ""],

  // --- O que vai para o Firestore numa peça nova ---
  ["a peça nova leva o nome da planilha", novaCompleta.name, "Óleo 20W50"],
  ["o custo vai como texto em reais", novaCompleta.cost, brl(25)],
  ["o preço vai como texto em reais", novaCompleta.price, brl(45)],
  ["o markup sai do custo e do preço", novaCompleta.markup, 80],
  ["a quantidade vai como número", novaCompleta.stock, 10],
  ["a peça nasce ativa", novaCompleta.active, true],
  ["e com o status que a lista de estoque mostra", novaCompleta.status, "Em estoque"],
  ["sem preço na planilha, aplica o markup sugerido", novaSemPreco.price, brl(40)],
  ["sem unidade, usa a padrão da oficina", novaSemPreco.unit, "PC"],
  ["sem estoque mínimo, usa o padrão da oficina", novaSemPreco.minimum, 4],
  ["sem categoria, cai em Peças", novaSemPreco.category, "Peças"],
  ["estoque abaixo do mínimo já nasce marcado", newProductPayload({ ...excel.rows[0]!, stock: 1 }, config).status, "Estoque baixo"],
  ["estoque zero nasce como esgotado", newProductPayload({ ...excel.rows[0]!, stock: 0 }, config).status, "Esgotado"],

  // --- O que muda numa peça que já existe ---
  ["a contagem da planilha substitui o estoque", atualizaTudo.stock, 10],
  ["o preço da planilha atualiza o cadastro", atualizaTudo.price, brl(45)],
  ["planilha só de contagem não mexe no preço", "price" in atualizaSoContagem, false],
  ["nem no custo", "cost" in atualizaSoContagem, false],
  ["nem na categoria", "category" in atualizaSoContagem, false],
  ["nem no fornecedor", "supplierName" in atualizaSoContagem, false],
  ["mas atualiza a quantidade contada", atualizaSoContagem.stock, 10],
  ["e o status usa o mínimo que já estava no cadastro", atualizaSoContagem.status, "Em estoque"],
  ["reimportar a mesma planilha não dobra o estoque", updatedProductPayload(excel.rows[0]!, { ...produtos[0]!, stock: 10 }).stock, 10],

  // --- Formato de gravação ---
  ["custo é gravado como o cadastro grava", toStoredAmount(25), brl(25)],
  ["zero também vira texto em reais", toStoredAmount(0).startsWith("R$"), true],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}
console.log(falhas === 0 ? "\nA planilha é lida como deveria." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere a leitura do XML da nota do fornecedor.
 *
 * Rode com: npm run check:nfe
 */
import { conferirNota, custoUnitario, dataDaNota, fatorProblema, fatorSugerido, lerNfe, quantidadeQueEntra, resumoDaConferencia, type ProdutoConhecido } from "../src/nfe";

const NOTA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe35260612345678000199550010000012341000012345" versao="4.00">
  <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-06-28T14:30:00-03:00</dhEmi></ide>
  <emit><CNPJ>12345678000199</CNPJ><xNome>DISTRIBUIDORA MOTO PECAS LTDA</xNome></emit>
  <det nItem="1"><prod>
    <cProd>90793-AB401</cProd><cEAN>7891234567895</cEAN>
    <xProd>OLEO 20W50 CX C/ 12</xProd><NCM>27101932</NCM>
    <uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>180.0000</vUnCom><vProd>360.00</vProd>
  </prod></det>
  <det nItem="2"><prod>
    <cProd>KIT-428</cProd><cEAN>SEM GTIN</cEAN>
    <xProd>KIT RELACAO 428H</xProd><NCM>87141000</NCM>
    <uCom>UN</uCom><qCom>5.0000</qCom><vUnCom>62.5000</vUnCom><vProd>312.50</vProd>
  </prod></det>
  <det nItem="3"><prod>
    <cProd>PAST-99</cProd><cEAN>7899999999994</cEAN>
    <xProd>PASTILHA DE FREIO DIANTEIRA</xProd><NCM>87083090</NCM>
    <uCom>PC</uCom><qCom>10.0000</qCom><vUnCom>18.0000</vUnCom><vProd>180.00</vProd>
  </prod></det>
 </infNFe></NFe>
</nfeProc>`;

const nota = lerNfe(NOTA);
const produtos: ProdutoConhecido[] = [
  // Casa pelo código de barras: o jeito exato.
  { id: "P1", code: "PRD-001", name: "ÓLEO 20W50", barcode: "7891234567895", cost: 12, stock: 4 },
  // Casa pela referência de fábrica.
  { id: "P2", code: "PRD-002", name: "KIT RELAÇÃO", partNumber: "KIT-428", cost: 70, stock: 1 },
];
const conferido = conferirNota(nota, produtos);
const resumo = resumoDaConferencia(conferido);

const casos: Array<[string, unknown, unknown]> = [
  ["lê o número da nota", nota.numero, "1234"],
  ["lê o fornecedor", nota.fornecedor.nome, "DISTRIBUIDORA MOTO PECAS LTDA"],
  ["lê o CNPJ", nota.fornecedor.cnpj, "12345678000199"],
  ["a data vira o formato brasileiro", nota.emissao, "28/06/2026"],
  ["a chave sai sem o prefixo NFe", nota.chave, "35260612345678000199550010000012341000012345"],
  ["lê todos os itens", nota.itens.length, 3],
  ["soma o total", nota.total, 852.5],
  ["data sem hora também", dataDaNota("2026-01-02"), "02/01/2026"],
  ["data que não dá para entender fica vazia", dataDaNota("ontem"), ""],

  // "SEM GTIN" é o que a Receita manda escrever quando não há código de
  // barras. Tratar isso como código casaria peças diferentes entre si.
  ["SEM GTIN não vira código de barras", nota.itens[1].gtin, ""],
  ["código de barras de verdade é lido", nota.itens[0].gtin, "7891234567895"],

  // A nota diz 1 CX e na prateleira entram 12.
  ["acha o fator na descrição", fatorSugerido({ descricao: "OLEO 20W50 CX C/ 12", unidade: "CX" }), 12],
  ["acha escrito por extenso", fatorSugerido({ descricao: "CAIXA COM 6 UNIDADES", unidade: "CX" }), 6],
  ["acha na embalagem", fatorSugerido({ descricao: "PARAFUSO EMB. 24", unidade: "CX" }), 24],
  ["acha no formato 20X1L", fatorSugerido({ descricao: "OLEO FD 20X1L", unidade: "FD" }), 20],
  ["peça avulsa não multiplica", fatorSugerido({ descricao: "KIT RELACAO 428H", unidade: "UN" }), 1],
  ["número absurdo não vira fator", fatorSugerido({ descricao: "CABO 5000 MM", unidade: "UN" }), 1],

  ["entram 2 caixas de 12 = 24 unidades", quantidadeQueEntra(2, 12), 24],
  ["sem fator entra o que está na nota", quantidadeQueEntra(5, 1), 5],
  // Fator inválido não vira "1": entrar com a quantidade da nota escondendo
  // que o número está errado é pior do que não entrar com nada.
  ["fator zero não inventa estoque", quantidadeQueEntra(5, 0), 0],
  ["fator negativo também não", quantidadeQueEntra(5, -2), 0],
  ["e a tela avisa antes", fatorProblema(0), "Informe quantas unidades vêm em cada volume."],
  ["avisa fator negativo", fatorProblema(-1), "O número de unidades por volume não pode ser negativo."],
  ["avisa fator quebrado", fatorProblema(2.5), "Use um número inteiro de unidades por volume."],
  ["avisa número absurdo", fatorProblema(5000), "Mais de 1000 unidades por volume? Confira o número."],
  ["fator bom não tem problema", fatorProblema(12), ""],
  // Guardar o preço da caixa como custo unitário faz a peça nascer doze vezes
  // mais cara, e o preço de venda sair pela lua.
  ["o custo é o da unidade, não o da caixa", custoUnitario(180, 12), 15],
  ["sem fator o custo é o da nota", custoUnitario(62.5, 1), 62.5],

  ["acha pelo código de barras", conferido[0].achadoPor, "código de barras"],
  ["acha pela referência de fábrica", conferido[1].achadoPor, "referência"],
  ["não inventa produto para o que é novo", conferido[2].produto, null],
  ["item novo não tem como foi achado", conferido[2].achadoPor, null],

  ["mostra o custo anterior", conferido[0].custoAnterior, 12],
  ["mostra o custo novo por unidade", conferido[0].custoNovo, 15],
  ["e de quanto foi o aumento", conferido[0].variacao, 25],
  ["a peça que baixou aparece negativa", conferido[1].variacao, -10.71],
  ["peça nova não tem variação", conferido[2].variacao, 0],

  ["o resumo conta os itens", resumo.total, 3],
  ["quantos já estão cadastrados", resumo.jaCadastrados, 2],
  ["quantos são novos", resumo.novos, 1],
  ["quantos subiram de preço", resumo.subiramDePreco, 1],
  ["quantos caíram", resumo.caiuDePreco, 1],
  ["o valor da nota", resumo.valor, 852.5],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

// Arquivo que não é nota precisa dizer isso, e não quebrar a tela.
for (const [nome, xml, esperado] of [
  ["arquivo que não é XML", "isto não é xml <<<", /XML válido|nota dentro/],
  ["XML que não é nota", "<pedido><item/></pedido>", /nota dentro/],
] as Array<[string, string, RegExp]>) {
  let mensagem = "";
  try { lerNfe(xml); } catch (erro) { mensagem = erro instanceof Error ? erro.message : String(erro); }
  const ok = esperado.test(mensagem);
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: ${JSON.stringify(mensagem)}`);
}

console.log(falhas === 0 ? "\nA leitura da nota fecha." : `\n${falhas} caso(s) errados.`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * A nota fiscal eletrônica do fornecedor, lida do XML.
 *
 * Cadastrar peça a peça depois de cada compra é o que ninguém faz: a nota chega
 * com trinta itens e o estoque do sistema fica meses atrás do estoque da
 * prateleira. O XML da NF-e já traz tudo — código, código de barras, descrição,
 * unidade, quantidade e o custo REAL pago —, e é de graça: vem junto com a
 * compra, sem depender de banco de dados de terceiro.
 *
 * Este módulo só LÊ e organiza. Quem grava é a tela, depois de a pessoa
 * conferir item por item.
 */

/** Um item como ele vem na nota, sem interpretação nossa. */
export type NfeItem = {
  /** Ordem do item na nota (nItem). Serve para falar com o fornecedor. */
  numero: number;
  /** Código do produto no FORNECEDOR (cProd) — não é o nosso código. */
  codigoFornecedor: string;
  /** Código de barras (cEAN). "SEM GTIN" quando a nota não traz. */
  gtin: string;
  descricao: string;
  /** Unidade comercial da nota: CX, UN, PC, FD... */
  unidade: string;
  /** Quantidade na unidade da nota: 1 CX é 1, não 6. */
  quantidade: number;
  /** Valor unitário na unidade da nota. */
  valorUnitario: number;
  valorTotal: number;
  ncm: string;
};

export type NfeNota = {
  numero: string;
  serie: string;
  /** Data de emissão no formato brasileiro. */
  emissao: string;
  chave: string;
  fornecedor: { nome: string; cnpj: string };
  itens: NfeItem[];
  total: number;
};

/**
 * Um nó do XML, do jeito mínimo que a nota precisa.
 *
 * Sem DOMParser de propósito: assim o mesmo código lê a nota no navegador, no
 * `npm run check:nfe` e, se um dia a leitura for para o servidor, lá também —
 * e o que o teste cobre é exatamente o que roda para o dono da oficina.
 */
export type NoXml = {
  tag: string;
  atributos: Record<string, string>;
  texto: string;
  filhos: NoXml[];
};

/**
 * Lê o XML em uma árvore.
 *
 * Cobre o que a NF-e usa: tags com e sem atributos, tags que se fecham
 * sozinhas, comentários, CDATA e a declaração `<?xml ...?>`. Não é um parser
 * de uso geral — é o suficiente para a nota, e o que ele não entende ele
 * recusa em vez de adivinhar.
 */
export function lerXml(xml: string): NoXml {
  const fonte = String(xml ?? "");
  const raiz: NoXml = { tag: "#raiz", atributos: {}, texto: "", filhos: [] };
  const pilha: NoXml[] = [raiz];
  let i = 0;
  let achouTag = false;
  while (i < fonte.length) {
    const abre = fonte.indexOf("<", i);
    if (abre < 0) break;
    // Texto entre tags pertence a quem está aberto agora.
    if (abre > i) pilha[pilha.length - 1].texto += fonte.slice(i, abre);
    if (fonte.startsWith("<!--", abre)) { i = pular(fonte, abre, "-->"); continue; }
    if (fonte.startsWith("<![CDATA[", abre)) {
      const fim = fonte.indexOf("]]>", abre);
      if (fim < 0) throw new Error("Este arquivo não é um XML válido.");
      pilha[pilha.length - 1].texto += fonte.slice(abre + 9, fim);
      i = fim + 3;
      continue;
    }
    if (fonte.startsWith("<?", abre)) { i = pular(fonte, abre, "?>"); continue; }
    if (fonte.startsWith("<!", abre)) { i = pular(fonte, abre, ">"); continue; }
    const fecha = fonte.indexOf(">", abre);
    if (fecha < 0) throw new Error("Este arquivo não é um XML válido.");
    const conteudo = fonte.slice(abre + 1, fecha).trim();
    if (conteudo.startsWith("/")) {
      if (pilha.length > 1) pilha.pop();
      i = fecha + 1;
      continue;
    }
    const sozinha = conteudo.endsWith("/");
    const corpo = sozinha ? conteudo.slice(0, -1).trim() : conteudo;
    const espaco = corpo.search(/\s/);
    const tag = (espaco < 0 ? corpo : corpo.slice(0, espaco)).trim();
    if (!tag) throw new Error("Este arquivo não é um XML válido.");
    achouTag = true;
    const no: NoXml = { tag, atributos: lerAtributos(espaco < 0 ? "" : corpo.slice(espaco)), texto: "", filhos: [] };
    pilha[pilha.length - 1].filhos.push(no);
    if (!sozinha) pilha.push(no);
    i = fecha + 1;
  }
  if (!achouTag) throw new Error("Este arquivo não é um XML válido.");
  return raiz;
}

const pular = (fonte: string, desde: number, fim: string) => {
  const achado = fonte.indexOf(fim, desde);
  return achado < 0 ? fonte.length : achado + fim.length;
};

const lerAtributos = (trecho: string): Record<string, string> => {
  const atributos: Record<string, string> = {};
  for (const par of trecho.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g)) {
    atributos[par[1] ?? par[3]] = desescapar(par[2] ?? par[4] ?? "");
  }
  return atributos;
};

const desescapar = (valor: string) => valor
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

/** Todos os nós com esta tag, em qualquer profundidade. */
export function buscarTodos(no: NoXml, tag: string): NoXml[] {
  const achados: NoXml[] = [];
  const andar = (atual: NoXml) => {
    for (const filho of atual.filhos) {
      if (filho.tag === tag) achados.push(filho);
      andar(filho);
    }
  };
  andar(no);
  return achados;
}

/** O primeiro nó com esta tag, ou nada. */
export function buscar(no: NoXml, tag: string): NoXml | null {
  return buscarTodos(no, tag)[0] ?? null;
}

const texto = (no: NoXml | null | undefined, tag: string): string =>
  desescapar((no ? buscar(no, tag)?.texto ?? "" : "")).trim();

const numero = (no: NoXml | null | undefined, tag: string): number => {
  const valor = Number(texto(no, tag).replace(",", "."));
  return Number.isFinite(valor) ? valor : 0;
};

/** Converte "2026-06-28T14:30:00-03:00" (ou "2026-06-28") em 28/06/2026. */
export function dataDaNota(valor: string): string {
  const iso = (valor ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : "";
}

/**
 * Lê o XML da NF-e.
 *
 * Aceita o XML da nota e o do "procNFe" (o que vem autorizado, com a nota
 * dentro) — é esse segundo que o fornecedor manda por e-mail, e recusá-lo
 * mandaria a pessoa procurar outro arquivo que ela não tem.
 */
export function lerNfe(xml: string): NfeNota {
  const documento = lerXml(xml);
  const infNFe = buscar(documento, "infNFe");
  if (!infNFe) throw new Error("Não encontrei a nota dentro do arquivo. Envie o XML da NF-e do fornecedor.");

  const ide = buscar(infNFe, "ide");
  const emit = buscar(infNFe, "emit");
  const itens: NfeItem[] = buscarTodos(infNFe, "det").map((det, indice) => {
    const prod = buscar(det, "prod");
    const gtin = texto(prod, "cEAN");
    return {
      numero: Number(det.atributos.nItem) || indice + 1,
      codigoFornecedor: texto(prod, "cProd"),
      // A Receita manda escrever "SEM GTIN" quando não há código de barras;
      // tratar isso como código faria a busca casar peças diferentes.
      gtin: gtin && gtin.toUpperCase() !== "SEM GTIN" ? gtin : "",
      descricao: texto(prod, "xProd"),
      unidade: texto(prod, "uCom").toUpperCase(),
      quantidade: numero(prod, "qCom"),
      valorUnitario: numero(prod, "vUnCom"),
      valorTotal: numero(prod, "vProd"),
      ncm: texto(prod, "NCM"),
    };
  });

  return {
    numero: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    emissao: dataDaNota(texto(ide, "dhEmi") || texto(ide, "dEmi")),
    chave: (infNFe.atributos.Id ?? "").replace(/^NFe/, ""),
    fornecedor: { nome: texto(emit, "xNome"), cnpj: texto(emit, "CNPJ") },
    itens,
    total: itens.reduce((soma, item) => soma + item.valorTotal, 0),
  };
}

/**
 * Quantas unidades vêm em cada volume da nota.
 *
 * A nota diz "1 CX" e na prateleira entram 6 unidades. Sem isso o estoque
 * entra com 1 e a peça "acaba" no sistema com cinco ainda na caixa — e o
 * custo unitário fica seis vezes maior do que é.
 *
 * O palpite sai da descrição, que é onde o fornecedor escreve: "CX C/ 12",
 * "CAIXA COM 6", "EMB. 24 UN", "FD 20X1L". É palpite mesmo: a tela mostra o
 * número e deixa corrigir, porque errar aqui estraga o estoque e o custo.
 */
export function fatorSugerido(item: Pick<NfeItem, "descricao" | "unidade">): number {
  const desc = (item.descricao ?? "").toUpperCase();
  const padroes = [
    /C\/\s*(\d{1,4})/,            // "CX C/ 12"
    /COM\s+(\d{1,4})/,            // "CAIXA COM 6"
    /EMB\.?\s*(\d{1,4})/,         // "EMB. 24"
    /(\d{1,4})\s*X\s*\d/,         // "20X1L"
    /(\d{1,4})\s*(?:UN|UNID|PC)\b/, // "12 UN"
  ];
  for (const padrao of padroes) {
    const achado = desc.match(padrao);
    const valor = achado ? Number(achado[1]) : 0;
    if (valor > 1 && valor <= 1000) return valor;
  }
  // Unidade que já é unitária não multiplica nada.
  return 1;
}

/** Quanto entra no estoque: a quantidade da nota vezes o que vem em cada volume. */
export function quantidadeQueEntra(quantidadeDaNota: number, fator: number): number {
  const q = Number(quantidadeDaNota) || 0;
  const f = comoFator(fator);
  // Fator inválido não vira "1": entrar com a quantidade da nota escondendo
  // que o número está errado é pior do que não entrar com nada. A tela recusa
  // antes de chegar aqui, com `fatorProblema`.
  if (f <= 0) return 0;
  return arredonda(q * f);
}

/** O que há de errado com o fator digitado, ou vazio quando está bom. */
export function fatorProblema(fator: unknown): string {
  const valor = Number(fator);
  if (!Number.isFinite(valor) || valor === 0) return "Informe quantas unidades vêm em cada volume.";
  if (valor < 0) return "O número de unidades por volume não pode ser negativo.";
  if (!Number.isInteger(valor)) return "Use um número inteiro de unidades por volume.";
  if (valor > 1000) return "Mais de 1000 unidades por volume? Confira o número.";
  return "";
}

const comoFator = (fator: unknown): number => {
  const valor = Number(fator);
  return Number.isFinite(valor) ? valor : 1;
};

/**
 * O custo de CADA unidade que entra no estoque.
 *
 * A nota traz o preço do volume. Guardar esse preço como custo unitário faz a
 * peça nascer seis vezes mais cara e o preço de venda sair pela lua.
 */
export function custoUnitario(valorUnitarioDaNota: number, fator: number): number {
  const f = comoFator(fator);
  if (f <= 0) return 0;
  return arredonda((Number(valorUnitarioDaNota) || 0) / f);
}

export type ProdutoConhecido = {
  id: string;
  code: string;
  name: string;
  barcode?: string;
  partNumber?: string;
  cost: number;
  stock: number;
};

export type ItemConferido = {
  item: NfeItem;
  /** O produto do sistema que corresponde, quando achamos. */
  produto: ProdutoConhecido | null;
  /** Como o produto foi encontrado — a tela mostra, porque muda a confiança. */
  achadoPor: "código de barras" | "referência" | "descrição" | null;
  fator: number;
  entra: number;
  custoNovo: number;
  /** Custo que estava no cadastro. Zero quando a peça é nova. */
  custoAnterior: number;
  /** Diferença em porcentagem do custo. Positivo é aumento. */
  variacao: number;
};

const soLetrasENumeros = (valor: string) => (valor ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Casa cada item da nota com o cadastro, na ordem em que dá para confiar.
 *
 * Código de barras é exato. Referência de fábrica é quase. Descrição é o
 * último recurso e só quando é idêntica — casar "ÓLEO 20W50" com "ÓLEO 20W50
 * SEMISSINTÉTICO" faria a entrada somar no produto errado, e ninguém
 * perceberia até o estoque não fechar.
 */
export function conferirNota(nota: NfeNota, produtos: ProdutoConhecido[]): ItemConferido[] {
  return nota.itens.map((item) => {
    const porGtin = item.gtin
      ? produtos.find((produto) => soLetrasENumeros(produto.barcode ?? "") === soLetrasENumeros(item.gtin))
      : undefined;
    const porReferencia = !porGtin && item.codigoFornecedor
      ? produtos.find((produto) => Boolean(produto.partNumber) && soLetrasENumeros(produto.partNumber ?? "") === soLetrasENumeros(item.codigoFornecedor))
      : undefined;
    const porDescricao = !porGtin && !porReferencia
      ? produtos.find((produto) => soLetrasENumeros(produto.name) === soLetrasENumeros(item.descricao))
      : undefined;
    const produto = porGtin ?? porReferencia ?? porDescricao ?? null;
    const achadoPor = porGtin ? "código de barras" as const
      : porReferencia ? "referência" as const
      : porDescricao ? "descrição" as const
      : null;
    const fator = fatorSugerido(item);
    const custoNovo = custoUnitario(item.valorUnitario, fator);
    const custoAnterior = produto?.cost ?? 0;
    return {
      item,
      produto,
      achadoPor,
      fator,
      entra: quantidadeQueEntra(item.quantidade, fator),
      custoNovo,
      custoAnterior,
      variacao: custoAnterior > 0 ? arredonda(((custoNovo - custoAnterior) / custoAnterior) * 100) : 0,
    };
  });
}

/** O resumo que a tela mostra antes de deixar dar entrada. */
export function resumoDaConferencia(conferidos: ItemConferido[]) {
  const jaCadastrados = conferidos.filter((linha) => linha.produto);
  return {
    total: conferidos.length,
    jaCadastrados: jaCadastrados.length,
    novos: conferidos.length - jaCadastrados.length,
    subiramDePreco: jaCadastrados.filter((linha) => linha.variacao > 0).length,
    caiuDePreco: jaCadastrados.filter((linha) => linha.variacao < 0).length,
    valor: arredonda(conferidos.reduce((soma, linha) => soma + linha.item.valorTotal, 0)),
  };
}

const arredonda = (valor: number) => Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;

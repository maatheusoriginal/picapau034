/**
 * A ordem de serviço em A4, desenhada e baixada como PDF.
 *
 * Esta é a ÚNICA parte do sistema que conhece a biblioteca de PDF. O que entra
 * no documento — e o que nunca pode entrar — é decidido em src/order-pdf.ts,
 * que é puro e conferido por `npm run check:order-pdf`. Aqui só se desenha o
 * que aquele modelo mandou.
 *
 * O PDF é escrito com TEXTO DE VERDADE, e não como foto da tela: o cliente
 * consegue selecionar, copiar e buscar, o arquivo fica em poucos KB — o que
 * importa para mandar pelo WhatsApp de uma oficina — e a letra não borra quando
 * ele dá zoom no celular.
 *
 * A biblioteca é carregada só quando alguém clica em baixar. Ela é grande, e
 * fazer o balcão esperar por ela em toda abertura do sistema, para um botão que
 * se usa algumas vezes por dia, seria pagar caro por nada.
 *
 * UMA FOLHA SÓ.
 *
 * A oficina manda este arquivo pelo WhatsApp: duas páginas viram duas rolagens
 * e a segunda quase nunca é lida. Com o cadastro completo — cliente com
 * endereço, moto com chassi, problema e diagnóstico escritos — o conteúdo
 * natural passava de 340 mm numa folha que oferece 263 mm, e até uma troca de
 * óleo saía em duas páginas.
 *
 * A folga veio da estrutura: campo mais justo, título de bloco sem régua e topo
 * mais baixo. O que sobrou é resolvido pelo ajuste de escala em `renderOrderPdf`
 * — desenha, mede, e se ainda passou, redesenha um pouco menor. Nada é cortado
 * em momento algum: informação que o cliente precisa não cabe menos, cabe em
 * letra menor, e abaixo do piso de legibilidade o documento aceita a segunda
 * página em vez de virar algo que ninguém lê.
 */
import type { OrderPdfModel, PdfField, PdfTable } from "../src/order-pdf";

const A4 = { largura: 210, altura: 297 };
const MARGEM = 14;
const LARGURA_UTIL = A4.largura - MARGEM * 2;
const RODAPE = A4.altura - 12;

const TINTA = { escuro: [26, 27, 30], corpo: [58, 59, 63], apagado: [116, 117, 121] } as const;
const MARCA = [214, 40, 40] as const;
const FUNDO = { claro: [247, 246, 244], linha: [231, 229, 225] } as const;

type Doc = import("jspdf").jsPDF;
type Jspdf = typeof import("jspdf")["jsPDF"];

/**
 * Escalas tentadas, da natural à mais apertada.
 *
 * O piso não é um número bonito: a 0,78 o corpo do texto fica em 7,4pt, que
 * ainda se lê no celular sem dar zoom. Abaixo disso o documento passaria a
 * caber às custas de ninguém conseguir ler — que é o contrário do pedido.
 */
const ESCALAS = [1, 0.95, 0.9, 0.86, 0.82, 0.78];

/**
 * Desenha o documento e devolve o PDF pronto, sem baixar.
 *
 * Separado do download de propósito: é assim que a conferência gera o mesmo
 * arquivo que a oficina vai gerar e OLHA o resultado, em vez de confiar que
 * compilou. Documento que compila e sai torto é o defeito clássico daqui.
 */
export async function renderOrderPdf(model: OrderPdfModel): Promise<Doc> {
  // Import dinâmico: a biblioteca só desce quando o botão é usado.
  const { jsPDF } = await import("jspdf");
  let ultimo = desenhar(jsPDF, model, 1);
  if (ultimo.getNumberOfPages() === 1) return ultimo;
  for (const escala of ESCALAS.slice(1)) {
    ultimo = desenhar(jsPDF, model, escala);
    if (ultimo.getNumberOfPages() === 1) return ultimo;
  }
  // Nem no piso coube: OS com dezenas de itens existe, e para ela a segunda
  // folha é honesta. O que não se faz é esconder linha do cliente.
  return ultimo;
}

function desenhar(jsPDF: Jspdf, model: OrderPdfModel, escala: number): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setFont("helvetica", "normal");

  /** Medida vertical na escala atual. O horizontal não encolhe: a folha continua com a mesma largura. */
  const e = (valor: number) => valor * escala;
  /** Corpo de letra na escala atual. */
  const corpo = (tamanho: number) => doc.setFontSize(tamanho * escala);

  let y = MARGEM;

  const tinta = (cor: readonly number[]) => doc.setTextColor(cor[0], cor[1], cor[2]);
  const fundo = (cor: readonly number[]) => doc.setFillColor(cor[0], cor[1], cor[2]);
  const traco = (cor: readonly number[]) => doc.setDrawColor(cor[0], cor[1], cor[2]);

  const cabe = (precisa: number) => y + precisa <= RODAPE - 6;
  const novaPagina = () => { doc.addPage(); y = MARGEM; };
  const garantirEspaco = (precisa: number) => { if (!cabe(precisa)) novaPagina(); };

  // ------------------------------------------------------------------ topo
  const desenharTopo = () => {
    const alturaLogo = e(15);
    let x = MARGEM;
    if (model.workshop.logo) {
      try {
        // A proporção real da imagem é respeitada: logo esticada é a primeira
        // coisa que denuncia documento feito às pressas.
        const props = doc.getImageProperties(model.workshop.logo);
        const largura = Math.min(36, (props.width / props.height) * alturaLogo);
        doc.addImage(model.workshop.logo, x, y, largura, alturaLogo, undefined, "FAST");
        x += largura + 4.5;
      } catch {
        // Logo que o navegador não decodifica não pode derrubar o documento
        // inteiro: o papel sai sem ela.
      }
    }
    doc.setFont("helvetica", "bold");
    corpo(16);
    tinta(TINTA.escuro);
    doc.text(model.workshop.name, x, y + e(5.6));
    doc.setFont("helvetica", "normal");
    corpo(8.5);
    tinta(TINTA.apagado);
    model.workshop.lines.forEach((linha, indice) => doc.text(linha, x, y + e(10.4) + indice * e(3.6)));
    y += Math.max(alturaLogo, e(9.4) + model.workshop.lines.length * e(3.5)) + e(2.8);

    traco(MARCA);
    doc.setLineWidth(0.8);
    doc.line(MARGEM, y, A4.largura - MARGEM, y);
    doc.setLineWidth(0.2);
    y += e(4.4);
  };

  const desenharTitulo = () => {
    const altura = e(10);
    fundo(FUNDO.claro);
    doc.roundedRect(MARGEM, y, LARGURA_UTIL, altura, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    corpo(11.5);
    tinta(TINTA.escuro);
    doc.text(model.title, MARGEM + 4, y + altura * 0.66);
    y += altura + e(2.6);
  };

  /**
   * Campos em colunas: rótulo miúdo em cima, valor embaixo.
   *
   * A folga daqui foi o maior ganho da folha única. O respiro entre o rótulo e
   * o valor, e entre uma linha e a seguinte, estava dimensionado para um
   * formulário de tela; no papel ele virava um terço de folha em branco
   * distribuído em pingos que ninguém nota olhando.
   */
  const desenharCampos = (campos: PdfField[], colunas: number) => {
    if (!campos.length) return;
    const larguraColuna = LARGURA_UTIL / colunas;
    for (let indice = 0; indice < campos.length; indice += colunas) {
      const doGrupo = campos.slice(indice, indice + colunas);
      corpo(9);
      // Valor comprido quebra em várias linhas: o endereço do cliente é o
      // caso de sempre.
      const quebrado = doGrupo.map((campo) => doc.splitTextToSize(campo.value, larguraColuna - 5));
      const altura = e(2.6) + Math.max(...quebrado.map((linhas) => linhas.length)) * e(3.7) + e(1.1);
      garantirEspaco(altura);
      doGrupo.forEach((campo, coluna) => {
        const x = MARGEM + coluna * larguraColuna;
        doc.setFont("helvetica", "normal");
        corpo(6.8);
        tinta(TINTA.apagado);
        doc.text(campo.label.toUpperCase(), x, y + e(2.1));
        doc.setFont("helvetica", "bold");
        corpo(9);
        tinta(TINTA.corpo);
        doc.text(quebrado[coluna], x, y + e(5.7));
      });
      y += altura;
    }
    y += e(0.8);
  };

  /** Título de bloco: vermelho, miúdo, sem régua. A régua custava altura e não dizia nada. */
  const desenharSecao = (titulo: string) => {
    garantirEspaco(e(9));
    doc.setFont("helvetica", "bold");
    corpo(8.2);
    tinta(MARCA);
    doc.text(titulo.toUpperCase(), MARGEM, y + e(3));
    tinta(TINTA.corpo);
    y += e(5.2);
  };

  // ---------------------------------------------------------------- tabelas
  const COLUNAS = [
    { titulo: "Descrição", largura: LARGURA_UTIL - 78, alinhar: "left" as const },
    { titulo: "Qtd.", largura: 16, alinhar: "center" as const },
    { titulo: "Valor unitário", largura: 30, alinhar: "right" as const },
    { titulo: "Total", largura: 32, alinhar: "right" as const },
  ];

  const celula = (texto: string | string[], x: number, largura: number, alinhar: "left" | "center" | "right", linhaY: number) => {
    if (alinhar === "left") doc.text(texto, x + 2, linhaY);
    else if (alinhar === "center") doc.text(texto, x + largura / 2, linhaY, { align: "center" });
    else doc.text(texto, x + largura - 2, linhaY, { align: "right" });
  };

  const cabecalhoDaTabela = () => {
    const altura = e(6);
    fundo(FUNDO.claro);
    doc.rect(MARGEM, y, LARGURA_UTIL, altura, "F");
    doc.setFont("helvetica", "bold");
    corpo(7.6);
    tinta(TINTA.apagado);
    let x = MARGEM;
    for (const coluna of COLUNAS) {
      celula(coluna.titulo.toUpperCase(), x, coluna.largura, coluna.alinhar, y + altura * 0.68);
      x += coluna.largura;
    }
    y += altura;
  };

  const desenharTabela = (tabela: PdfTable) => {
    desenharSecao(tabela.title);
    cabecalhoDaTabela();
    for (const linha of tabela.rows) {
      corpo(8.8);
      const descricao = doc.splitTextToSize(linha.description, COLUNAS[0].largura - 4);
      const altura = Math.max(e(5.4), descricao.length * e(3.6) + e(1.9));
      if (!cabe(altura + e(9))) {
        novaPagina();
        cabecalhoDaTabela();
      }
      doc.setFont("helvetica", "normal");
      corpo(8.8);
      tinta(TINTA.corpo);
      let x = MARGEM;
      doc.text(descricao, x + 2, y + e(4.1));
      x += COLUNAS[0].largura;
      celula(linha.quantity, x, COLUNAS[1].largura, "center", y + e(4.1));
      x += COLUNAS[1].largura;
      celula(linha.unit, x, COLUNAS[2].largura, "right", y + e(4.1));
      x += COLUNAS[2].largura;
      doc.setFont("helvetica", "bold");
      celula(linha.total, x, COLUNAS[3].largura, "right", y + e(4.1));
      y += altura;
      traco(FUNDO.linha);
      doc.line(MARGEM, y, A4.largura - MARGEM, y);
    }
    // Subtotal encostado à direita, alinhado com a coluna do total.
    garantirEspaco(e(7.5));
    doc.setFont("helvetica", "normal");
    corpo(8);
    tinta(TINTA.apagado);
    doc.text(tabela.subtotalLabel, A4.largura - MARGEM - 36, y + e(4.2), { align: "right" });
    doc.setFont("helvetica", "bold");
    tinta(TINTA.corpo);
    doc.text(tabela.subtotal, A4.largura - MARGEM - 2, y + e(4.2), { align: "right" });
    y += e(7.4);
  };

  // ----------------------------------------------------------------- totais
  const desenharTotais = () => {
    const alturaCaixa = e(11.5);
    garantirEspaco(model.totals.length * e(4.8) + alturaCaixa + e(5));
    for (const campo of model.totals) {
      doc.setFont("helvetica", "normal");
      corpo(9);
      tinta(TINTA.apagado);
      doc.text(campo.label, A4.largura - MARGEM - 40, y + e(3.4), { align: "right" });
      doc.setFont("helvetica", "bold");
      tinta(TINTA.corpo);
      doc.text(campo.value, A4.largura - MARGEM - 2, y + e(3.4), { align: "right" });
      y += e(4.6);
    }
    y += e(1.2);
    // O total em destaque: é o número que o cliente procura primeiro. Esta
    // caixa não encolhe junto com o resto abaixo de um piso próprio — é a
    // linha que o cliente abre o arquivo para ver.
    const alturaFinal = Math.max(alturaCaixa, 10);
    fundo(MARCA);
    doc.roundedRect(A4.largura - MARGEM - 96, y, 96, alturaFinal, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(Math.max(8, 8.5 * escala));
    doc.text(model.grandTotal.label, A4.largura - MARGEM - 92, y + alturaFinal * 0.44);
    doc.setFontSize(Math.max(11.5, 13 * escala));
    doc.text(model.grandTotal.value, A4.largura - MARGEM - 4, y + alturaFinal * 0.83, { align: "right" });
    y += alturaFinal + e(4.4);
    tinta(TINTA.corpo);
  };

  const desenharTextos = () => {
    for (const bloco of model.texts) {
      corpo(8.8);
      const linhas = doc.splitTextToSize(bloco.text, LARGURA_UTIL - 4);
      garantirEspaco(linhas.length * e(3.7) + e(9));
      desenharSecao(bloco.title);
      doc.setFont("helvetica", "normal");
      corpo(8.8);
      tinta(TINTA.corpo);
      // Um respiro entre o título vermelho e o texto: sem ele os dois se
      // encostam e o bloco lido no celular vira um borrão só.
      doc.text(linhas, MARGEM, y + e(0.9));
      y += linhas.length * e(3.7) + e(2.9);
    }
  };

  desenharTopo();
  desenharTitulo();
  desenharCampos(model.headline, 3);
  if (model.customer.length) { desenharSecao("Cliente"); desenharCampos(model.customer, 3); }
  if (model.motorcycle.length) { desenharSecao("Motocicleta"); desenharCampos(model.motorcycle, 4); }
  for (const tabela of model.tables) desenharTabela(tabela);
  desenharTotais();
  desenharTextos();

  // Rodapé com a paginação, escrito só no fim, quando já se sabe quantas
  // páginas o documento tem.
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    traco(FUNDO.linha);
    doc.line(MARGEM, RODAPE - 4, A4.largura - MARGEM, RODAPE - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    tinta(TINTA.apagado);
    doc.text(model.footer, MARGEM, RODAPE);
    // Documento de uma folha não precisa dizer "Página 1 de 1".
    if (paginas > 1) doc.text(`Página ${pagina} de ${paginas}`, A4.largura - MARGEM, RODAPE, { align: "right" });
  }

  return doc;
}

/** Monta e baixa. É o que o botão da OS chama. */
export async function downloadOrderPdf(model: OrderPdfModel, fileName: string): Promise<void> {
  const doc = await renderOrderPdf(model);
  doc.save(fileName);
}

export type { Doc };

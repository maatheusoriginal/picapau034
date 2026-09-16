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
 */
import type { OrderPdfModel, PdfField, PdfTable } from "../src/order-pdf";

const A4 = { largura: 210, altura: 297 };
const MARGEM = 14;
const LARGURA_UTIL = A4.largura - MARGEM * 2;
const RODAPE = A4.altura - 14;

const TINTA = { escuro: [26, 27, 30], corpo: [58, 59, 63], apagado: [116, 117, 121] } as const;
const MARCA = [214, 40, 40] as const;
const FUNDO = { claro: [247, 246, 244], linha: [231, 229, 225] } as const;

type Doc = import("jspdf").jsPDF;

/** Quanto espaço a página ainda tem antes do rodapé. */
const cabe = (y: number, precisa: number) => y + precisa <= RODAPE - 6;

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
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setFont("helvetica", "normal");

  let y = MARGEM;

  const tinta = (cor: readonly number[]) => doc.setTextColor(cor[0], cor[1], cor[2]);
  const fundo = (cor: readonly number[]) => doc.setFillColor(cor[0], cor[1], cor[2]);
  const traco = (cor: readonly number[]) => doc.setDrawColor(cor[0], cor[1], cor[2]);

  const novaPagina = () => { doc.addPage(); y = MARGEM; };
  const garantirEspaco = (precisa: number) => { if (!cabe(y, precisa)) novaPagina(); };

  // ------------------------------------------------------------------ topo
  const desenharTopo = () => {
    const alturaLogo = 16;
    let x = MARGEM;
    if (model.workshop.logo) {
      try {
        // A proporção real da imagem é respeitada: logo esticada é a primeira
        // coisa que denuncia documento feito às pressas.
        const props = doc.getImageProperties(model.workshop.logo);
        const largura = Math.min(38, (props.width / props.height) * alturaLogo);
        doc.addImage(model.workshop.logo, x, y, largura, alturaLogo, undefined, "FAST");
        x += largura + 5;
      } catch {
        // Logo que o navegador não decodifica não pode derrubar o documento
        // inteiro: o papel sai sem ela.
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    tinta(TINTA.escuro);
    doc.text(model.workshop.name, x, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    tinta(TINTA.apagado);
    model.workshop.lines.forEach((linha, indice) => doc.text(linha, x, y + 11.5 + indice * 4));
    y += Math.max(alturaLogo, 10.5 + model.workshop.lines.length * 3.8) + 3.5;

    traco(MARCA);
    doc.setLineWidth(0.8);
    doc.line(MARGEM, y, A4.largura - MARGEM, y);
    doc.setLineWidth(0.2);
    y += 5.5;
  };

  const desenharTitulo = () => {
    fundo(FUNDO.claro);
    doc.roundedRect(MARGEM, y, LARGURA_UTIL, 11, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    tinta(TINTA.escuro);
    doc.text(model.title, MARGEM + 4, y + 7.1);
    y += 13.5;
  };

  /** Campos em duas colunas: rótulo miúdo em cima, valor embaixo. */
  const desenharCampos = (campos: PdfField[], colunas: number) => {
    if (!campos.length) return;
    const larguraColuna = LARGURA_UTIL / colunas;
    let linha = 0;
    for (let indice = 0; indice < campos.length; indice += colunas) {
      const doGrupo = campos.slice(indice, indice + colunas);
      // Valor comprido quebra em várias linhas: o endereço do cliente é o
      // caso de sempre.
      const alturas = doGrupo.map((campo) => doc.splitTextToSize(campo.value, larguraColuna - 6).length);
      const altura = 3.8 + Math.max(...alturas) * 4.0 + 1.6;
      garantirEspaco(altura);
      doGrupo.forEach((campo, coluna) => {
        const x = MARGEM + coluna * larguraColuna;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        tinta(TINTA.apagado);
        doc.text(campo.label.toUpperCase(), x, y + 2.6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        tinta(TINTA.corpo);
        doc.text(doc.splitTextToSize(campo.value, larguraColuna - 6), x, y + 6.8);
      });
      y += altura;
      linha += 1;
    }
    void linha;
    y += 1;
  };

  const desenharSecao = (titulo: string) => {
    garantirEspaco(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    tinta(MARCA);
    doc.text(titulo.toUpperCase(), MARGEM, y + 3.5);
    traco(FUNDO.linha);
    doc.line(MARGEM, y + 5.5, A4.largura - MARGEM, y + 5.5);
    tinta(TINTA.corpo);
    y += 8.4;
  };

  // ---------------------------------------------------------------- tabelas
  const COLUNAS = [
    { titulo: "Descrição", largura: LARGURA_UTIL - 78, alinhar: "left" as const },
    { titulo: "Qtd.", largura: 16, alinhar: "center" as const },
    { titulo: "Valor unitário", largura: 30, alinhar: "right" as const },
    { titulo: "Total", largura: 32, alinhar: "right" as const },
  ];

  const celula = (texto: string, x: number, largura: number, alinhar: "left" | "center" | "right", linhaY: number) => {
    if (alinhar === "left") doc.text(texto, x + 2, linhaY);
    else if (alinhar === "center") doc.text(texto, x + largura / 2, linhaY, { align: "center" });
    else doc.text(texto, x + largura - 2, linhaY, { align: "right" });
  };

  const cabecalhoDaTabela = () => {
    fundo(FUNDO.claro);
    doc.rect(MARGEM, y, LARGURA_UTIL, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    tinta(TINTA.apagado);
    let x = MARGEM;
    for (const coluna of COLUNAS) {
      celula(coluna.titulo.toUpperCase(), x, coluna.largura, coluna.alinhar, y + 4.7);
      x += coluna.largura;
    }
    y += 7;
  };

  const desenharTabela = (tabela: PdfTable) => {
    desenharSecao(tabela.title);
    cabecalhoDaTabela();
    for (const linha of tabela.rows) {
      const descricao = doc.splitTextToSize(linha.description, COLUNAS[0].largura - 4);
      const altura = Math.max(6.2, descricao.length * 4.0 + 2.4);
      if (!cabe(y, altura + 10)) {
        novaPagina();
        cabecalhoDaTabela();
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      tinta(TINTA.corpo);
      let x = MARGEM;
      doc.text(descricao, x + 2, y + 4.8);
      x += COLUNAS[0].largura;
      celula(linha.quantity, x, COLUNAS[1].largura, "center", y + 4.8);
      x += COLUNAS[1].largura;
      celula(linha.unit, x, COLUNAS[2].largura, "right", y + 4.8);
      x += COLUNAS[2].largura;
      doc.setFont("helvetica", "bold");
      celula(linha.total, x, COLUNAS[3].largura, "right", y + 4.8);
      y += altura;
      traco(FUNDO.linha);
      doc.line(MARGEM, y, A4.largura - MARGEM, y);
    }
    // Subtotal encostado à direita, alinhado com a coluna do total.
    garantirEspaco(9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    tinta(TINTA.apagado);
    doc.text(tabela.subtotalLabel, A4.largura - MARGEM - 36, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    tinta(TINTA.corpo);
    doc.text(tabela.subtotal, A4.largura - MARGEM - 2, y + 5, { align: "right" });
    y += 9;
  };

  // ----------------------------------------------------------------- totais
  const desenharTotais = () => {
    const linhas = model.totals.length;
    garantirEspaco(linhas * 5.5 + 18);
    for (const campo of model.totals) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      tinta(TINTA.apagado);
      doc.text(campo.label, A4.largura - MARGEM - 40, y + 4, { align: "right" });
      doc.setFont("helvetica", "bold");
      tinta(TINTA.corpo);
      doc.text(campo.value, A4.largura - MARGEM - 2, y + 4, { align: "right" });
      y += 5.2;
    }
    y += 1.5;
    // O total em destaque: é o número que o cliente procura primeiro.
    const alturaCaixa = 13;
    fundo(MARCA);
    doc.roundedRect(A4.largura - MARGEM - 96, y, 96, alturaCaixa, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(model.grandTotal.label, A4.largura - MARGEM - 92, y + 5.6);
    doc.setFontSize(13);
    doc.text(model.grandTotal.value, A4.largura - MARGEM - 4, y + 9.6, { align: "right" });
    y += alturaCaixa + 6;
    tinta(TINTA.corpo);
  };

  const desenharTextos = () => {
    for (const bloco of model.texts) {
      const corpo = doc.splitTextToSize(bloco.text, LARGURA_UTIL - 8);
      garantirEspaco(corpo.length * 4.2 + 13);
      desenharSecao(bloco.title);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      tinta(TINTA.corpo);
      doc.text(corpo, MARGEM, y + 0.6);
      y += corpo.length * 4.2 + 3.5;
    }
  };

  desenharTopo();
  desenharTitulo();
  desenharCampos(model.headline, 3);
  if (model.customer.length) { desenharSecao("Cliente"); desenharCampos(model.customer, 2); }
  if (model.motorcycle.length) { desenharSecao("Motocicleta"); desenharCampos(model.motorcycle, 3); }
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
    doc.setFontSize(8);
    tinta(TINTA.apagado);
    doc.text(model.footer, MARGEM, RODAPE);
    doc.text(`Página ${pagina} de ${paginas}`, A4.largura - MARGEM, RODAPE, { align: "right" });
  }

  return doc;
}

/** Monta e baixa. É o que o botão da OS chama. */
export async function downloadOrderPdf(model: OrderPdfModel, fileName: string): Promise<void> {
  const doc = await renderOrderPdf(model);
  doc.save(fileName);
}

export type { Doc };

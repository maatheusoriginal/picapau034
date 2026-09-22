/**
 * Manda um documento para a impressora e abre o WhatsApp.
 *
 * O conteúdo é montado em src/documents.ts; aqui fica só o efeito colateral.
 *
 * A impressão usa um iframe escondido em vez de window.print() na própria
 * página: assim o cupom sai com o CSS dele (80mm, monoespaçada) sem herdar nada
 * do app, e não é preciso esconder a tela inteira com @media print.
 *
 * Isso vale no COMPUTADOR. No celular o Android imprime a página de cima em
 * vez da moldura — e aí sai a tela do sistema no lugar do cupom —, então lá o
 * cupom vai para uma janela própria. Quem decide é o printTarget.
 */
import { printTarget } from "../src/printing-target";

/**
 * O cupom numa janela própria — o caminho do CELULAR.
 *
 * O Android não imprime a moldura escondida: ele imprime a página de cima. A
 * oficina pediu as três vias de uma OS pelo telefone e saiu a TELA DO SISTEMA,
 * com menu e botões. Numa janela própria o cupom É o documento de topo, então
 * não existe moldura para o navegador ignorar.
 *
 * Devolve `false` quando a janela não abriu (bloqueador de pop-up), para quem
 * chamou voltar para a moldura em vez de não imprimir nada.
 */
function imprimirEmJanelaPropria(html: string): boolean {
  const janela = window.open("", "_blank");
  if (!janela) return false;
  janela.document.open();
  janela.document.write(html);
  janela.document.close();

  const mandar = async () => {
    try {
      // A logomarca precisa estar decodificada antes da foto da impressão,
      // senão ela sai em branco no papel.
      await Promise.all(Array.from(janela.document.images).map((imagem) => imagem.decode().catch(() => undefined)));
      // Fechar a aba sozinho é gentileza, e só depois que a impressão acabou:
      // fechar antes cancela o trabalho no meio. Se o `afterprint` não vier —
      // e no celular às vezes não vem —, a aba fica com o cupom na tela, que
      // ainda é melhor do que sumir sem imprimir.
      janela.addEventListener("afterprint", () => janela.close(), { once: true });
      janela.focus();
      janela.print();
    } catch {
      janela.close();
    }
  };

  if (janela.document.readyState === "complete") void mandar();
  else janela.addEventListener("load", () => void mandar(), { once: true });
  return true;
}

/** Envia o HTML para a impressora do navegador. */
export function printDocument(html: string) {
  if (typeof document === "undefined") return;

  // No telefone a moldura escondida não vale (ver src/printing-target.ts).
  if (typeof window !== "undefined" && printTarget(navigator.userAgent) === "janela" && imprimirEmJanelaPropria(html)) return;

  // A moldura fica FORA da tela, e não com tamanho zero.
  //
  // Com `width: 0; height: 0` o documento de dentro é montado numa janela de
  // largura zero — medido: `documentElement.clientWidth` dava 0. Papel de
  // largura zero é o tipo de conta degenerada em que o navegador desiste de
  // paginar e devolve tudo numa página só, que foi a queixa da oficina: as
  // três vias saindo grudadas numa folha. Uma folha inteira de largura resolve
  // sem aparecer para ninguém, porque ela está a dez mil pixels à esquerda.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "210mm";
  frame.style.height = "297mm";
  frame.style.border = "0";

  // O iframe só pode ser removido depois que o diálogo de impressão fecha —
  // tirá-lo antes cancela a impressão no meio.
  const cleanup = () => {
    window.clearTimeout(fallbackCleanup);
    window.setTimeout(() => frame.remove(), 1000);
  };
  // Some browsers return from print() while their print sheet is still open.
  const fallbackCleanup = window.setTimeout(cleanup, 10 * 60 * 1000);

  let started = false;
  frame.onload = async () => {
    if (started) return;
    started = true;
    const view = frame.contentWindow;
    if (!view) return cleanup();
    try {
      // Wait for the uploaded logo to decode before the print snapshot is taken.
      await Promise.all(Array.from(view.document.images).map((image) => image.decode().catch(() => undefined)));
      view.addEventListener("afterprint", cleanup, { once: true });
      view.focus();
      view.print();
    } catch {
      cleanup();
    }
  };

  frame.srcdoc = html;
  document.body.appendChild(frame);
}

/**
 * Abre a conversa do WhatsApp em outra aba.
 *
 * `noopener` evita que a página aberta ganhe acesso a esta pela window.opener.
 */
export function openWhatsapp(url: string) {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

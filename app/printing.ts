/**
 * Manda um documento para a impressora e abre o WhatsApp.
 *
 * O conteúdo é montado em src/documents.ts; aqui fica só o efeito colateral.
 *
 * A impressão usa um iframe escondido em vez de window.print() na própria
 * página: assim o cupom sai com o CSS dele (80mm, monoespaçada) sem herdar nada
 * do app, e não é preciso esconder a tela inteira com @media print.
 */

/** Envia o HTML para a impressora do navegador. */
export function printDocument(html: string) {
  if (typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

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

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
    window.setTimeout(() => frame.remove(), 1000);
  };

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) return cleanup();
    try {
      view.focus();
      view.print();
    } finally {
      cleanup();
    }
  };

  document.body.appendChild(frame);
  frame.srcdoc = html;
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

import { useEffect, useRef } from "react";

/** Applies focus containment to the existing dialog families, including lazy forms. */
export function useModalFocus(open: boolean, onEscape: () => void) {
  const close = useRef(onEscape);
  close.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const top = () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')).at(-1);
    const targets = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((node) => node.getClientRects().length > 0 && !node.closest("[inert]"));
    const focusDialog = () => { const dialog = top(); if (dialog && !dialog.contains(document.activeElement)) { dialog.tabIndex = -1; (targets(dialog)[0] ?? dialog).focus(); } };
    const observer = new MutationObserver(focusDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    focusDialog();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const button = top()?.querySelector<HTMLButtonElement>('button[aria-label^="Fechar"]:not(:disabled)'); if (button) button.click(); else close.current(); }
      if (event.key !== "Tab") return;
      const dialog = top(); if (!dialog) return;
      const items = targets(dialog); const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { observer.disconnect(); document.removeEventListener("keydown", key, true); document.body.style.overflow = oldOverflow; if (previous?.isConnected) previous.focus(); };
  }, [open]);
}

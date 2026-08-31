"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A rede de segurança da aplicação.
 *
 * Sem isto, qualquer exceção durante a renderização faz o React desmontar a
 * árvore inteira: a pessoa vê uma tela branca, sem mensagem, sem botão, sem
 * ideia do que fazer. Foi o que aconteceu na oficina.
 *
 * A causa mais comum não é nem um bug de lógica: é o app ficar aberto no
 * celular enquanto uma versão nova é publicada. A página velha continua
 * pedindo pedaços de tela com o nome antigo ("...-D2cwv3J_.js"), que já não
 * existem no servidor, e o import falha. Como esse caso se resolve sozinho
 * recarregando, é o que fazemos — uma vez só, para nunca entrar em laço.
 */

const RELOAD_MARK = "picapau:recarregou-por-versao";

/** O erro é de pedaço de tela que sumiu (versão nova publicada)? */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(message);
}

type Props = { children: ReactNode; area?: string };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Falha em ${this.props.area ?? "tela"}:`, error, info.componentStack);

    if (isStaleChunkError(error)) {
      let jaTentou = false;
      // sessionStorage pode estar bloqueado (janela anônima, navegador
      // restrito). Se estiver, mostramos a mensagem em vez de recarregar às
      // cegas — recarregar sem poder marcar a tentativa vira laço infinito.
      try {
        jaTentou = window.sessionStorage.getItem(RELOAD_MARK) === "1";
        if (!jaTentou) window.sessionStorage.setItem(RELOAD_MARK, "1");
      } catch {
        jaTentou = true;
      }
      if (!jaTentou) window.location.reload();
    }
  }

  private recarregar = () => {
    try { window.sessionStorage.removeItem(RELOAD_MARK); } catch { /* segue mesmo assim */ }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const versaoNova = isStaleChunkError(error);
    return (
      <div className="panel module-panel" role="alert">
        <div className="pdv-empty">
          <span>!</span>
          <strong>{versaoNova ? "Saiu uma versão nova do sistema" : "Esta tela não conseguiu abrir"}</strong>
          <p>
            {versaoNova
              ? "Toque em recarregar para pegar a versão atualizada. Nada do que você salvou foi perdido."
              : `Nada foi perdido — o resto do sistema continua funcionando. Se acontecer de novo, avise o administrador${this.props.area ? ` e diga que foi em "${this.props.area}"` : ""}.`}
          </p>
          <button className="primary-button" onClick={this.recarregar}>Recarregar</button>
        </div>
      </div>
    );
  }
}

/**
 * Limpa a marca de recarregamento depois que a aplicação abre inteira.
 *
 * Sem isto, a marca ficaria da sessão toda e um segundo deploy no mesmo dia
 * mostraria a mensagem em vez de resolver sozinho.
 */
export function clearReloadMark() {
  try { window.sessionStorage.removeItem(RELOAD_MARK); } catch { /* sem problema */ }
}

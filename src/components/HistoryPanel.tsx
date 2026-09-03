/**
 * O histórico de atendimento, do jeito que a oficina pergunta.
 *
 * Mesma tela em dois lugares — na OS, atrás do "Ver histórico", e na aba de
 * Clientes — porque a pergunta é a mesma nos dois: o que já foi feito nessa
 * moto, quando, e quanto ficou.
 */
import type { HistorySummary } from "../history";

const emReais = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function HistoryPanel({ historico, vazio }: { historico: HistorySummary; vazio: string }) {
  if (!historico.entries.length) {
    return <div className="history-empty"><span>{vazio}</span></div>;
  }
  return (
    <div className="history-panel">
      <div className="history-summary">
        <article><span>Atendimentos</span><strong>{historico.visits}</strong></article>
        <article><span>Já gastou</span><strong>{emReais(historico.totalSpent)}</strong></article>
        <article><span>Última visita</span><strong>{historico.lastVisit || "—"}</strong></article>
      </div>
      <div className="history-rows">
        {historico.entries.map((entrada) => (
          <div className={`history-row ${entrada.closed ? "" : "aberta"}`} key={entrada.id}>
            <span className="history-date">{entrada.date}</span>
            <div>
              <strong>{entrada.services}</strong>
              <small>{[entrada.bike, entrada.plate].filter(Boolean).join(" · ") || "Moto não informada"}</small>
            </div>
            <span className="history-total">{emReais(entrada.total)}</span>
            <span className={`history-badge ${entrada.closed ? "ok" : ""}`}>{entrada.closed ? "Entregue" : entrada.status || "Em aberto"}</span>
          </div>
        ))}
      </div>
      {/* O que ainda está na bancada pode mudar de valor até a entrega: somar
          isso no "já gastou" mentiria sobre o cliente. */}
      {historico.entries.some((entrada) => !entrada.closed)
        ? <small className="history-note">O total considera só as OS já entregues.</small>
        : null}
    </div>
  );
}

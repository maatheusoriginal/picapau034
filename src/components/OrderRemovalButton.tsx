import { useState } from "react";
import { deleteOrderWithStock } from "../../app/firebase/client";
import {
  decidirExclusaoDaOS,
  registroDaExclusao,
  rotuloDaExclusao,
  tituloDaExclusao,
} from "../order-removal";
import type { OrderRecord } from "../types";

/**
 * O botão de apagar uma OS, com a confirmação que diz o que vai acontecer.
 *
 * Apagar OS acontece e é legítimo: aberta em duplicidade, aberta na moto
 * errada, cliente que desistiu antes de a moto entrar na bancada. Sem o botão,
 * a oficina convivia com OS fantasma na fila — e fila com lixo é fila que
 * ninguém confia.
 *
 * A confirmação não é um "Tem certeza?" genérico. Ela diz quantas peças voltam
 * para a prateleira, ou por que aquela OS não pode ser apagada — a decisão é de
 * src/order-removal.ts, conferida por `npm run check:order-removal`.
 */
export function OrderRemovalButton({ order, podeApagar, actor, notify, onRemoved }: {
  order: OrderRecord;
  /** Falso para quem só consulta: o botão nem aparece. */
  podeApagar: boolean;
  actor: { uid: string; name: string };
  notify: (mensagem: string) => void;
  onRemoved: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  if (!podeApagar || !order?.id) return null;

  const decisao = decidirExclusaoDaOS(order);

  const confirmar = async () => {
    if (decisao.modo === "bloqueado") return setAberto(false);
    setGravando(true);
    setErro("");
    try {
      await deleteOrderWithStock(order.id, registroDaExclusao(order, actor) as unknown as Record<string, unknown>);
      setAberto(false);
      notify(decisao.pecasDevolvidas
        ? `${order.id} apagada e ${decisao.pecasDevolvidas === 1 ? "1 peça devolvida" : `${decisao.pecasDevolvidas} peças devolvidas`} ao estoque.`
        : `${order.id} apagada.`);
      onRemoved();
    } catch (falha) {
      // A trava de OS encerrada também vale dentro da transação: entre abrir a
      // OS e clicar aqui, alguém pode tê-la recebido no balcão.
      setErro(falha instanceof Error ? falha.message : "Não foi possível apagar a OS. Tente de novo.");
    } finally {
      setGravando(false);
    }
  };

  return (
    <>
      <button type="button" className="removal-trigger" onClick={() => { setErro(""); setAberto(true); }}>Apagar OS</button>
      {aberto ? (
        <div className="removal-layer" role="dialog" aria-modal="true" aria-label="Confirmar exclusão da OS">
          <div className="removal-box">
            <h3>{tituloDaExclusao(decisao)}</h3>
            <p>{decisao.motivo}</p>
            {decisao.saida ? <p className="removal-exit">{decisao.saida}</p> : null}
            {erro ? <p className="removal-error" role="alert">{erro}</p> : null}
            <div className="removal-actions">
              {decisao.modo === "apagar" ? (
                <button type="button" className="ghost-button" disabled={gravando} onClick={() => setAberto(false)}>Cancelar</button>
              ) : null}
              <button
                type="button"
                className={decisao.modo === "apagar" ? "danger-button" : "primary-button"}
                disabled={gravando}
                onClick={() => void confirmar()}
              >
                {gravando ? "Apagando..." : rotuloDaExclusao(decisao)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

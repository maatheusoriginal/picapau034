/**
 * O quadro das Ordens de serviço: uma coluna por etapa.
 *
 * A oficina não abre esta tela para LER uma OS — abre para saber em que pé
 * está cada moto que está lá dentro. Uma lista responde isso contando linha por
 * linha; a coluna responde de relance, e mover a moto de etapa vira arrastar o
 * card, que é a distância mais curta entre "já passou para a bancada" e o
 * sistema saber disso.
 *
 * NO COMPUTADOR e NO CELULAR o mesmo quadro é outra coisa.
 *
 * Seis colunas lado a lado num celular seriam seis tiras de dois centímetros:
 * cabe, e não se usa. No telefone as etapas viram uma régua de pílulas com a
 * contagem — a mesma ideia, uma etapa por vez, o polegar rolando os cards de
 * cima para baixo em vez de caçar coluna para o lado. Quem escolhe qual dos
 * dois é a largura da tela, pelo CSS: a pílula existe sempre e só aparece onde
 * faz falta, então não há detecção de tamanho em JavaScript para errar.
 *
 * ARRASTAR É SÓ NO COMPUTADOR, e de propósito. Arrastar com o dedo briga com
 * rolar a tela — o mecânico ia mover OS sem querer toda vez que passasse o
 * polegar. No celular a etapa se muda abrindo a OS, que é onde ele já está.
 *
 * O ARRASTAR É FEITO NO PONTEIRO, e não com o drag-and-drop do HTML.
 *
 * A primeira versão usava o arrastar nativo (draggable + dragstart/drop). Ele
 * é menos código e deveria bastar — só que o navegador do roteiro de teste não
 * dispara `dragstart` de jeito nenhum, nem pelo mouse passo a passo nem pelo
 * método próprio do Playwright: só chegam `pointerdown` e `mousedown`. Ou seja,
 * o arrastar mais curto de escrever é também o que NINGUÉM consegue provar que
 * funciona antes de a oficina tentar. Trocado por ponteiro, o mesmo gesto do
 * mouse continua igual para quem usa e passa a ser conferível no roteiro.
 *
 * Dois detalhes que o ponteiro exige e o nativo dava de graça:
 *
 * 1. só vira arrasto depois de o ponteiro ANDAR alguns pixels — senão um
 *    clique comum, e principalmente o duplo clique que abre a OS, viraria um
 *    arrasto de zero pixel e a OS não abriria;
 * 2. o card em movimento fica invisível ao ponteiro, senão a coluna debaixo do
 *    cursor seria sempre a de origem, que é onde o card ainda está.
 */
import { useRef, useState } from "react";
import type { OpenDialog, OrderRecord, ServiceOrderStatus } from "../types";
import { serviceOrderStatuses, statusTone } from "../types";
import { money, orderIsLate, shortDate } from "../workspace";
import { Icon } from "./WorkshopIcon";

export function OrdersBoard({ orders, canMove, onMove, openDialog, onShowDelivered, entregues }: {
  /** Só as abertas entram no quadro; a entregue saiu da oficina. */
  orders: OrderRecord[];
  canMove: boolean;
  onMove?: (order: OrderRecord, status: ServiceOrderStatus) => void | Promise<void>;
  openDialog: OpenDialog;
  onShowDelivered: () => void;
  entregues: number;
}) {
  /** A OS que está na mão agora. Guardar o objeto evita procurar de novo no solto. */
  const [arrastando, setArrastando] = useState<OrderRecord | null>(null);
  /** A coluna sob o cursor, só para a pessoa ver onde vai cair. */
  const [alvo, setAlvo] = useState<ServiceOrderStatus | "">("");
  /** A etapa visível no celular. No computador não muda nada: todas aparecem. */
  const [etapaNoCelular, setEtapaNoCelular] = useState<ServiceOrderStatus>(serviceOrderStatuses[0]);
  /** Onde o ponteiro encostou e em qual OS. Não é estado: não redesenha nada. */
  const partida = useRef<{ x: number; y: number; order: OrderRecord; ponteiro: number } | null>(null);

  const abertas = orders.filter((order) => !order.closed);
  const daEtapa = (status: ServiceOrderStatus) => abertas.filter((order) => order.status === status);

  const aoApertar = (evento: React.PointerEvent<HTMLElement>, order: OrderRecord) => {
    // Só o mouse arrasta. No toque o gesto é rolar a tela, e disputar com ele
    // faria o mecânico mover OS sem querer.
    if (!canMove || evento.pointerType !== "mouse" || evento.button !== 0) return;
    // Apertar em cima do botão é clicar no botão, não pegar o card.
    if ((evento.target as HTMLElement).closest("button")) return;
    partida.current = { x: evento.clientX, y: evento.clientY, order, ponteiro: evento.pointerId };
  };

  const aoMover = (evento: React.PointerEvent<HTMLDivElement>) => {
    const inicio = partida.current;
    if (!inicio) return;
    if (!arrastando) {
      // O limiar: sem ele, o duplo clique que abre a OS seria um arrasto de
      // zero pixel e a OS não abriria mais.
      if (Math.abs(evento.clientX - inicio.x) + Math.abs(evento.clientY - inicio.y) < 6) return;
      setArrastando(inicio.order);
      try { evento.currentTarget.setPointerCapture(inicio.ponteiro); } catch { /* ponteiro já solto */ }
    }
    const sob = document.elementFromPoint(evento.clientX, evento.clientY);
    const coluna = sob?.closest<HTMLElement>(".order-board-column");
    setAlvo((coluna?.dataset.status as ServiceOrderStatus) ?? "");
  };

  const aoSoltar = (evento: React.PointerEvent<HTMLDivElement>) => {
    const inicio = partida.current;
    const order = arrastando;
    const destino = alvo;
    partida.current = null;
    setArrastando(null);
    setAlvo("");
    if (inicio) { try { evento.currentTarget.releasePointerCapture(inicio.ponteiro); } catch { /* já solto */ } }
    if (!order || !onMove || !destino || destino === order.status) return;
    void onMove(order, destino);
  };

  return <div className="order-board-wrap">
    {/* A régua de etapas do celular. Escondida no computador pelo CSS. */}
    <div className="board-stage-pills" role="tablist" aria-label="Etapa da oficina">
      {serviceOrderStatuses.map((status) => (
        <button key={status} role="tab" aria-selected={etapaNoCelular === status} className={etapaNoCelular === status ? "selected" : ""} onClick={() => setEtapaNoCelular(status)}>
          {status}<b>{daEtapa(status).length}</b>
        </button>
      ))}
    </div>

    <div
      className="order-board"
      data-etapa={etapaNoCelular}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
    >
      {serviceOrderStatuses.map((status) => {
        const doStatus = daEtapa(status);
        return <section
          key={status}
          className={`order-board-column ${alvo === status && arrastando ? "is-target" : ""}`}
          data-status={status}
        >
          <header className={`stage-${statusTone(status)}`}><span>{status}</span><b>{doStatus.length}</b></header>
          <div className="order-board-cards">
            {doStatus.length ? doStatus.map((order) => (
              <article
                key={order.id}
                className={`board-card ${canMove ? "can-drag" : ""} ${orderIsLate(order) ? "is-late" : ""} ${arrastando?.id === order.id ? "is-dragging" : ""}`}
                onPointerDown={(evento) => aoApertar(evento, order)}
                onDoubleClick={() => openDialog("order", order.id)}
                title={canMove ? "Arraste para outra etapa. Dois cliques abrem a OS." : "Dois cliques abrem a OS."}
              >
                <header><strong>{order.customer || "Cliente a identificar"}</strong><span className="order-number">{order.id}</span></header>
                <p className="board-card-bike">{order.bike || "Moto não informada"}</p>
                <p className="board-card-plate">{order.plate || "Sem placa"}</p>
                <footer>
                  <span className="board-card-who"><i>{(order.mechanic || "?")[0]}</i>{order.mechanic || "Sem mecânico"}</span>
                  <span className={orderIsLate(order) ? "board-card-late" : "board-card-due"}>{orderIsLate(order) ? "Atrasada" : shortDate(order.delivery) || "Sem previsão"}</span>
                </footer>
                {order.total != null ? <b className="board-card-total">{money(order.total)}</b> : null}
                <button className="board-card-open" onClick={() => openDialog("order", order.id)} onDoubleClick={(event) => event.stopPropagation()}>Abrir OS <Icon name="arrow" size={15}/></button>
              </article>
            )) : <p className="order-board-empty">{canMove ? "Arraste uma OS para cá." : "Nenhuma OS nesta etapa."}</p>}
          </div>
        </section>;
      })}
    </div>

    <footer className="order-board-foot">
      <span>{abertas.length} OS na oficina{canMove ? " · arraste o card para mudar a etapa" : ""}</span>
      {entregues ? <button className="text-button" onClick={onShowDelivered}>Ver {entregues} entregue(s)</button> : null}
    </footer>
  </div>;
}

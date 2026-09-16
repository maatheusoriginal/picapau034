import { useMemo, useState } from "react";
import type { OpenDialog, OrderRecord, ServiceOrderStatus } from "../types";
import { serviceOrderStatuses, statusTone } from "../types";
import { matchesSearch, money, orderAttention, orderIsLate, orderMatchesFilter, shortDate, sortOrders } from "../workspace";
import { Icon } from "./WorkshopIcon";
import { OrdersBoard } from "./OrdersBoard";

export function OrdersWorkspace({ orders, budget, canCreate, canTakePart, openDialog, initialFilter, canMove, onMove }: {
  orders: OrderRecord[];
  budget: boolean;
  canCreate: boolean;
  canTakePart: boolean;
  openDialog: OpenDialog;
  initialFilter?: string;
  /** Quem pode mover a OS de etapa arrastando o card. */
  canMove?: boolean;
  onMove?: (order: OrderRecord, status: ServiceOrderStatus) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initialFilter || "Em aberto");
  /*
    O quadro é a visão de abertura.

    A oficina não olha a lista de OS para ler uma OS: olha para saber em que pé
    está cada moto que está lá dentro. A coluna responde isso de relance, e
    arrastar o card é a forma mais curta de dizer "essa aí já passou para a
    bancada". Cartões e Lista continuam existindo para quem quer procurar uma
    OS específica, inclusive as já entregues.

    Quem chega com um RECORTE na mão cai na lista, não no quadro: "prontas para
    retirar" e "aguardando aprovação" são perguntas sobre um pedaço, e o quadro
    responde outra coisa — mostra tudo. Já "Em aberto", que é o "ver oficina" do
    painel, é exatamente o que o quadro mostra, então abre no quadro. Sem essa
    distinção a tela abria em Cartões vindo do painel e o quadro só aparecia
    para quem clicasse nele, que é o contrário do combinado.
  */
  const [view, setView] = useState<"board" | "cards" | "list">(!initialFilter || initialFilter === "Em aberto" ? "board" : "cards");
  const [limit, setLimit] = useState(30);
  const buscados = useMemo(() => orders.filter((order) => matchesSearch(query, order.id, order.customer, order.bike, order.plate, order.mechanic, order.problem)), [orders, query]);
  const filtered = useMemo(() => sortOrders(buscados.filter((order) => orderMatchesFilter(order, filter))), [buscados, filter]);
  const active = orders.filter((order) => !order.closed);
  const pickFilter = (value: string) => { setFilter(value); setLimit(30); if (view === "board") setView("cards"); };
  const abrirEntregues = () => { setView("list"); setFilter("Entregues"); setLimit(30); };

  const cartao = (order: OrderRecord) => <article className={`work-order-card ${orderIsLate(order) ? "is-late" : ""}`} key={order.id} onDoubleClick={() => openDialog("order", order.id)} title="Dois cliques abrem a OS">
    <header><span className="order-number">{order.id}{order.partnerOrderId ? <em className="partner-order"> · {order.partnerName || "parceiro"} {order.partnerOrderId}</em> : null}</span><span className={`status ${order.closed ? "neutral" : statusTone(order.status)}`}><i/>{order.closed ? "Entregue" : order.status === "Entrega" ? "Pronta para retirar" : order.status}</span></header>
    <h2>{order.customer || "Cliente a identificar"}</h2>
    <p className="order-bike"><Icon name="bike" size={17}/>{order.bike || "Moto não informada"}<b className="plate">{order.plate || "Sem placa"}</b></p>
    <p className="order-description">{order.problem || order.service || "Abra a OS para conferir o atendimento."}</p>
    <div className="order-card-details"><span><small>Responsável</small><strong>{order.mechanic || "Não definido"}</strong></span><span><small>Previsão</small><strong className={orderIsLate(order) ? "danger-text" : ""}>{shortDate(order.delivery)}</strong></span></div>
    <footer><span>{orderAttention(order) || (order.total != null ? money(order.total) : "Atendimento em aberto")}</span><button className="outline-button" onClick={() => openDialog("order", order.id)} onDoubleClick={(event) => event.stopPropagation()}>Abrir OS <Icon name="arrow" size={16}/></button></footer>
  </article>;

  return <div className="orders-workspace">
    <div className="module-heading"><div><p>Oficina</p><h1>{budget ? "Orçamentos" : "Ordens de serviço"}</h1><span>{budget ? "Da avaliação até a aprovação do cliente." : "Cada moto, seu andamento e o próximo passo."}</span></div><div className="heading-actions">
      {/* "Pegar peça" existia SÓ na tela de quem tem o cargo Mecânico. Quem
          atende o balcão e o próprio dono não tinham como lançar uma peça na
          OS por aqui, mesmo tendo permissão de mexer na ordem — e uma oficina
          pequena é o dono que pega a peça na prateleira metade das vezes. */}
      {canTakePart && !budget && <button className="outline-button large" onClick={() => openDialog("takePart")}><Icon name="box" size={17}/>Pegar peça</button>}
      {canCreate && <button className="primary-button" onClick={() => openDialog(budget ? "os" : "osChoice")}><Icon name="plus" size={18}/>{budget ? "Novo orçamento" : "Novo atendimento"}</button>}
    </div></div>
    <div className="order-overview-strip"><button onClick={() => pickFilter("Em aberto")}><strong>{active.length}</strong><span>na oficina</span></button><button onClick={() => pickFilter("Atrasadas")} className="overdue-metric"><strong>{active.filter((order) => orderIsLate(order)).length}</strong><span>com prazo vencido</span></button><button onClick={() => pickFilter("Prontas")}><strong>{active.filter((order) => order.status === "Entrega").length}</strong><span>prontas para retirar</span></button></div>
    <section className="panel order-board-panel">
      <div className="list-toolbar">
        <label className="mini-search"><Icon name="search" size={18}/><input aria-label="Buscar atendimento" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30); }} placeholder="Cliente, placa, OS ou mecânico"/></label>
        <div className="view-switch" aria-label="Visualização">
          <button aria-pressed={view === "board"} onClick={() => setView("board")}>Quadro</button>
          <button aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cartões</button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</button>
        </div>
      </div>
      {view === "board" ? (
        <OrdersBoard orders={buscados} canMove={!!canMove && !!onMove} onMove={onMove} openDialog={openDialog} onShowDelivered={abrirEntregues} entregues={orders.filter((order) => order.closed).length}/>
      ) : <>
        <div className="order-status-filters" aria-label="Etapa da oficina">{["Em aberto", ...serviceOrderStatuses.filter((status) => status !== "Entrega"), "Prontas", "Entregues", "Todos"].map((status) => <button key={status} className={filter === status ? "selected" : ""} aria-pressed={filter === status} onClick={() => pickFilter(status)}>{status}<b>{orders.filter((order) => orderMatchesFilter(order, status)).length}</b></button>)}</div>
        {["Atenção", "Hoje", "Atrasadas"].includes(filter) && <div className="active-filter-banner"><span>Filtro: {filter === "Hoje" ? "Entrega prevista hoje" : filter}</span><button onClick={() => pickFilter("Em aberto")}>Remover filtro ×</button></div>}
        {!filtered.length ? <div className="workspace-empty"><span><Icon name="wrench" size={28}/></span><h3>{orders.length ? "Nenhum atendimento neste filtro" : "Tudo começa com a primeira OS"}</h3><p>{orders.length ? "Busque por outro termo ou escolha outra etapa." : "Cadastre a chegada da moto e acompanhe o serviço por aqui."}</p>{orders.length ? <button className="outline-button" onClick={() => { setQuery(""); pickFilter("Todos"); }}>Limpar filtros</button> : canCreate && <button className="primary-button" onClick={() => openDialog("osChoice")}>Abrir atendimento</button>}</div>
          : view === "cards" ? <div className="order-card-grid">{filtered.slice(0, limit).map(cartao)}</div>
          : <div className="table-scroll"><table><thead><tr><th>OS / Cliente</th><th>Motocicleta</th><th className="col-secondary">Responsável</th><th className="col-secondary">Previsão</th><th>Situação</th><th/></tr></thead><tbody>{filtered.slice(0, limit).map((order) => <tr key={order.id} onDoubleClick={() => openDialog("order", order.id)} title="Dois cliques abrem a OS"><td><strong className="order-id">{order.id}</strong><span>{order.customer}{order.partnerOrderId ? ` · OS ${order.partnerName || "parceiro"} ${order.partnerOrderId}` : ""}</span></td><td><strong>{order.plate || "Sem placa"}</strong><span>{order.bike}</span></td><td className="col-secondary">{order.mechanic || "Não definido"}</td><td className={`col-secondary ${orderIsLate(order) ? "danger-text" : ""}`}>{shortDate(order.delivery)}</td><td><span className={`status ${order.closed ? "neutral" : statusTone(order.status)}`}><i/>{order.closed ? "Entregue" : order.status === "Entrega" ? "Pronta" : order.status}</span></td><td><button className="outline-button" onClick={() => openDialog("order", order.id)} onDoubleClick={(event) => event.stopPropagation()}>Abrir</button></td></tr>)}</tbody></table></div>}
        {!!filtered.length && <footer className="queue-footer"><span>{Math.min(limit, filtered.length)} de {filtered.length} atendimento(s)</span>{filtered.length > limit && <button className="outline-button" onClick={() => setLimit((value) => value + 30)}>Carregar mais</button>}</footer>}
      </>}
    </section>
  </div>;
}

import { useMemo, useState } from "react";
import type { CashSession, FirebasePermission, OpenDialog, OrderRecord, ProductRecord } from "../types";
import { statusTone } from "../types";
import type { financeSummary } from "../finance";
import { lowStock, money, orderAttention, orderMatchesFilter, shortDate, sortOrders } from "../workspace";
import { sessionIsStale } from "../cash";
import { Icon } from "./WorkshopIcon";

type Props = {
  name: string; orders: OrderRecord[]; products: ProductRecord[];
  summary: ReturnType<typeof financeSummary>; cash?: CashSession; drawer: number;
  can: (permission: FirebasePermission) => boolean;
  navigate: (destination: string, filter?: string) => void; openDialog: OpenDialog;
};

export function OperationsOverview({ name, orders, products, summary, cash, drawer, can, navigate, openDialog }: Props) {
  const [queue, setQueue] = useState("Atenção");
  const current = orders.filter((order) => !order.closed);
  const attention = current.filter((order) => orderAttention(order));
  const critical = products.filter(lowStock);
  const queueOrders = useMemo(() => sortOrders(orders.filter((order) => orderMatchesFilter(order, queue))).slice(0, 6), [orders, queue]);
  const create = can("orders.create");
  const finance = can("finance.view");
  return <div className="operations-overview">
    <div className="day-heading">
      <div><p className="eyebrow">{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>Seu dia na oficina.</h1><span>Olá, {name.split(" ")[0]}. {attention.length ? `${attention.length} atendimento${attention.length > 1 ? "s precisam" : " precisa"} de atenção.` : "Vamos cuidar dos próximos atendimentos."}</span></div>
      {(finance || can("pos.use")) && <button className={`cash-status-card ${cash ? "is-open" : "is-closed"}`} onClick={() => openDialog("cash")}><span className="cash-status-icon"><Icon name="wallet"/></span><span><strong>{cash ? sessionIsStale(cash) ? "Conferir caixa anterior" : "Caixa aberto" : "Caixa fechado"}</strong><small>{cash ? finance ? `${money(drawer)} em dinheiro` : `Aberto em ${cash.openedDate}` : "Abra o caixa para começar"}</small></span><Icon name="arrow" size={18}/></button>}
    </div>
    <section className="action-strip" aria-label="Começar atendimento">
      {create && <button className="action-tile main-action" onClick={() => openDialog("osChoice")}><Icon name="plus" size={22}/><span><strong>Novo atendimento</strong><small>Moto na oficina ou serviço na hora</small></span><Icon name="arrow" size={18}/></button>}
      {can("pos.use") && <button className="action-tile" onClick={() => navigate("PDV Balcão")}><Icon name="wallet"/><span><strong>Vender no balcão</strong><small>Peças e pagamento</small></span></button>}
      {can("inventory.manage") && <button className="action-tile" onClick={() => openDialog("purchase")}><Icon name="box"/><span><strong>Receber peças</strong><small>Entrada no estoque</small></span></button>}
      {can("finance.manage") && <button className="action-tile" onClick={() => openDialog("expense")}><Icon name="file"/><span><strong>Lançar gasto</strong><small>Pagar agora ou agendar</small></span></button>}
      {!create && can("quickService.use") && <button className="action-tile main-action" onClick={() => openDialog("quick")}><Icon name="clock"/><span><strong>Serviço rápido</strong><small>Atender e receber</small></span></button>}
    </section>
    <section className="day-metrics" aria-label="Resumo do dia">
      {can("orders.view") && <>
        <button onClick={() => navigate("Ordens de serviço", "Em aberto")}><span>Motos na oficina</span><strong>{current.length.toString().padStart(2, "0")}</strong><small>Atendimentos em aberto</small><Icon name="bike"/></button>
        <button onClick={() => navigate("Ordens de serviço", "Aprovação")}><span>Aguardando aprovação</span><strong>{current.filter((order) => order.status === "Aprovação").length.toString().padStart(2, "0")}</strong><small>Retornar ao cliente</small><Icon name="clock"/></button>
        <button onClick={() => navigate("Ordens de serviço", "Prontas")}><span>Prontas para retirar</span><strong>{current.filter((order) => order.status === "Entrega").length.toString().padStart(2, "0")}</strong><small>Combinar a entrega</small><Icon name="check"/></button>
      </>}
      {finance && <button className="metric-revenue" onClick={() => navigate("Financeiro")}><span>Recebido hoje</span><strong>{money(summary.receivedToday)}</strong><small>{summary.salesTodayCount} movimentações no dia</small><Icon name="wallet"/></button>}
    </section>
    <div className="day-grid">
      {can("orders.view") && <section className="panel work-queue">
        <header className="panel-header"><div><h2>Próximas ações</h2><p>Abra o atendimento para continuar.</p></div><button className="text-button" onClick={() => navigate("Ordens de serviço", "Em aberto")}>Ver oficina <Icon name="arrow" size={16}/></button></header>
        <div className="queue-tabs" aria-label="Filtrar próximos atendimentos">{["Atenção", "Hoje", "Em aberto"].map((tab) => <button key={tab} aria-pressed={queue === tab} className={queue === tab ? "selected" : ""} onClick={() => setQueue(tab)}>{tab === "Hoje" ? "Entrega hoje" : tab}{tab === "Atenção" && <b>{attention.length}</b>}</button>)}</div>
        <div className="queue-items">{queueOrders.length ? queueOrders.map((order) => <button key={order.id} className="queue-row" onClick={() => openDialog("order", order.id)}>
          <span className={`queue-marker ${statusTone(order.status)}`}><Icon name={order.status === "Entrega" ? "check" : "wrench"}/></span>
          <span className="queue-person"><span className="queue-code">{order.id} <b>{order.plate || "Sem placa"}</b></span><strong>{order.customer || "Cliente a identificar"}</strong><small>{order.bike} · {order.mechanic || "Sem mecânico"}</small></span>
          <span className="queue-progress"><span className={`status ${statusTone(order.status)}`}><i/>{order.status === "Entrega" ? "Pronta" : order.status}</span><small>{orderAttention(order) || shortDate(order.delivery)}</small></span><Icon name="arrow" size={18}/>
        </button>) : <div className="workspace-empty"><span><Icon name={queue === "Atenção" ? "check" : "wrench"} size={28}/></span><h3>{queue === "Atenção" ? "Tudo em dia por aqui" : queue === "Hoje" ? "Sem entrega prevista hoje" : "A oficina está livre"}</h3><p>{queue === "Atenção" ? "Aprovações, atrasos e retiradas aparecem aqui." : "Os atendimentos aparecem assim que a OS é aberta."}</p>{queue !== "Em aberto" ? <button className="outline-button" onClick={() => setQueue("Em aberto")}>Ver atendimentos abertos</button> : create ? <button className="primary-button" onClick={() => openDialog("osChoice")}>Novo atendimento</button> : null}</div>}</div>
        {!!queueOrders.length && <footer className="queue-footer"><span>Exibindo {queueOrders.length} atendimento(s)</span><button className="text-button" onClick={() => navigate("Ordens de serviço", queue)}>Abrir lista completa <Icon name="arrow" size={16}/></button></footer>}
      </section>}
      <aside className="day-aside">
        {finance && <section className="panel money-overview"><header><span className="eyebrow">Financeiro</span><h2>Contas da oficina</h2></header><button onClick={() => navigate("Contas a receber")}><span><i className="balance-dot green"/>A receber</span><strong>{money(summary.receivableTotal)}</strong><Icon name="arrow" size={15}/></button><button onClick={() => navigate("Contas a pagar")}><span><i className="balance-dot red"/>A pagar</span><strong>{money(summary.pendingExpenses)}</strong><Icon name="arrow" size={15}/></button>{summary.overdueCount > 0 && <div className="inline-alert"><Icon name="alert" size={16}/><span>{summary.overdueCount} conta(s) vencida(s): {money(summary.overdueExpenses)}</span></div>}<button className="money-report" onClick={() => navigate("Relatórios")}>Ver resultado do período <Icon name="chart" size={16}/></button></section>}
        {can("inventory.view") && <section className="panel replenishment"><header><div><span className="eyebrow">Estoque</span><h2>Hora de repor</h2></div><b className={critical.length ? "count-warning" : "count-neutral"}>{critical.length}</b></header>{critical.length ? critical.sort((a,b) => a.stock - b.stock).slice(0, 3).map((product) => <div className="replenishment-row" key={product.id}><span><strong>{product.name}</strong><small>{product.location || product.code}</small></span><b>{product.stock} <small>{product.unit || "UN"}</small></b></div>) : <p className="quiet-note">Nenhum produto com alerta de reposição.</p>}<button className="text-button" onClick={() => navigate("Produtos e estoque", "Reposição")}>Consultar estoque <Icon name="arrow" size={16}/></button></section>}
      </aside>
    </div>
  </div>;
}

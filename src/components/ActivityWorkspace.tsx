import { useMemo, useState } from "react";
import type { OpenDialog, SaleRecord, SettingsConfig, StockEntryRecord } from "../types";
import { calendarDay, matchesSearch, money, todayKey } from "../workspace";
import { paymentsOf, settledTotal } from "../finance";
import { buildSaleDocument } from "../documents";
import { printDocument } from "../../app/printing";
import { downloadFile } from "../../app/download";
import { itemQuantity, itemUnitPrice } from "../order-items";
import { Icon } from "./WorkshopIcon";

type Props = { mode: "sales" | "purchases"; sales: SaleRecord[]; entries: StockEntryRecord[]; openDialog: OpenDialog; navigate: (destination: string) => void; canOperate: boolean; settings: Partial<SettingsConfig> | null; notify: (message: string) => void };

export function ActivityWorkspace({ mode, sales, entries, openDialog, navigate, canOperate, settings, notify }: Props) {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("Mês atual");
  const [expanded, setExpanded] = useState("");
  const [limit, setLimit] = useState(30);
  const purchase = mode === "purchases";
  const rows = useMemo(() => {
    const today = todayKey();
    const records = purchase ? entries.map((entry) => ({ id: entry.id, person: entry.supplierName || "Fornecedor não informado", date: entry.date, at: entry.entryAt, total: entry.total, method: entry.payment, origin: "Entrada de estoque", operator: entry.operatorName, items: entry.items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unitCost, total: item.total })), received: 0, sale: null as SaleRecord | null })) : sales.map((sale) => ({ id: sale.id, person: sale.customer || "Consumidor final", date: sale.date, at: sale.soldAt, total: sale.total, method: paymentsOf(sale).map((payment) => payment.method).join(" + "), origin: sale.origin, operator: sale.operatorName, items: (sale.items ?? []).map((item) => ({ name: item.name, quantity: itemQuantity(item), unit: itemUnitPrice(item), total: item.price })), received: settledTotal(paymentsOf(sale)), sale }));
    return records.filter((record) => {
      const day = calendarDay(record.date) || calendarDay(record.at);
      return (period === "Todos" || (period === "Hoje" ? day === today : day.slice(0, 7) === today.slice(0, 7))) && matchesSearch(query, record.id, record.person, record.method, record.operator, ...record.items.map((item) => item.name));
    }).sort((a, b) => b.at.localeCompare(a.at));
  }, [entries, sales, query, period, purchase]);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const exportCsv = () => {
    const cell = (value: unknown) => '"' + String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
    const csv = [["Código", "Data", purchase ? "Fornecedor" : "Cliente", "Origem", "Forma", "Valor", "Operador"], ...rows.map((row) => [row.id, row.date, row.person, row.origin, row.method, row.total.toFixed(2).replace(".", ","), row.operator || ""])].map((line) => line.map(cell).join(";")).join("\r\n");
    downloadFile(`${purchase ? "compras" : "vendas"}-${todayKey()}.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
    notify("Planilha do período preparada.");
  };
  return <div className="activity-workspace"><div className="module-heading"><div><p>{purchase ? "Reposição" : "Balcão"}</p><h1>{purchase ? "Compras e entradas" : "Histórico de vendas"}</h1><span>{purchase ? "Tudo que entrou no estoque, com custo e fornecedor." : "Consulte os itens, o pagamento e reimprima o comprovante."}</span></div><div className="heading-actions"><button className="outline-button" disabled={!rows.length} onClick={exportCsv}>Exportar CSV</button>{canOperate && <button className="primary-button" onClick={() => purchase ? openDialog("purchase") : navigate("PDV Balcão")}><Icon name="plus" size={18}/>{purchase ? "Nova entrada" : "Nova venda"}</button>}</div></div>
    <div className="module-summary"><article><span>{purchase ? "Entradas" : "Vendas"} no período</span><strong>{rows.length}</strong><small>{period}</small></article><article><span>{purchase ? "Valor comprado" : "Valor vendido"}</span><strong>{money(total)}</strong><small>Somente os registros filtrados</small></article><article><span>{purchase ? "Unidades recebidas" : "Recebido na venda"}</span><strong>{purchase ? rows.reduce((sum, row) => sum + row.items.reduce((count, item) => count + item.quantity, 0), 0).toLocaleString("pt-BR") : money(rows.reduce((sum, row) => sum + row.received, 0))}</strong><small>{purchase ? "Soma das quantidades" : "PIX, dinheiro e cartão; exclui a prazo e trocas"}</small></article></div>
    <section className="panel"><div className="list-toolbar"><label className="mini-search"><Icon name="search" size={17}/><input aria-label={purchase ? "Buscar compra" : "Buscar venda"} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30); }} placeholder={purchase ? "Fornecedor, peça ou código da entrada" : "Cliente, peça ou código da venda"}/></label><div className="filter-pills">{["Hoje", "Mês atual", "Todos"].map((label) => <button key={label} aria-pressed={period === label} className={period === label ? "selected" : ""} onClick={() => { setPeriod(label); setLimit(30); }}>{label}</button>)}</div></div>
      {rows.length ? rows.slice(0, limit).map((row) => <article className="activity-record" key={row.id}><button className="activity-row" onClick={() => setExpanded(expanded === row.id ? "" : row.id)} aria-expanded={expanded === row.id}><span className="activity-record-icon"><Icon name={purchase ? "box" : "wallet"}/></span><span className="activity-person"><small>{row.id} · {row.date} · {row.origin}</small><strong>{row.person}</strong><span>{row.items.length} item(ns) · {row.method || "Forma não informada"}</span></span><strong className="activity-total">{money(row.total)}</strong><span>{expanded === row.id ? "−" : "+"}</span></button>{expanded === row.id && <div className="activity-details"><div className="table-scroll"><table><thead><tr><th>Item</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>{row.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.unit)}</td><td>{money(item.total)}</td></tr>)}</tbody></table></div>{row.sale?.discount ? <p>Desconto: {money(row.sale.discount)}</p> : null}{row.sale && <div className="sale-payment-lines">{paymentsOf(row.sale).map((part, index) => <span key={index}>{part.method}: <strong>{money(part.amount)}</strong></span>)}</div>}<footer><span>Registrado por {row.operator || "operador não informado"}</span>{row.sale && <button className="outline-button" onClick={() => { printDocument(buildSaleDocument(row.sale!, settings)); }}><Icon name="printer" size={16}/>Reimprimir comprovante</button>}</footer></div>}</article>) : <div className="workspace-empty"><span><Icon name={purchase ? "box" : "wallet"} size={28}/></span><h3>Nenhum registro neste período</h3><p>{purchase ? "As entradas confirmadas aparecem aqui automaticamente." : "As vendas concluídas no balcão e os serviços rápidos aparecem aqui."}</p><button className="outline-button" onClick={() => { setPeriod("Todos"); setQuery(""); }}>Ver todo o histórico</button></div>}
      {!!rows.length && <footer className="queue-footer"><span>{Math.min(rows.length, limit)} de {rows.length} registro(s)</span>{rows.length > limit && <button className="outline-button" onClick={() => setLimit((value) => value + 30)}>Carregar mais</button>}</footer>}
    </section>
  </div>;
}

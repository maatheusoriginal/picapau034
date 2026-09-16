import { useMemo, useState } from "react";
import { buildOrderDocument, buildSaleDocument, copiesToPrint, orderFromQuickService } from "../documents";
import { printDocument } from "../../app/printing";
import {
  filterLedger,
  generalLedger,
  ledgerKinds,
  ledgerPeriods,
  ledgerTotals,
  type LedgerKind,
  type LedgerPeriod,
} from "../ledger";
import { money } from "../workspace";
import type { OpenDialog, OrderRecord, SaleRecord, SettingsConfig } from "../types";
import { PrintCopiesMenu } from "./PrintCopiesMenu";
import { Icon } from "./WorkshopIcon";

/**
 * O histórico geral: tudo o que passou pela oficina, em uma lista só.
 *
 * Os registros existiam, mas espalhados — OS encerrada na tela da oficina,
 * venda do balcão numa aba, serviço rápido em outra. A pergunta do fim do dia
 * é uma só ("o que passou por aqui?") e exigia abrir três telas e somar de
 * cabeça.
 *
 * As contas ficam em src/ledger.ts, conferidas por `npm run check:ledger`.
 * Aqui é só a tela.
 */
export function LedgerWorkspace({ orders, sales, settings, openDialog }: {
  orders: OrderRecord[];
  sales: SaleRecord[];
  settings: Partial<SettingsConfig> | null;
  openDialog: OpenDialog;
}) {
  const [period, setPeriod] = useState<LedgerPeriod>("Hoje");
  const [kind, setKind] = useState<LedgerKind | "Todos">("Todos");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);

  const tudo = useMemo(() => generalLedger(orders, sales), [orders, sales]);
  const listadas = useMemo(() => filterLedger(tudo, { period, kind, query }), [tudo, period, kind, query]);
  const resumo = useMemo(() => ledgerTotals(listadas), [listadas]);

  const trocarPeriodo = (novo: LedgerPeriod) => { setPeriod(novo); setLimit(50); };
  const trocarTipo = (novo: LedgerKind | "Todos") => { setKind(novo); setLimit(50); };

  // A linha imprime o mesmo papel que a tela de origem imprimiria: a OS sai
  // como OS, o serviço rápido também (ver orderFromQuickService), e a venda do
  // balcão sai como cupom, que é o que o cliente levou.
  const imprimir = (linha: (typeof listadas)[number], choice: Parameters<typeof copiesToPrint>[0]) => {
    const copies = copiesToPrint(choice, settings?.printThreeCopies !== false);
    if (linha.orderId) {
      const order = orders.find((item) => item.id === linha.orderId);
      if (order) printDocument(buildOrderDocument({ order, settings, mechanics: order.mechanic, copies }));
      return;
    }
    const sale = sales.find((item) => item.id === linha.saleId);
    if (!sale) return;
    if (sale.origin === "Serviço rápido") {
      printDocument(buildOrderDocument({ order: orderFromQuickService(sale), settings, mechanics: sale.mechanicName ?? "", copies }));
      return;
    }
    printDocument(buildSaleDocument(sale, settings));
  };

  return (
    <>
      <div className="module-heading">
        <div><p>Gestão</p><h1>Histórico geral</h1><span>Tudo o que passou pela oficina: OS encerrada, balcão e serviço rápido.</span></div>
      </div>

      <div className="report-period panel">
        <div className="filter-pills">
          {ledgerPeriods.map((nome) => (
            <button className={period === nome ? "selected" : ""} key={nome} onClick={() => trocarPeriodo(nome)}>{nome}</button>
          ))}
        </div>
        <div className="filter-pills">
          {(["Todos", ...ledgerKinds] as const).map((nome) => (
            <button className={kind === nome ? "selected" : ""} key={nome} onClick={() => trocarTipo(nome)}>{nome}</button>
          ))}
        </div>
      </div>

      <div className="report-mini">
        <article><span>Atendimentos</span><strong>{resumo.count}</strong></article>
        <article><span>Total do período</span><strong>{money(resumo.total)}</strong></article>
        <article><span>Oficina</span><strong>{money(resumo.orders)}</strong></article>
        <article><span>Balcão e serviço rápido</span><strong>{money(resumo.counter + resumo.quick)}</strong></article>
      </div>

      {/* OS lançada só para o histórico da moto não passou pelo caixa desta
          oficina: ela aparece na lista, porque é atendimento que aconteceu, mas
          fica fora do dinheiro. Sem este aviso a soma pareceria errada. */}
      {resumo.backfilled ? (
        <div className="quiet-note">
          {resumo.backfilled === 1 ? "1 OS lançada só para o histórico" : `${resumo.backfilled} OS lançadas só para o histórico`} neste
          recorte: aparecem na lista, mas ficam fora do total, porque o dinheiro delas não passou por este sistema.
        </div>
      ) : null}

      <section className="panel module-panel">
        <div className="list-toolbar">
          <label className="mini-search">
            <Icon name="search" size={18}/>
            <input aria-label="Buscar no histórico" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(50); }} placeholder="Cliente, placa, número ou serviço"/>
          </label>
        </div>
        {listadas.length ? (
          <>
            <div className="table-scroll"><table><thead><tr>
              <th className="col-secondary">Quando</th><th>Registro</th><th className="col-secondary">Motocicleta</th>
              <th className="col-secondary">Pagamento</th><th>Valor</th><th/>
            </tr></thead><tbody>
              {listadas.slice(0, limit).map((linha) => (
                <tr key={`${linha.kind}-${linha.id}`}>
                  <td className="col-secondary">{linha.when}</td>
                  <td>
                    <strong className="order-id">{linha.id}</strong>
                    <span>{linha.person} · {linha.summary}</span>
                    <small className="ledger-kind">{linha.kind}{linha.backfilled ? " · só histórico" : ""}{linha.operator ? ` · ${linha.operator}` : ""}</small>
                  </td>
                  <td className="col-secondary">{linha.vehicle || "—"}</td>
                  <td className="col-secondary">{linha.method}</td>
                  <td><strong>{money(linha.total)}</strong></td>
                  <td>
                    <div className="ledger-row-actions">
                      {linha.orderId ? <button className="outline-button" onClick={() => openDialog("order", linha.orderId)}>Abrir OS</button> : null}
                      <PrintCopiesMenu label="Imprimir" onPrint={(choice) => imprimir(linha, choice)}/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
            <footer className="queue-footer">
              <span>{Math.min(limit, listadas.length)} de {listadas.length} registro(s)</span>
              {listadas.length > limit && <button className="outline-button" onClick={() => setLimit((valor) => valor + 50)}>Carregar mais</button>}
            </footer>
          </>
        ) : (
          <div className="workspace-empty">
            <span><Icon name="file" size={28}/></span>
            <h3>{tudo.length ? "Nada neste recorte" : "Ainda não passou nada pela oficina"}</h3>
            <p>{tudo.length ? "Escolha outro período, outro tipo, ou limpe a busca." : "OS encerrada, venda do balcão e serviço rápido aparecem aqui automaticamente."}</p>
            {tudo.length ? <button className="outline-button" onClick={() => { setQuery(""); trocarTipo("Todos"); trocarPeriodo("Todos"); }}>Ver todo o histórico</button> : null}
          </div>
        )}
      </section>
    </>
  );
}

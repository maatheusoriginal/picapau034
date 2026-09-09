import type { ServiceOrderItem } from "../types";
import { itemQuantity } from "../order-items";
import { money } from "../workspace";
import { Icon } from "./WorkshopIcon";

export type AttendanceSummaryProps = {
  customer: string; phone: string; bike: string; plate: string; payer: string;
  mechanics: string; problem: string; delivery: string; priority: string;
  mileage: string; fuel: string; mileageChecked: boolean; partnerOrder: string;
  items: ServiceOrderItem[]; parts: number; labor: number; discount: number; total: number;
  pendingCustomer: boolean; reserveNow: boolean; onEdit: (step: number) => void;
};

export function AttendanceTotals({ parts, labor, discount, total }: Pick<AttendanceSummaryProps, "parts" | "labor" | "discount" | "total">) {
  return <dl className="intake-totals"><div><dt>Peças</dt><dd>{money(parts)}</dd></div><div><dt>Mão de obra</dt><dd>{money(labor)}</dd></div>{discount > 0 && <div className="intake-discount"><dt>Desconto da parceira</dt><dd>− {money(discount)}</dd></div>}<div className="intake-grand-total"><dt>Total previsto</dt><dd>{money(total)}</dd></div></dl>;
}

export function AttendanceSummary(props: AttendanceSummaryProps) {
  return <aside className="intake-summary" aria-label="Resumo do atendimento"><div className="intake-summary-title"><Icon name="file" size={19}/><h3>Resumo da OS</h3></div><div className="intake-summary-bike"><span className="plate">{props.plate || "Sem placa"}</span><strong>{props.bike || "Moto a selecionar"}</strong><span>{props.customer || "Cliente a selecionar"}</span></div><dl className="intake-facts"><div><dt>Pagamento</dt><dd>{props.payer}</dd></div><div><dt>Responsável</dt><dd>{props.mechanics || "A definir"}</dd></div><div><dt>Entrega prevista</dt><dd>{props.delivery || "A combinar"}</dd></div></dl><AttendanceTotals {...props}/><p className="intake-summary-note">O pagamento será feito no encerramento da OS.</p></aside>;
}

export function AttendanceReview(props: AttendanceSummaryProps) {
  return <div className="intake-review"><div className="intake-section-heading"><span>03 / CONFERÊNCIA</span><h3>Está tudo certo?</h3><p>Confira os dados antes de abrir a ordem de serviço.</p></div>
    <section className="intake-review-card"><header><h4><Icon name="bike" size={19}/>Cliente e motocicleta</h4><button type="button" onClick={() => props.onEdit(1)}><Icon name="edit" size={16}/>Editar</button></header><dl className="intake-review-facts"><div><dt>Cliente / empresa</dt><dd>{props.customer}</dd></div><div><dt>WhatsApp</dt><dd>{props.phone || "Não informado"}</dd></div><div><dt>Motocicleta</dt><dd>{props.bike || "Modelo não informado"}</dd></div><div><dt>Placa</dt><dd>{props.plate || "Não informada"}</dd></div><div><dt>Pagamento</dt><dd>{props.payer}</dd></div>{props.partnerOrder && <div><dt>OS do parceiro</dt><dd>{props.partnerOrder}</dd></div>}</dl>{props.pendingCustomer && <p className="intake-notice"><Icon name="alert" size={18}/>O cliente será identificado antes de encerrar e receber.</p>}</section>
    <section className="intake-review-card"><header><h4><Icon name="wrench" size={19}/>Recepção e serviço</h4><button type="button" onClick={() => props.onEdit(2)}><Icon name="edit" size={16}/>Editar</button></header><p className="intake-problem">{props.problem || "Problema relatado ainda não informado."}</p><dl className="intake-review-facts"><div><dt>Mecânicos</dt><dd>{props.mechanics || "A definir"}</dd></div><div><dt>Previsão</dt><dd>{props.delivery || "A combinar"}</dd></div><div><dt>Prioridade</dt><dd>{props.priority}</dd></div><div><dt>Quilometragem</dt><dd>{props.mileage || "Não informada"}{props.mileage ? (props.mileageChecked ? " · conferida" : " · não conferida") : ""}</dd></div><div><dt>Combustível</dt><dd>{props.fuel || "Não conferido"}</dd></div></dl></section>
    <section className="intake-review-card"><header><h4><Icon name="box" size={19}/>Peças e mão de obra <span>({props.items.length})</span></h4><button type="button" onClick={() => props.onEdit(2)}><Icon name="edit" size={16}/>Editar</button></header>{props.items.length ? <ul className="intake-review-items">{props.items.map((item, index) => <li key={`${item.id}:${index}`}><span><strong>{item.name}</strong><small>{itemQuantity(item)} × · {item.type}</small></span><b>{money(item.price)}</b></li>)}</ul> : <p className="intake-summary-note">Sem itens por enquanto. Você poderá incluir durante o atendimento.</p>}<AttendanceTotals {...props}/></section>
    <p className="intake-confirm-note"><Icon name="check" size={20}/><span>A OS será aberta em <b>Recepção</b>. {props.reserveNow ? "As peças incluídas serão baixadas do estoque ao abrir." : "A baixa das peças aguarda o início do serviço."} Nenhum pagamento será lançado agora.</span></p>
  </div>;
}

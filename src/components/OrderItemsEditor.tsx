import { useEffect, useMemo, useState } from "react";
import type { ProductRecord, ServiceOrderItem } from "../types";
import { money, searchProducts } from "../workspace";
import { toAmount } from "../inventory";
import { itemQuantity, itemUnitPrice, withItemQuantity } from "../order-items";
import { round2 } from "../finance";
import { NumberField } from "./NumberField";
import { Icon } from "./WorkshopIcon";

/**
 * Quantas peças a lista mostra de uma vez.
 *
 * Eram 8, pensadas para o resultado de uma busca. Com a lista aberta sem
 * busca, 8 é pouco para reconhecer a peça rolando — e o quadro rola por dentro
 * (ver .order-item-results no CSS), então mostrar mais não empurra o diálogo.
 */
const MOSTRADAS = 40;

export function OrderItemsEditor({ items, onChange, products, editable = true, onPendingChange }: { items: ServiceOrderItem[]; onChange: (items: ServiceOrderItem[]) => void; products: ProductRecord[]; editable?: boolean; onPendingChange?: (pending: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<"part" | "labor" | "">("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState(0);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const ativos = useMemo(() => products.filter((product) => product.active !== false), [products]);
  /*
    Sem busca, a lista já aparece.

    Antes o buscador só mostrava peça DEPOIS de alguém digitar, e no celular
    isso é pedir para o mecânico adivinhar: ele não sabe se a peça está
    cadastrada como "OLEO", "ÓLEO MOTOR" ou "LUBRIFICANTE", e cada tentativa
    errada devolve uma tela vazia. Com a lista aberta ele reconhece pelo nome
    em vez de acertar a palavra — e a lista já chega em ordem alfabética
    (ver sortProducts).
  */
  const results = useMemo(
    () => query.trim() ? searchProducts(ativos, query) : ativos,
    [ativos, query],
  );
  const pending = Boolean(description.trim() || value);
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  const addProduct = (product: ProductRecord) => {
    const old = items.find((item) => item.productId === product.id);
    onChange(old ? items.map((item) => item === old ? withItemQuantity(item, itemQuantity(item) + 1) : item) : [...items, { id: product.code, productId: product.id, type: "Peça", name: product.name, price: toAmount(product.price), cost: toAmount(product.cost), quantity: 1 }]);
    setQuery(""); setError(""); setFeedback(`${product.name} incluído. Busque outra peça para continuar.`);
  };
  const clearLabor = () => { setDescription(""); setValue(0); setAdding(""); setError(""); };
  const addLabor = () => {
    if (!description.trim() || !Number.isFinite(value) || value < 0) { setError("Informe a descrição e um valor válido para o serviço."); return; }
    onChange([...items, { id: `LAB-${crypto.randomUUID()}`, type: "Mão de obra", name: description.trim(), price: round2(value), quantity: 1 }]);
    setFeedback(`${description.trim()} incluído.`); clearLabor();
  };
  return <section className="order-items-editor"><header><div><h3>Peças e mão de obra</h3><p>{editable ? "Inclua os itens e ajuste os valores antes de confirmar." : "Itens registrados neste atendimento."}</p></div><b aria-label={`${items.length} itens`}>{items.length}</b></header>
    {editable && <div className="order-add-actions"><button type="button" aria-expanded={adding === "part"} className={adding === "part" ? "selected" : ""} onClick={() => { setAdding(adding === "part" ? "" : "part"); setError(""); }}><Icon name="box" size={18}/>Adicionar peça</button><button type="button" aria-expanded={adding === "labor"} className={adding === "labor" ? "selected" : ""} onClick={() => { setAdding(adding === "labor" ? "" : "labor"); setError(""); }}><Icon name="wrench" size={18}/>Adicionar serviço{pending ? " •" : ""}</button></div>}
    {editable && adding === "part" && <div className="order-item-picker"><label className="field"><span>Buscar no estoque</span><span className="mini-search"><Icon name="search" size={18}/><input autoFocus aria-label="Buscar peça para a OS" autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); setFeedback(""); }} placeholder="Nome, referência ou código de barras" onKeyDown={(event) => { if (event.key === "Enter" && query.trim() && results.length === 1) { event.preventDefault(); addProduct(results[0]); } }}/></span></label>{results.length ? <><div className="order-item-results">{results.slice(0, MOSTRADAS).map((product) => <button type="button" className="order-item-result" key={product.id} onClick={() => addProduct(product)}><span><strong>{product.name}</strong><small>{product.code} · <span className={Number(product.stock) <= 0 ? "danger-text" : ""}>{product.stock || 0} em estoque</span></small></span><b>{money(toAmount(product.price))}</b><Icon name="plus" size={19}/></button>)}</div>{results.length > MOSTRADAS && <p>{query.trim() ? `Exibindo ${MOSTRADAS} de ${results.length}. Digite mais detalhes para refinar.` : `${results.length} peças no estoque. Role a lista ou digite para achar mais rápido.`}</p>}</> : query.trim() ? <div className="order-picker-empty"><Icon name="search" size={22}/><strong>Nenhuma peça encontrada</strong><p>Confira o nome ou o código e tente outra busca.</p></div> : <div className="order-picker-empty"><Icon name="box" size={22}/><strong>Nenhuma peça cadastrada</strong><p>Cadastre as peças em Produtos e estoque para incluí-las na OS.</p></div>}</div>}
    {editable && adding === "labor" && <div className="order-labor-fields"><label className="field"><span>Descrição do serviço</span><input autoFocus value={description} onChange={(event) => setDescription(event.target.value.toUpperCase())} placeholder="Ex.: TROCA DO KIT RELAÇÃO"/></label><label className="field"><span>Valor (R$)</span><NumberField casas={2} value={value} blankValue={0} placeholder="0,00" onChange={setValue} min={0} aria-label="Valor do serviço"/></label><div className="order-labor-actions"><button type="button" className="outline-button" onClick={clearLabor}>Descartar campos</button><button type="button" className="primary-button" onClick={addLabor}><Icon name="plus" size={17}/>Incluir serviço</button></div></div>}
    {editable && pending && adding !== "labor" && <p className="order-pending-note">Você tem um serviço em edição. <button type="button" onClick={() => setAdding("labor")}>Continuar edição</button></p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="order-item-feedback" role="status" aria-live="polite">{feedback}</p>
    {items.length ? <div className="editable-order-lines">{items.map((item, index) => <div key={`${item.id}:${index}`} className={`editable-order-line ${!editable ? "is-readonly" : ""}`}><span className="editable-item-name"><span className={`item-type ${item.type === "Peça" ? "part" : "labor"}`}>{item.type === "Peça" ? "Peça" : "Serviço"}</span><strong>{item.name}</strong></span>{editable ? <><label className="editable-item-quantity"><span>Qtd.</span><NumberField value={itemQuantity(item)} min={0.001} step="any" fallback={itemQuantity(item)} onChange={(quantity) => onChange(items.map((line, position) => position === index ? withItemQuantity(line, quantity) : line))} aria-label={`Quantidade de ${item.name}`}/></label><label className="editable-item-price"><span>Unitário (R$)</span><NumberField casas={2} min={0} value={itemUnitPrice(item)} onChange={(price) => onChange(items.map((line, position) => position === index ? { ...line, price: round2(price * itemQuantity(line)) } : line))} aria-label={`Preço unitário de ${item.name}`}/></label></> : <span>{itemQuantity(item)} × {money(itemUnitPrice(item))}</span>}<span className="editable-line-total"><small>Total</small><b>{money(item.price)}</b></span>{editable && <button type="button" className="remove-item" aria-label={`Remover ${item.name}`} onClick={() => { onChange(items.filter((_, position) => position !== index)); setFeedback(`${item.name} removido.`); }}><Icon name="trash" size={18}/></button>}</div>)}</div> : <div className="order-items-empty"><Icon name="box" size={25}/><span><strong>Nenhum item incluído</strong><small>Você pode abrir a OS e adicionar peças e serviços depois.</small></span></div>}
  </section>;
}

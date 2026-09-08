import { useState } from "react";
import type { ProductRecord, ServiceOrderItem } from "../types";
import { money, searchProducts } from "../workspace";
import { toAmount } from "../inventory";
import { itemQuantity, itemUnitPrice, withItemQuantity } from "../order-items";
import { NumberField } from "./NumberField";
import { Icon } from "./WorkshopIcon";

export function OrderItemsEditor({ items, onChange, products, editable = true }: { items: ServiceOrderItem[]; onChange: (items: ServiceOrderItem[]) => void; products: ProductRecord[]; editable?: boolean }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<"part" | "labor" | "">("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState(0);
  const [error, setError] = useState("");
  const addProduct = (product: ProductRecord) => {
    const old = items.find((item) => item.productId === product.id);
    onChange(old ? items.map((item) => item === old ? withItemQuantity(item, itemQuantity(item) + 1) : item) : [...items, { id: product.code, productId: product.id, type: "Peça", name: product.name, price: toAmount(product.price), cost: toAmount(product.cost), quantity: 1 }]);
    setQuery(""); setError("");
  };
  return <section className="order-items-editor"><header><div><h3>Peças e mão de obra</h3><p>{editable ? "Inclua agora o que já souber. Complete durante o serviço." : "Itens registrados neste atendimento."}</p></div><b>{items.length}</b></header>
    {items.length ? <div className="editable-order-lines">{items.map((item, index) => <div key={`${item.id}:${index}`} className="editable-order-line"><span className={`item-type ${item.type === "Peça" ? "part" : "labor"}`}>{item.type === "Peça" ? "Peça" : "Serviço"}</span><span className="editable-item-name"><strong>{item.name}</strong><small>{money(itemUnitPrice(item))} por unidade</small></span>{editable ? <label className="editable-item-quantity"><span>Qtd.</span><NumberField value={itemQuantity(item)} min={0.001} step="any" fallback={itemQuantity(item)} onChange={(quantity) => onChange(items.map((line, position) => position === index ? withItemQuantity(line, quantity) : line))} aria-label={`Quantidade de ${item.name}`}/></label> : <span>{itemQuantity(item)}×</span>}<b>{money(item.price)}</b>{editable && <button className="remove-item" aria-label={`Remover ${item.name}`} onClick={() => onChange(items.filter((_, position) => position !== index))}><Icon name="trash" size={17}/></button>}</div>)}</div> : <div className="order-items-empty"><Icon name="box" size={23}/><span>Nenhuma peça ou serviço incluído.</span></div>}
    {editable && <><div className="order-add-actions"><button className={adding === "part" ? "selected" : ""} onClick={() => { setAdding(adding === "part" ? "" : "part"); setError(""); }}><Icon name="box" size={18}/>Adicionar peça</button><button className={adding === "labor" ? "selected" : ""} onClick={() => { setAdding(adding === "labor" ? "" : "labor"); setError(""); }}><Icon name="wrench" size={18}/>Adicionar serviço</button></div>
      {adding === "part" && <div className="order-item-picker"><label className="mini-search"><Icon name="search" size={18}/><input autoFocus aria-label="Buscar peça para a OS" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Peça, referência ou código de barras" onKeyDown={(event) => { const first = searchProducts(products, query)[0]; if (event.key === "Enter" && first) { event.preventDefault(); addProduct(first); } }}/></label>{query.trim() ? searchProducts(products, query).slice(0, 6).map((product) => <button className="order-item-result" key={product.id} onClick={() => addProduct(product)}><span><strong>{product.name}</strong><small>{product.code} · {product.stock} em estoque</small></span><b>{product.price}</b><Icon name="plus" size={17}/></button>) : <p>Busque a peça para ver preço e disponibilidade.</p>}</div>}
      {adding === "labor" && <div className="order-labor-fields"><label className="field"><span>Serviço a realizar</span><input autoFocus aria-label="Descrição do serviço" value={description} onChange={(event) => setDescription(event.target.value.toUpperCase())} placeholder="Ex.: TROCA DO KIT RELAÇÃO"/></label><label className="field"><span>Valor da mão de obra</span><NumberField casas={2} value={value} onChange={setValue} min={0} aria-label="Valor do serviço"/></label><button className="primary-button" onClick={() => { if (!description.trim() || !(value > 0)) { setError("Informe a descrição e um valor maior que zero."); return; } onChange([...items, { id: `LAB-${crypto.randomUUID()}`, type: "Mão de obra", name: description.trim(), price: value, quantity: 1 }]); setDescription(""); setValue(0); setAdding(""); setError(""); }}>Incluir serviço</button></div>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>}
  </section>;
}

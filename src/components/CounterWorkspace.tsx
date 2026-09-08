import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CartItem, CashSession, OpenDialog, ProductRecord } from "../types";
import { discountProblem, round2, totalAfterDiscount } from "../finance";
import { toAmount } from "../inventory";
import { money, searchProducts, type ParkedSale } from "../workspace";
import { NumberField } from "./NumberField";
import { Icon } from "./WorkshopIcon";

type Props = {
  products: ProductRecord[]; cart: CartItem[]; setCart: Dispatch<SetStateAction<CartItem[]>>;
  discount: number; setDiscount: (value: number) => void; notify: (message: string) => void;
  openDialog: OpenDialog; cash?: CashSession; blockZeroStockSale: boolean; canManageFinance: boolean;
  parked: ParkedSale[]; setParked: Dispatch<SetStateAction<ParkedSale[]>>;
};

export function CounterWorkspace({ products, cart, setCart, discount, setDiscount, notify, openDialog, cash, blockZeroStockSale, canManageFinance, parked, setParked }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<ProductRecord | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => searchProducts(products, query).slice(0, 8), [products, query]);
  const subtotal = round2(cart.reduce((sum, item) => sum + item.unit * item.quantity, 0));
  const discountError = discountProblem(subtotal, discount);
  const pay = () => {
    if (!cart.length || pending || discountError) return;
    if (!cash) { notify(canManageFinance ? "Abra o caixa antes de receber a venda." : "Peça ao responsável para abrir o caixa antes de receber."); if (canManageFinance) openDialog("cash"); return; }
    openDialog("payment");
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (event.key === "F2") { event.preventDefault(); input.current?.focus(); input.current?.select(); }
      if (event.key === "F10") { event.preventDefault(); pay(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cart, discountError, cash, pending]);
  const choose = (product: ProductRecord) => { setPending(product); setQuantity(1); setError(""); setQuery(""); };
  const add = () => {
    if (!pending) return;
    const product = products.find((item) => item.id === pending.id);
    if (!product || product.active === false) { setError("Este produto não está disponível. Faça a busca novamente."); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setError("Informe uma quantidade maior que zero."); return; }
    const existing = cart.find((item) => item.id === product.id)?.quantity ?? 0;
    if (blockZeroStockSale && existing + quantity > product.stock) { setError(`Disponível: ${product.stock}. Já na venda: ${existing}.`); return; }
    setCart((current) => current.some((item) => item.id === product.id) ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity, stock: product.stock } : item) : [...current, { id: product.id, code: product.code, name: product.name, stock: product.stock, unit: toAmount(product.price), cost: toAmount(product.cost), quantity }]);
    setPending(null); setError(""); input.current?.focus();
  };
  const editQuantity = (item: CartItem, next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    const stock = products.find((product) => product.id === item.id)?.stock ?? item.stock;
    if (blockZeroStockSale && next > stock) { notify(`Só há ${stock} de ${item.name} no estoque.`); return; }
    setCart((current) => current.map((line) => line.id === item.id ? { ...line, quantity: next, stock } : line));
  };
  const resetCart = () => { setCart([]); setDiscount(0); setClearing(false); };
  const park = () => {
    if (!cart.length || pending) return;
    if (discountError) { notify(discountError); return; }
    setParked((current) => [...current, { id: crypto.randomUUID(), at: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), items: cart.map((item) => ({ ...item })), discount }]);
    resetCart(); notify("Venda em espera nesta sessão. Você já pode atender outra pessoa.");
  };
  const resume = (sale: ParkedSale) => {
    if (cart.length || pending) { notify("Pause ou conclua a venda atual antes de retomar outra."); return; }
    setCart(sale.items.map((item) => ({ ...item, stock: products.find((product) => product.id === item.id)?.stock ?? 0 })));
    setDiscount(sale.discount); setParked((current) => current.filter((item) => item.id !== sale.id));
  };
  return <div className="counter-workspace">
    <div className="module-heading"><div><p>Balcão</p><h1>Nova venda</h1><span>Busque a peça, informe a quantidade e receba.</span></div><div className="heading-actions">{canManageFinance && <button className="outline-button" onClick={() => openDialog("expense")}>Lançar gasto</button>}<button className={`counter-cash ${cash ? "is-open" : "is-closed"}`} onClick={() => openDialog("cash")}><i/>{cash ? "Caixa aberto" : canManageFinance ? "Abrir caixa" : "Caixa fechado"}<Icon name="wallet" size={17}/></button></div></div>
    {!cash && <div className="inline-alert cash-warning"><Icon name="alert" size={18}/><span>Você pode montar a venda. Abra o caixa antes de receber.</span><button onClick={() => openDialog("cash")}>{canManageFinance ? "Abrir caixa" : "Consultar caixa"}</button></div>}
    <div className="counter-layout"><section className="counter-main">
      <div className="counter-search-zone"><label className="counter-search"><Icon name="search" size={23}/><input ref={input} autoFocus aria-label="Buscar peça no balcão" aria-controls="counter-suggestions" aria-expanded={!!query} role="combobox" aria-autocomplete="list" aria-activedescendant={query && suggestions[selected] ? `counter-result-${selected}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(value + 1, suggestions.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); } if (event.key === "Enter" && suggestions[selected]) { event.preventDefault(); choose(suggestions[selected]); } if (event.key === "Escape") setQuery(""); }} placeholder="Produto, código ou código de barras"/><kbd>F2</kbd></label>
        {query && <div className="counter-suggestions" role="listbox" id="counter-suggestions">{suggestions.length ? suggestions.map((product, index) => <button id={`counter-result-${index}`} role="option" aria-selected={selected === index} className={selected === index ? "selected" : ""} key={product.id} onClick={() => choose(product)}><span><strong>{product.name}</strong><small>{product.code}{product.barcode ? ` · ${product.barcode}` : ""} · {product.stock} {product.unit || "UN"}</small></span><b>{product.price}</b><Icon name="plus" size={17}/></button>) : <p>Nenhuma peça encontrada. Tente o nome ou a referência.</p>}</div>}
      </div>
      {pending && <form className="quantity-prompt" onSubmit={(event) => { event.preventDefault(); add(); }}><div><span>Adicionar à venda</span><strong>{pending.name}</strong><small>{pending.price} por unidade · {pending.stock} em estoque</small></div><label><span>Quantidade</span><NumberField key={pending.id} value={quantity} onChange={setQuantity} fallback={0} autoFocus onFocus={(event) => event.target.select()} step="any" aria-label={`Quantidade de ${pending.name}`}/></label><button className="primary-button" type="submit">Adicionar <Icon name="plus" size={16}/></button><button className="icon-button" type="button" aria-label="Cancelar inclusão" onClick={() => { setPending(null); setError(""); input.current?.focus(); }}>×</button>{error && <p className="field-error" role="alert">{error}</p>}</form>}
      <section className="panel counter-cart"><header className="panel-header"><div><h2>Itens da venda <span className="item-count">{cart.length}</span></h2><p>{cart.length ? "Ajuste a quantidade diretamente na linha." : "Os produtos aparecem quando você pesquisar."}</p></div>{cart.length > 0 && <button className="text-button" onClick={() => setClearing(true)}>Limpar</button>}</header>
        {clearing && <div className="inline-confirm" role="alert"><span>Limpar os itens e o desconto desta venda?</span><button className="outline-button" onClick={() => setClearing(false)}>Voltar</button><button className="primary-button" onClick={resetCart}>Limpar venda</button></div>}
        {cart.length ? <div className="counter-lines">{cart.map((item, index) => <div className="counter-line" key={item.id}><span className="line-index">{String(index + 1).padStart(2,"0")}</span><span className="line-name"><strong>{item.name}</strong><small>{item.code} · {money(item.unit)} / un.</small></span><div className="counter-quantity"><button aria-label={`Diminuir ${item.name}`} onClick={() => editQuantity(item, item.quantity - 1)} disabled={item.quantity <= 1}>−</button><NumberField value={item.quantity} onChange={(value) => editQuantity(item, value)} min={0.001} fallback={item.quantity} step="any" aria-label={`Quantidade de ${item.name}`}/><button aria-label={`Aumentar ${item.name}`} onClick={() => editQuantity(item, item.quantity + 1)}>+</button></div><strong className="line-total">{money(item.unit * item.quantity)}</strong><button className="remove-item" aria-label={`Remover ${item.name}`} onClick={() => { setCart((current) => current.filter((line) => line.id !== item.id)); if (cart.length === 1) setDiscount(0); }}><Icon name="trash" size={17}/></button></div>)}</div> : <div className="workspace-empty"><span><Icon name="box" size={30}/></span><h3>Pronto para a próxima venda</h3><p>Digite o nome da peça ou use o leitor.<br/>Pressione Enter para escolher a quantidade.</p><button className="outline-button" onClick={() => input.current?.focus()}>Buscar produto</button></div>}
      </section>
      {!!parked.length && <section className="panel parked-sales"><header><h2>Vendas em espera <b>{parked.length}</b></h2><p>Mantidas enquanto esta aba estiver aberta. Conclua antes de sair.</p></header>{parked.map((sale) => <button key={sale.id} onClick={() => resume(sale)}><span><strong>{sale.items[0]?.name}{sale.items.length > 1 ? ` + ${sale.items.length - 1} item(ns)` : ""}</strong><small>Pausada às {sale.at} · {sale.items.length} item(ns)</small></span><b>{money(totalAfterDiscount(sale.items.reduce((sum, item) => sum + item.unit * item.quantity, 0), sale.discount))}</b><span>Retomar <Icon name="arrow" size={16}/></span></button>)}</section>}
    </section><aside className="counter-summary panel"><header><span className="eyebrow">Fechamento</span><h2>Resumo da venda</h2></header><div className="counter-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><label><span>Desconto em R$</span><NumberField casas={2} value={discount} onChange={setDiscount} min={0} aria-label="Desconto em reais" disabled={!cart.length}/></label></div>{discountError && <p className="field-error" role="alert">{discountError}</p>}<div className="counter-grand-total"><span>Total a receber</span><strong>{money(totalAfterDiscount(subtotal, discount))}</strong></div><button className="payment-button" disabled={!cart.length || !!pending || !!discountError} onClick={pay}><Icon name="wallet"/>Receber <kbd>F10</kbd></button><p className="counter-payment-note">Cliente, parcelas e formas de pagamento na próxima etapa.</p><div className="counter-methods"><span>PIX</span><span>Dinheiro</span><span>Cartão</span><span>A prazo</span></div><button className="counter-park" disabled={!cart.length || !!pending} onClick={park}><Icon name="clock" size={17}/>Pausar venda nesta sessão</button></aside></div>
  </div>;
}

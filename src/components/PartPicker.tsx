import { useMemo, useState } from "react";
import type { ProductRecord } from "../types";
import { money, searchProducts } from "../workspace";
import { toAmount } from "../inventory";
import { Icon } from "./WorkshopIcon";

/**
 * Quantas peças a lista mostra de uma vez.
 *
 * Eram 8, pensadas para o resultado de uma busca. Com a lista aberta sem
 * busca, 8 é pouco para reconhecer a peça rolando — e o quadro rola por dentro
 * (ver .order-item-results no CSS), então mostrar mais não empurra o diálogo.
 */
const MOSTRADAS = 40;

/**
 * Escolher uma peça do estoque: a lista à vista, e a busca pelo nome.
 *
 * ESTE É O BUSCADOR DE PEÇA DO SISTEMA, e não um dos buscadores. A OS e o
 * serviço rápido usam este mesmo componente de propósito: no dia em que
 * existirem dois, eles divergem — um mostra a lista antes de digitar e o outro
 * não, um respeita a ordem alfabética e o outro não —, e quem descobre é o
 * mecânico no balcão, com o cliente esperando.
 *
 * A LISTA APARECE SEM BUSCA. Antes era preciso digitar para ver qualquer
 * coisa, e no celular isso é pedir para o mecânico adivinhar como a peça foi
 * cadastrada — "OLEO", "ÓLEO MOTOR", "LUBRIFICANTE" —, com cada tentativa
 * errada devolvendo tela vazia. Com a lista aberta ele reconhece pelo nome em
 * vez de acertar a palavra; a ordem alfabética vem de `sortProducts`.
 */
export function PartPicker({ products, onPick, rotulo = "Buscar no estoque", vazio = "Cadastre as peças em Produtos e estoque para incluí-las.", autoFocus = true, onQueryChange }: {
  products: ProductRecord[];
  onPick: (product: ProductRecord) => void;
  /** O nome do campo de busca. Muda com a tela, a lista não. */
  rotulo?: string;
  /** O que dizer quando o estoque está vazio de verdade. */
  vazio?: string;
  autoFocus?: boolean;
  /** Avisa quem está de fora que a busca mudou, para limpar recado antigo. */
  onQueryChange?: () => void;
}) {
  const [query, setQuery] = useState("");
  const ativos = useMemo(() => products.filter((product) => product.active !== false), [products]);
  const results = useMemo(() => query.trim() ? searchProducts(ativos, query) : ativos, [ativos, query]);
  const escolher = (product: ProductRecord) => { setQuery(""); onPick(product); };

  return <div className="order-item-picker">
    <label className="field"><span>{rotulo}</span>
      <span className="mini-search"><Icon name="search" size={18}/>
        <input autoFocus={autoFocus} aria-label="Buscar peça no estoque" autoComplete="off" value={query}
          onChange={(event) => { setQuery(event.target.value); onQueryChange?.(); }}
          placeholder="Nome, referência ou código de barras"
          // Um resultado só e Enter: é o caso do leitor de código de barras,
          // que digita tudo e termina com Enter.
          onKeyDown={(event) => { if (event.key === "Enter" && query.trim() && results.length === 1) { event.preventDefault(); escolher(results[0]!); } }}/>
      </span>
    </label>
    {results.length ? <>
      <div className="order-item-results">
        {results.slice(0, MOSTRADAS).map((product) => (
          <button type="button" className="order-item-result" key={product.id} onClick={() => escolher(product)}>
            <span>
              <strong>{product.name}</strong>
              <small>{product.code} · <span className={Number(product.stock) <= 0 ? "danger-text" : ""}>{product.stock || 0} em estoque</span></small>
            </span>
            <b>{money(toAmount(product.price))}</b>
            <Icon name="plus" size={19}/>
          </button>
        ))}
      </div>
      {results.length > MOSTRADAS && <p>{query.trim()
        ? `Exibindo ${MOSTRADAS} de ${results.length}. Digite mais detalhes para refinar.`
        : `${results.length} peças no estoque. Role a lista ou digite para achar mais rápido.`}</p>}
    </> : query.trim()
      ? <div className="order-picker-empty"><Icon name="search" size={22}/><strong>Nenhuma peça encontrada</strong><p>Confira o nome ou o código e tente outra busca.</p></div>
      : <div className="order-picker-empty"><Icon name="box" size={22}/><strong>Nenhuma peça cadastrada</strong><p>{vazio}</p></div>}
  </div>;
}

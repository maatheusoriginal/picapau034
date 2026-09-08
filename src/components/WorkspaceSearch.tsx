import { useEffect, useMemo, useRef, useState } from "react";
import type { IconName } from "../types";
import { matchesSearch, searchable } from "../workspace";
import { Icon } from "./WorkshopIcon";

export type SearchEntry = { key: string; title: string; detail: string; destination: string; icon: IconName; keywords?: string; recordId?: string; kind?: "order" | "product" | "client" | "motorcycle" | "supplier" };

export function WorkspaceSearch({ entries, onPick }: { entries: SearchEntry[]; onPick: (entry: SearchEntry) => void }) {
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState(false);
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => entries.filter((entry) => query.trim() ? matchesSearch(query, entry.title, entry.detail, entry.keywords) : !entry.recordId).sort((a, b) => Number(searchable(b.title) === searchable(query)) - Number(searchable(a.title) === searchable(query))).slice(0, 9), [entries, query]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector('[aria-modal="true"]')) { event.preventDefault(); input.current?.focus(); input.current?.select(); setOpened(true); } };
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpened(false); };
    window.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, []);
  const pick = (entry: SearchEntry) => { setQuery(""); setOpened(false); input.current?.blur(); onPick(entry); };
  return <div className="workspace-search" ref={container}><Icon name="search" size={19}/><input ref={input} role="combobox" aria-autocomplete="list" aria-expanded={opened} aria-controls="workspace-search-results" aria-activedescendant={opened && results[index] ? `workspace-search-${index}` : undefined} aria-label="Buscar OS, cliente, placa, peça ou tela" value={query} onFocus={() => setOpened(true)} onChange={(event) => { setQuery(event.target.value); setIndex(0); setOpened(true); }} onKeyDown={(event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setIndex((value) => Math.min(value + 1, Math.max(0, results.length - 1))); setOpened(true); }
    if (event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
    if (event.key === "Enter" && opened && results[index]) { event.preventDefault(); pick(results[index]); }
    if (event.key === "Escape") { setOpened(false); input.current?.blur(); }
  }} placeholder="Buscar OS, placa, cliente ou peça…"/><kbd>Ctrl K</kbd>{opened && <div className="workspace-search-results" id="workspace-search-results" role="listbox" aria-label="Resultados da busca"><div className="search-result-heading">{query.trim() ? "Registros e atalhos" : "Ir direto para"}</div>{results.length ? results.map((entry, position) => <button type="button" id={`workspace-search-${position}`} key={entry.key} role="option" aria-selected={index === position} onMouseEnter={() => setIndex(position)} onClick={() => pick(entry)}><span className="search-result-icon"><Icon name={entry.icon} size={18}/></span><span><strong>{entry.title}</strong><small>{entry.detail}</small></span><Icon name="arrow" size={16}/></button>) : <div className="no-results">Nenhum resultado. Tente o nome, telefone ou código.</div>}<footer>↑ ↓ para escolher · Enter para abrir · Esc para fechar</footer></div>}</div>;
}

/**
 * Um `<select>` com o botão de criar item novo do lado.
 *
 * Cadastrar uma peça e descobrir que a categoria dela não existe obrigava a
 * fechar o cadastro, ir em Configurações, criar a categoria, voltar e começar
 * de novo — perdendo o que já tinha sido digitado. Na prática ninguém faz
 * isso: joga em "Peças" e segue, e o filtro do estoque para de significar
 * alguma coisa.
 *
 * Aqui o "+" abre um campo na mesma linha; ao confirmar, o item é criado, já
 * fica selecionado, e o cadastro continua de onde estava.
 */
import { useState } from "react";
import { emMaiusculo } from "../text-case";
import { quickAddProblem } from "../quick-list";

export function QuickAddSelect({
  value,
  onChange,
  options,
  onCreate,
  placeholder,
  emptyLabel,
  className,
  disabled,
  createTitle,
}: {
  value: string;
  onChange: (valor: string) => void;
  options: string[];
  /** Grava o item novo. Recebe o nome já limpo e em maiúsculo. */
  onCreate: (nome: string) => Promise<void> | void;
  placeholder?: string;
  /** A primeira opção, quando o campo aceita ficar vazio. */
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  createTitle?: string;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    const problema = quickAddProblem(options, nome);
    if (problema) return setErro(problema);
    setSalvando(true);
    try {
      const limpo = emMaiusculo(nome.trim().replace(/\s+/g, " "));
      await onCreate(limpo);
      onChange(limpo);
      setCriando(false);
      setNome("");
      setErro("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível criar agora.");
    } finally {
      setSalvando(false);
    }
  };

  if (criando) {
    return (
      <div className="quick-add">
        <div className="quick-add-row">
          <input
            value={nome}
            onChange={(evento) => { setNome(emMaiusculo(evento.target.value)); setErro(""); }}
            placeholder={placeholder ?? "Nome do item novo"}
            className={className ?? "dialog-input"}
            autoFocus
            // Enter confirma e NÃO envia o formulário do cadastro: sem isto o
            // produto era gravado pela metade só por apertar Enter aqui.
            onKeyDown={(evento) => {
              if (evento.key === "Enter") { evento.preventDefault(); void confirmar(); }
              if (evento.key === "Escape") { evento.preventDefault(); setCriando(false); setNome(""); setErro(""); }
            }}
          />
          <button type="button" className="quick-add-confirm" disabled={salvando} onClick={() => void confirmar()}>
            {salvando ? "Criando..." : "Criar"}
          </button>
          <button type="button" className="quick-add-cancel" onClick={() => { setCriando(false); setNome(""); setErro(""); }}>
            Cancelar
          </button>
        </div>
        {erro ? <small className="quick-add-error">{erro}</small> : null}
      </div>
    );
  }

  return (
    <div className="quick-add">
      <div className="quick-add-row">
        <select
          value={value}
          onChange={(evento) => onChange(evento.target.value)}
          className={className ?? "dialog-select"}
          disabled={disabled}
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((item) => <option key={item} value={item}>{item}</option>)}
          {/* O valor gravado antes pode não estar mais na lista: sem esta
              opção o campo mostraria outro item e a edição trocaria o dado
              sozinha ao salvar. */}
          {value && !options.includes(value) ? <option value={value}>{value} (fora da lista)</option> : null}
        </select>
        <button
          type="button"
          className="quick-add-open"
          onClick={() => setCriando(true)}
          disabled={disabled}
          title={createTitle ?? "Criar um item novo sem sair daqui"}
          aria-label={createTitle ?? "Criar um item novo sem sair daqui"}
        >
          +
        </button>
      </div>
    </div>
  );
}

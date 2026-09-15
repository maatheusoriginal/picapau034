import { useEffect, useRef, useState } from "react";
import { ORDER_COPY_LABELS, type OrderCopyChoice } from "../documents";
import { Icon } from "./WorkshopIcon";

/**
 * O botão de imprimir que pergunta QUAL via.
 *
 * Antes ele mandava sempre o jogo inteiro. Só que o caso do dia a dia é o
 * contrário: o cliente perdeu a via dele, a do caixa rasgou na gaveta, o
 * mecânico levou a dele junto com a moto. Reimprimir as três para recuperar
 * uma gasta papel e tempo na guilhotina — e ainda deixa duas vias soltas no
 * balcão, que é como se confunde qual é a boa.
 *
 * As três vias ficam sempre na lista, mesmo em oficina que desligou as três
 * vias nas Configurações: aquela opção decide o PADRÃO, e aqui a pessoa está
 * escolhendo na mão.
 */
export function PrintCopiesMenu({ label, onPrint }: {
  label: string;
  onPrint: (choice: OrderCopyChoice) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Clicar fora fecha. Sem isso o menu fica preso na tela e cobre a linha de
  // baixo, que é justamente a próxima OS que a pessoa quer imprimir.
  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (evento: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) setAberto(false);
    };
    const comEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", foraDaqui);
    document.addEventListener("keydown", comEsc);
    return () => {
      document.removeEventListener("mousedown", foraDaqui);
      document.removeEventListener("keydown", comEsc);
    };
  }, [aberto]);

  const escolher = (choice: OrderCopyChoice) => {
    setAberto(false);
    onPrint(choice);
  };

  return (
    <div className="print-copies" ref={caixa}>
      <button type="button" onClick={() => setAberto((valor) => !valor)} aria-expanded={aberto} aria-haspopup="menu">
        <Icon name="printer" size={16}/>{label}
      </button>
      {aberto ? (
        <div className="print-copies-menu" role="menu">
          <button type="button" role="menuitem" className="print-copies-all" onClick={() => escolher("todas")}>
            <strong>Imprimir as 3 vias</strong>
            <small>Mecânico, caixa e cliente</small>
          </button>
          <span className="print-copies-divider">ou só uma via</span>
          {ORDER_COPY_LABELS.map((via) => (
            <button type="button" role="menuitem" key={via} onClick={() => escolher(via)}>{via}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { arredondar, clamp, displayValue, isPartialNumber, normalizarColado, parseTyped, settleOnBlur } from "../number-input";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onChange: (value: number) => void;
  /** O que vale quando o campo fica vazio — o mesmo número do antigo `|| N`. */
  fallback?: number;
  /**
   * Valor que aparece como campo vazio, para o placeholder ("0,00") continuar
   * visível. Alguns formulários já faziam isto à mão com
   * `value={custo === 0 ? "" : custo}` — que mostrava vazio mas não resolvia a
   * digitação, porque o estado continuava sendo o número.
   */
  blankValue?: number;
  min?: number;
  max?: number;
  /**
   * Casas decimais fixas na exibição — 2 para dinheiro e porcentagem.
   *
   * Com casas o campo deixa de ser input[type=number]: aquele tipo não mostra
   * vírgula, e "2.68" num sistema de oficina brasileira é o que faz alguém
   * digitar o ponto e o valor entrar errado. Vira campo de texto com teclado
   * decimal, aceitando vírgula ou ponto enquanto se digita e assentando em
   * "0,00" ao sair.
   */
  casas?: number;
};

/**
 * Campo de número que deixa apagar o que está escrito.
 *
 * O campo antigo era controlado direto por um número: apagar devolvia zero na
 * mesma tecla e o campo voltava a mostrar "0", então o valor digitado em
 * seguida entrava depois dele ("020"). Aqui o texto é estado próprio: fica
 * vazio enquanto a pessoa digita e só é normalizado quando ela sai do campo.
 *
 * O valor continua subindo a cada tecla, para as telas que reagem enquanto se
 * digita — no cadastro de peça, mudar o custo recalcula o preço na hora.
 */
export const NumberField: React.FC<Props> = ({ value, onChange, fallback = 0, blankValue, min, max, casas, onBlur, ...rest }) => {
  const escrever = (numero: number) => displayValue(numero, blankValue, casas);
  const [text, setText] = useState(() => escrever(value));
  // O último número que este campo mandou para cima. Serve para distinguir
  // "o pai mudou o valor" de "é o eco do que acabei de digitar" — sem isso, o
  // eco reescreveria o texto e apagaria o que a pessoa está digitando.
  const reported = useRef(value);

  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    setText(escrever(value));
  }, [value]);

  const handleChange = (raw: string) => {
    // Um input[type=number] entrega "" para o que ele não consegue ler; num
    // campo de texto (com casas) é este teste que barra a letra. Ele aceita o
    // número pela metade — "1," e "-" são estados normais de quem digita.
    if (!isPartialNumber(raw)) {
      // Valor colado já formatado: sem isto o campo ignorava a colagem calado.
      const colado = normalizarColado(raw);
      if (!colado) return;
      raw = colado;
    }
    setText(raw);
    const typed = parseTyped(raw);
    if (typed === null) return;
    const limited = clamp(typed, min, max);
    reported.current = limited;
    onChange(limited);
  };

  return (
    <input
      {...rest}
      // Campo de texto quando há casas decimais: input[type=number] não exibe
      // vírgula. O teclado do celular continua sendo o numérico.
      type={casas === undefined ? "number" : "text"}
      inputMode={casas === undefined ? undefined : "decimal"}
      min={casas === undefined ? min : undefined}
      max={casas === undefined ? max : undefined}
      value={text}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={(event) => {
        // Com casas decimais o valor sobe ARREDONDADO, não só escrito
        // arredondado: digitar 2,675 num campo de dinheiro mostrava "2,68" e
        // guardava 2,675, então o preço calculado saía de um custo que não era
        // o que estava na tela.
        const bruto = settleOnBlur(text, fallback);
        const settled = clamp(casas === undefined ? bruto : arredondar(bruto, casas), min, max);
        reported.current = settled;
        setText(escrever(settled));
        onChange(settled);
        onBlur?.(event);
      }}
    />
  );
};

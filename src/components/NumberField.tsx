import React, { useEffect, useRef, useState } from "react";
import { clamp, displayValue, isPartialNumber, parseTyped, settleOnBlur } from "../number-input";

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
export const NumberField: React.FC<Props> = ({ value, onChange, fallback = 0, blankValue, min, max, onBlur, ...rest }) => {
  const escrever = (numero: number) => displayValue(numero, blankValue);
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
    // Um input[type=number] entrega "" para o que ele não consegue ler; o
    // teste de número parcial cobre o resto ("1,", "-").
    if (!isPartialNumber(raw)) return;
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
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={(event) => {
        const settled = clamp(settleOnBlur(text, fallback), min, max);
        reported.current = settled;
        setText(escrever(settled));
        onChange(settled);
        onBlur?.(event);
      }}
    />
  );
};

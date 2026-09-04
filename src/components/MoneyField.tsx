import React from "react";
import { formatTyped, isPartialNumber, normalizarColado, parseTyped } from "../number-input";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** O texto do campo. Estes campos guardam string, não número. */
  value: string;
  onChange: (value: string) => void;
  /** Casas decimais ao sair do campo. 2 para dinheiro e porcentagem. */
  casas?: number;
};

/**
 * Campo de dinheiro que assenta em "0,00" ao sair.
 *
 * Diferente do NumberField, este é para as telas que guardam o valor digitado
 * como TEXTO — mão de obra da OS, valor do serviço rápido, gasto, conta a
 * pagar. Trocar o estado dessas telas para número seria mexer em todo o caminho
 * de gravação delas; aqui só a escrita muda, e quem lê usa `valorDigitado`.
 *
 * Campo vazio continua vazio, e não "0,00": nesses lugares vazio quer dizer
 * "ainda não informado", e preencher com zero faria o formulário parecer pronto
 * quando não está.
 */
export const MoneyField: React.FC<Props> = ({ value, onChange, casas = 2, onBlur, ...rest }) => (
  <input
    {...rest}
    // Texto, e não input[type=number]: aquele tipo não mostra vírgula. O
    // teclado do celular continua sendo o numérico.
    type="text"
    inputMode="decimal"
    value={value}
    onChange={(event) => {
      // Barra a letra e deixa passar o número pela metade ("40," enquanto se
      // digita), que é o mesmo critério do NumberField.
      if (isPartialNumber(event.target.value)) return onChange(event.target.value);
      // Valor colado já formatado ("R$ 2.500,00"): antes o campo simplesmente
      // ignorava, e a pessoa não tinha como saber por quê.
      const colado = normalizarColado(event.target.value);
      if (colado) onChange(colado);
    }}
    onBlur={(event) => {
      // Devolve o TEXTO já formatado: assim o que quem lê (valorDigitado)
      // recebe é exatamente o número que está escrito na tela.
      const numero = parseTyped(value);
      onChange(numero === null ? "" : formatTyped(numero, casas));
      onBlur?.(event);
    }}
  />
);

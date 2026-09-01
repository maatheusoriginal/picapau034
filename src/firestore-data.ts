/**
 * Tira os campos `undefined` antes de gravar.
 *
 * O Firestore recusa o documento inteiro quando encontra um `undefined`
 * ("Unsupported field value: undefined"), e a gravação em lote é atômica: um
 * campo vazio derruba o registro todo. O formulário de gasto fazia exatamente
 * isso — `supplierId: expenseSupplierId || undefined` quando ninguém escolhia
 * fornecedor. Na tela o gasto aparecia lançado e o saldo caía; no banco não
 * havia nada. Quem recarregasse a página via o dinheiro de volta, com a nota
 * já paga.
 *
 * A limpeza fica aqui, no caminho da gravação, e não em cada formulário: é o
 * único lugar por onde tudo passa. Campo ausente é diferente de campo nulo — o
 * `merge: true` preserva o que já estava gravado, que é o comportamento certo
 * para "não informado".
 */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutUndefined(item)) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Date) && Object.getPrototypeOf(value) === Object.prototype) {
    const limpo: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      limpo[chave] = withoutUndefined(item);
    }
    return limpo as unknown as T;
  }
  return value;
}

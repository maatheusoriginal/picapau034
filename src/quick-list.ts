/**
 * Criar categoria e marca na hora, do lado do campo.
 *
 * Cadastrar uma peça e descobrir que a categoria dela não existe obrigava a
 * fechar o cadastro, ir em Configurações, criar a categoria, voltar e começar
 * de novo — perdendo o que já tinha sido digitado. Na prática ninguém faz
 * isso: joga em "Peças" e segue, e o filtro do estoque para de significar
 * alguma coisa.
 *
 * Aqui ficam só as regras. A tela usa `<QuickAddSelect>`.
 */
import { emMaiusculo } from "./text-case";

export type QuickAddResult = {
  /** A lista depois da inclusão. É a mesma quando nada mudou. */
  list: string[];
  /** O valor a deixar selecionado no campo. Vazio quando não deu para incluir. */
  value: string;
  status: "criado" | "existia" | "vazio";
};

/**
 * Inclui um nome numa lista do sistema.
 *
 * Nome repetido não vira item novo: devolve o que já existe e seleciona ele.
 * Sem isso a lista encheria de "MOTUL", "Motul" e "motul " — que é exatamente
 * o problema que a lista veio resolver.
 */
export function addToList(list: string[], nome: string): QuickAddResult {
  const limpo = emMaiusculo((nome ?? "").trim().replace(/\s+/g, " "));
  if (!limpo) return { list, value: "", status: "vazio" };
  const jaExiste = list.find((item) => emMaiusculo(item.trim()) === limpo);
  if (jaExiste) return { list, value: jaExiste, status: "existia" };
  // Entra no fim: a ordem das listas do sistema é escolhida em Configurações,
  // e reordenar sozinho mudaria o que aparece primeiro em todos os selects.
  return { list: [...list, limpo], value: limpo, status: "criado" };
}

/** O nome serve para virar item de lista? */
export function quickAddProblem(list: string[], nome: string): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "Digite o nome antes de criar.";
  if (limpo.length < 2) return "O nome precisa de pelo menos 2 letras.";
  if (list.some((item) => emMaiusculo(item.trim()) === emMaiusculo(limpo))) return `"${emMaiusculo(limpo)}" já está na lista.`;
  return "";
}

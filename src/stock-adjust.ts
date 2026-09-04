/**
 * Ajuste de estoque.
 *
 * O estoque só se mexia por compra, venda, OS, planilha ou XML. Não havia como
 * corrigir uma contagem — e contagem errada é o estado normal de um estoque:
 * peça que quebrou na bancada, peça que o cliente devolveu, óleo usado na
 * própria moto da oficina, item digitado com a quantidade errada, ou
 * simplesmente o saldo do dia em que se começou a usar o sistema.
 *
 * Sem esse caminho, quem precisa corrigir inventa uma compra que não existiu.
 * Aí o custo médio da peça muda, aparece uma entrada de fornecedor que ninguém
 * reconhece, e o relatório de compras do mês passa a mentir. O ajuste existe
 * para a correção não precisar se disfarçar de outra coisa.
 *
 * Por isso o motivo é obrigatório: ajuste sem motivo é indistinguível de erro,
 * e um estoque cheio de correções anônimas é um estoque em que ninguém confia.
 *
 * Funções puras: quem grava é a tela (ver scripts/check-stock-adjust.ts).
 */
import { round2 } from "./finance";

/** Os motivos que a oficina usa de verdade. */
export const motivosDeAjuste = [
  "Contagem de prateleira",
  "Perda, quebra ou vencimento",
  "Uso interno da oficina",
  "Devolução ao fornecedor",
  "Devolução de cliente",
  "Correção de lançamento",
  "Saldo inicial",
] as const;
export type MotivoDeAjuste = (typeof motivosDeAjuste)[number];

export type Ajuste = {
  productId: string;
  nome: string;
  /** O que o sistema achava que tinha. */
  saldoAtual: number;
  /** O que foi contado na prateleira. */
  contado: number;
  motivo: MotivoDeAjuste | "";
  observacao?: string;
  /** Custo unitário gravado no cadastro, para medir o impacto financeiro. */
  custoUnitario?: number;
};

/**
 * A peça que o leitor de código de barras acabou de bipar.
 *
 * Leitor é teclado: ele digita o código e dá Enter, às vezes com espaço ou
 * quebra de linha sobrando. Por isso a comparação é exata (depois de aparar):
 * uma busca "parecida" acertaria a peça errada numa contagem de prateleira, e
 * ninguém confere de novo o que o sistema disse que achou.
 *
 * O código de barras vem primeiro porque é o que o leitor manda; o código
 * interno da peça vale como segunda chance, para quem digita à mão.
 */
export function acharPorCodigo<T extends { code: string; barcode?: string }>(
  codigo: string,
  pecas: T[],
): T | null {
  const alvo = codigo.trim().toLocaleUpperCase("pt-BR");
  if (!alvo) return null;
  const igual = (valor: string | undefined) => (valor ?? "").trim().toLocaleUpperCase("pt-BR") === alvo;
  return pecas.find((peca) => igual(peca.barcode)) ?? pecas.find((peca) => igual(peca.code)) ?? null;
}

/**
 * Parece um código bipado, e não alguém procurando pelo nome?
 *
 * Um leitor manda um EAN de 8 ou 13 dígitos, ou o código interno da peça.
 * Serve para a tela decidir se, ao apertar Enter sem achar nada, avisa
 * "nenhuma peça com este código" — que é o que interessa numa contagem — ou
 * fica calada, porque a pessoa só estava digitando o começo de um nome.
 */
export function pareceCodigo(texto: string): boolean {
  const limpo = texto.trim();
  if (limpo.length < 4) return false;
  return /^[0-9]{4,}$/.test(limpo) || /^[A-Za-z]{2,4}-?[0-9]{3,}$/.test(limpo);
}

/** Quanto entra (positivo) ou sai (negativo) do estoque. */
export function diferencaDoAjuste(ajuste: Pick<Ajuste, "saldoAtual" | "contado">): number {
  return Math.round(ajuste.contado - ajuste.saldoAtual);
}

/**
 * O que impede o ajuste de ser gravado.
 *
 * Texto vazio quer dizer que pode gravar. Diferença zero é recusada de
 * propósito: gravar um ajuste que não muda nada só enche o histórico da peça de
 * linhas que não explicam nada.
 */
export function ajusteProblema(ajuste: Ajuste): string {
  if (!ajuste.productId) return "Escolha a peça que vai ser ajustada.";
  if (!Number.isFinite(ajuste.contado) || ajuste.contado < 0) return "A quantidade contada não pode ser negativa.";
  if (diferencaDoAjuste(ajuste) === 0) return "A quantidade contada é igual ao saldo atual: não há o que ajustar.";
  if (!ajuste.motivo) return "Escolha o motivo do ajuste.";
  // "Correção de lançamento" é a saída fácil de quem não quer explicar: sem
  // dizer qual lançamento, o ajuste vira um buraco no histórico.
  if (ajuste.motivo === "Correção de lançamento" && !(ajuste.observacao ?? "").trim()) {
    return "Diga qual lançamento está sendo corrigido.";
  }
  return "";
}

/** Quanto o ajuste vale em dinheiro, pelo custo da peça. */
export function valorDoAjuste(ajuste: Ajuste): number {
  return round2(diferencaDoAjuste(ajuste) * (ajuste.custoUnitario ?? 0));
}

/** Como o ajuste aparece escrito no histórico da peça. */
export function textoDoAjuste(ajuste: Ajuste): string {
  const diferenca = diferencaDoAjuste(ajuste);
  const sinal = diferenca > 0 ? "+" : "";
  const nota = (ajuste.observacao ?? "").trim();
  return `${sinal}${diferenca} un. · ${ajuste.motivo || "Sem motivo"}${nota ? ` · ${nota}` : ""}`;
}

export type ResumoDoAjuste = {
  /** Quantas peças entram na correção. */
  itens: number;
  /** Total de unidades que entram no estoque. */
  entram: number;
  /** Total de unidades que saem. */
  saem: number;
  /** Impacto em dinheiro, pelo custo: positivo quando o estoque vale mais. */
  valor: number;
};

/**
 * O que já conta para o resumo da tela: a linha tem peça e uma contagem
 * possível que muda o saldo. O motivo não entra aqui de propósito — ele vale
 * para o lote inteiro e é escolhido por último; se o resumo dependesse dele, a
 * pessoa contaria quatro óleos a menos e leria "Impacto R$ 0,00" na tela, como
 * se o sistema tivesse ignorado a contagem.
 */
function contaNoResumo(ajuste: Ajuste): boolean {
  if (!ajuste.productId) return false;
  if (!Number.isFinite(ajuste.contado) || ajuste.contado < 0) return false;
  return diferencaDoAjuste(ajuste) !== 0;
}

/**
 * O resumo que a tela mostra antes de confirmar.
 *
 * Só entram as linhas que mudam alguma coisa: somar uma linha de diferença zero
 * daria um total que não corresponde ao que vai ser gravado.
 */
export function resumoDoAjuste(ajustes: Ajuste[]): ResumoDoAjuste {
  const validos = ajustes.filter(contaNoResumo);
  return {
    itens: validos.length,
    entram: validos.reduce((soma, a) => soma + Math.max(0, diferencaDoAjuste(a)), 0),
    saem: validos.reduce((soma, a) => soma + Math.max(0, -diferencaDoAjuste(a)), 0),
    valor: round2(validos.reduce((soma, a) => soma + valorDoAjuste(a), 0)),
  };
}

/** As mudanças de saldo a gravar, no formato que o estoque já entende. */
export function saldosDoAjuste(ajustes: Ajuste[]): Array<{ productId: string; delta: number }> {
  return ajustes
    .filter((ajuste) => !ajusteProblema(ajuste))
    .map((ajuste) => ({ productId: ajuste.productId, delta: diferencaDoAjuste(ajuste) }));
}

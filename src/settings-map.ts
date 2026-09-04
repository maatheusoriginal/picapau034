/**
 * O mapa das Configurações.
 *
 * A tela tinha oito abas em pílulas que quebravam a linha: para achar onde se
 * muda a margem padrão era preciso abrir uma por uma, e quem não sabia o nome
 * da aba não achava nunca. Aqui as seções ficam descritas com as palavras que a
 * oficina usa — "margem", "sangria", "impressora", "frota" —, e a busca leva
 * direto à seção certa.
 *
 * Fica separado da tela porque é conteúdo que muda quando o sistema muda, e
 * assim `npm run check:settings-map` cobra que nenhuma seção fique órfã.
 */
export type SettingsSectionId =
  | "general" | "services" | "categories" | "payments"
  | "partners" | "stock" | "print" | "lists";

export type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  /** Uma linha dizendo o que se resolve aqui. */
  summary: string;
  /**
   * O que a pessoa digita quando procura isto.
   *
   * São as palavras da oficina, não os nomes técnicos: quem procura "margem"
   * não sabe que a margem mora em "Estoque & Reposição".
   */
  keywords: string[];
};

export const settingsSections: SettingsSection[] = [
  {
    id: "general",
    title: "Oficina e OS",
    summary: "Nome, CNPJ, endereço e como a ordem de serviço é numerada.",
    keywords: ["nome da oficina", "razão social", "cnpj", "endereço", "telefone", "whatsapp da oficina", "logo", "numeração", "número da os", "prefixo", "prazo de entrega", "garantia", "dados da empresa"],
  },
  {
    id: "services",
    title: "Serviços rápidos",
    summary: "Troca de óleo, lâmpada e ajustes fechados na hora, com preço e tempo.",
    keywords: ["serviço rápido", "troca de óleo", "mão de obra", "preço do serviço", "duração", "tempo", "expresso", "balcão"],
  },
  {
    id: "categories",
    title: "Categorias",
    summary: "Como as peças e os serviços são agrupados no estoque e nos relatórios.",
    keywords: ["categoria", "grupo", "agrupar", "filtro do estoque", "tipo de peça", "classificação"],
  },
  {
    id: "payments",
    title: "Pagamentos e taxas",
    summary: "Formas de pagamento, máquinas de cartão e a taxa de cada bandeira.",
    keywords: ["forma de pagamento", "dinheiro", "pix", "cartão", "crédito", "débito", "maquininha", "máquina", "taxa", "bandeira", "parcelamento", "prazo de recebimento"],
  },
  {
    id: "partners",
    title: "Parceiros e frotas",
    summary: "Empresas que mandam moto e pagam na fatura do mês, com o desconto combinado.",
    keywords: ["parceiro", "parceira", "frota", "empresa", "aplicativo", "entrega", "faturado", "fatura mensal", "desconto na mão de obra", "locadora"],
  },
  {
    id: "stock",
    title: "Estoque e reposição",
    summary: "Margem padrão, modo de preço, estoque mínimo e unidade das peças.",
    keywords: ["margem", "markup", "lucro", "preço de venda", "custo médio", "último preço", "estoque mínimo", "reposição", "unidade", "precificação", "como o preço é calculado"],
  },
  {
    id: "print",
    title: "Impressão e WhatsApp",
    summary: "Impressora do balcão, o que sai no cupom e a mensagem enviada ao cliente.",
    keywords: ["impressora", "imprimir", "cupom", "térmica", "80mm", "58mm", "papel", "whatsapp", "mensagem", "orçamento por whatsapp", "comprovante"],
  },
  {
    id: "lists",
    title: "Listas do sistema",
    summary: "Marcas de moto e de peça, unidades, prioridades e níveis de combustível.",
    keywords: ["marca de moto", "marca de peça", "unidade", "prioridade", "combustível", "contas", "caixa", "listas", "opções dos campos"],
  },
];

/** A seção pedida, ou nada. */
export function settingsSection(id: string): SettingsSection | null {
  return settingsSections.find((secao) => secao.id === id) ?? null;
}

/**
 * As seções que casam com o que foi digitado.
 *
 * Procura no título, no resumo e nas palavras da oficina — é o que faz
 * "margem" achar "Estoque e reposição", que é o nome que ninguém adivinharia.
 */
export function searchSettings(termo: string): SettingsSection[] {
  const busca = normalizar(termo);
  if (busca.length < 2) return settingsSections;
  // Palavra por palavra, e todas precisam bater: quem digita "taxa cartão"
  // está procurando a taxa DO cartão, e exigir a frase inteira na mesma ordem
  // faria a busca falhar justamente em quem sabe o que quer.
  // "de", "do", "da" e afins saem: são o jeito de falar, não o que se procura,
  // e exigir que apareçam reprovaria "taxa do cartão" por causa do "do".
  const LIGACOES = new Set(["de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "em", "no", "na", "para", "por", "com"]);
  const palavras = busca.split(/\s+/).filter((palavra) => palavra && !LIGACOES.has(palavra));
  if (!palavras.length) return settingsSections;
  return settingsSections.filter((secao) => {
    const texto = normalizar(`${secao.title} ${secao.summary} ${secao.keywords.join(" ")}`);
    return palavras.every((palavra) => texto.includes(palavra));
  });
}

/**
 * Tira o acento para comparar.
 *
 * Ninguém digita "combustível" com acento no meio do atendimento, e recusar a
 * busca por causa disso é o mesmo que não ter busca.
 */
function normalizar(valor: string): string {
  return (valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

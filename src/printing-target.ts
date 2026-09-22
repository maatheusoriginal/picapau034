/**
 * Por onde o cupom vai para a impressora.
 *
 * O jeito bom no computador é uma moldura escondida (iframe): o cupom sai com
 * o CSS dele — 80mm, monoespaçada — sem herdar nada da tela, e ninguém vê
 * nada acontecer. Foi assim que a impressão do balcão sempre funcionou.
 *
 * NO CELULAR ISSO NÃO VALE. O serviço de impressão do Android não imprime a
 * moldura escondida: ele imprime a página de cima. A oficina viu na prática —
 * pediu as três vias de uma OS e saiu a TELA DO SISTEMA, com menu e botões, em
 * vez do cupom. O navegador recebe a ordem certa e imprime outra coisa.
 *
 * Então no telefone o cupom vai para uma JANELA PRÓPRIA. Sendo ele o documento
 * de topo dessa janela, não existe moldura para o Android ignorar: o que está
 * na tela é o que sai no papel.
 *
 * Aqui fica só a decisão, que é pura e conferida por `npm run check:printing`.
 * Quem abre janela e chama a impressora é o app/printing.ts.
 */
export type PrintTarget = "moldura" | "janela";

/**
 * O telefone é reconhecido pelo que o navegador se diz.
 *
 * Não dá para perguntar ao navegador se ele vai imprimir a moldura direito —
 * não existe essa pergunta. O que existe é a plataforma, e é ela que decide.
 *
 * Tablet entra junto de propósito: o iPad e o Android de tela grande usam o
 * mesmo serviço de impressão do celular. Na dúvida, a janela própria é a opção
 * SEGURA — ela imprime o cupom certo em todo lugar, e só custa uma aba que
 * abre e fecha. A moldura é que só funciona no computador.
 */
export function printTarget(userAgent: string): PrintTarget {
  const agente = String(userAgent || "").toLowerCase();
  if (!agente) return "moldura";
  // "Mobile" cobre o Firefox e o Chrome do Android; os outros nomes cobrem o
  // iPhone, o iPad e o Android que não escreve "Mobile" (tablet em modo
  // desktop escreve "Macintosh", e esse a gente perde — é o preço de não ter
  // uma pergunta melhor).
  const celular = ["android", "iphone", "ipad", "ipod", "mobile", "silk", "opera mini"];
  return celular.some((marca) => agente.includes(marca)) ? "janela" : "moldura";
}

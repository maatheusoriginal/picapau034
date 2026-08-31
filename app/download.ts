/**
 * Entrega um arquivo para a pessoa salvar.
 *
 * Fica separado da tela pelo mesmo motivo de `printing.ts`: é manipulação
 * direta do DOM, e misturar isso com a lógica da tela torna as duas coisas
 * mais difíceis de entender.
 */
export function downloadFile(name: string, content: string, type = "application/json;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revogar na hora cortaria o download em alguns navegadores; um instante
  // depois é o suficiente e não deixa a memória presa.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

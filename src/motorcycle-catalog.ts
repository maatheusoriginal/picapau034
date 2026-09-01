/**
 * Catálogo de motos por marca, modelo e versão.
 *
 * O cadastro pedia a marca numa lista e o modelo em texto livre. Na prática a
 * mesma moto entrava como "CG 160 Fan", "cg160 fan", "CG FAN 160" e "Honda CG
 * 160" — e aí o histórico da moto, a busca por modelo e qualquer contagem de
 * "quais motos mais atendemos" param de funcionar.
 *
 * A lista cobre o que roda em oficina de bairro no Brasil. Não é exaustiva de
 * propósito: quem tiver uma moto fora dela escolhe "Outro" e digita, e o texto
 * digitado é gravado igual. Marca nova é cadastrada em Configurações → Listas
 * do sistema.
 */

export type ModelEntry = {
  /** Nome do modelo como a oficina fala ("CG 160"). */
  model: string;
  /** Versões daquele modelo. Vazio quando o modelo não tem variação relevante. */
  versions: string[];
};

export const motorcycleCatalog: Record<string, ModelEntry[]> = {
  Honda: [
    { model: "CG 160", versions: ["Fan", "Start", "Titan", "Titan S", "Cargo"] },
    { model: "CG 125", versions: ["Fan", "Cargo"] },
    { model: "Biz", versions: ["110i", "125", "125 ES"] },
    { model: "Pop", versions: ["110i", "100"] },
    { model: "NXR 160 Bros", versions: ["ESDD", "Adventure"] },
    { model: "XRE", versions: ["190", "300", "300 Sahara", "300 Rally"] },
    { model: "CB", versions: ["250F Twister", "300F Twister", "500F", "500X", "650F", "1000R"] },
    { model: "PCX", versions: ["160", "160 DLX"] },
    { model: "Elite", versions: ["125"] },
    { model: "ADV", versions: ["150", "350"] },
    { model: "Sahara", versions: ["300 Rally"] },
    { model: "Hornet", versions: ["600", "750"] },
  ],
  Yamaha: [
    { model: "Factor", versions: ["125i", "150i ED", "150i UBS"] },
    { model: "Fazer", versions: ["150", "250", "250 ABS"] },
    { model: "Crosser", versions: ["150 S", "150 Z"] },
    { model: "Lander", versions: ["250"] },
    { model: "NMax", versions: ["160", "160 ABS"] },
    { model: "Neo", versions: ["125"] },
    { model: "Crypton", versions: ["115"] },
    { model: "MT", versions: ["03", "07", "09", "03 ABS"] },
    { model: "R3", versions: ["321"] },
    { model: "XTZ", versions: ["150 Crosser", "250 Lander", "250 Ténéré"] },
    { model: "Fluo", versions: ["125"] },
  ],
  Suzuki: [
    { model: "Yes", versions: ["125"] },
    { model: "Intruder", versions: ["125"] },
    { model: "Burgman", versions: ["125", "400"] },
    { model: "GSX-S", versions: ["750", "1000"] },
    { model: "V-Strom", versions: ["650", "1000"] },
    { model: "GSR", versions: ["150i"] },
  ],
  Kawasaki: [
    { model: "Ninja", versions: ["300", "400", "650", "ZX-10R"] },
    { model: "Z", versions: ["400", "650", "900", "1000"] },
    { model: "Versys", versions: ["650", "1000"] },
  ],
  Haojue: [
    { model: "DK", versions: ["150", "160"] },
    { model: "DR", versions: ["160"] },
    { model: "Chopper Road", versions: ["150"] },
    { model: "Master Ride", versions: ["150"] },
    { model: "NK", versions: ["150"] },
  ],
  Dafra: [
    { model: "Citycom", versions: ["300"] },
    { model: "Horizon", versions: ["150"] },
    { model: "NH", versions: ["190", "300"] },
    { model: "Next", versions: ["250", "300"] },
    { model: "Apache", versions: ["200"] },
  ],
  Shineray: [
    { model: "Jet", versions: ["50"] },
    { model: "Phoenix", versions: ["50"] },
    { model: "XY", versions: ["50Q", "125"] },
    { model: "Worker", versions: ["125"] },
  ],
  "Royal Enfield": [
    { model: "Meteor", versions: ["350"] },
    { model: "Classic", versions: ["350"] },
    { model: "Hunter", versions: ["350"] },
    { model: "Himalayan", versions: ["411", "450"] },
  ],
  BMW: [
    { model: "G", versions: ["310 R", "310 GS"] },
    { model: "F", versions: ["750 GS", "850 GS", "900 R"] },
    { model: "R", versions: ["1250 GS", "1250 RT"] },
    { model: "S", versions: ["1000 RR"] },
  ],
  Triumph: [
    { model: "Street Triple", versions: ["765 R", "765 RS"] },
    { model: "Trident", versions: ["660"] },
    { model: "Tiger", versions: ["660", "900", "1200"] },
    { model: "Bonneville", versions: ["T100", "T120"] },
  ],
  "Harley-Davidson": [
    { model: "Iron", versions: ["883"] },
    { model: "Sportster", versions: ["S", "1200"] },
    { model: "Fat Bob", versions: ["114"] },
  ],
};

/** Marcas que o catálogo conhece, em ordem alfabética. */
export function catalogBrands(): string[] {
  return Object.keys(motorcycleCatalog).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Modelos de uma marca. Marca desconhecida devolve lista vazia, não erro. */
export function modelsOf(brand: string): string[] {
  return (motorcycleCatalog[brand] ?? []).map((entry) => entry.model);
}

/** Versões de um modelo dentro de uma marca. */
export function versionsOf(brand: string, model: string): string[] {
  return (motorcycleCatalog[brand] ?? []).find((entry) => entry.model === model)?.versions ?? [];
}

/**
 * O modelo como fica gravado: "CG 160 Fan".
 *
 * O campo `model` do cadastro é um texto só — é o que a OS imprime, o que a
 * busca procura e o que aparece na lista. Juntar aqui, em um lugar só, evita
 * cada tela montar esse texto do seu jeito.
 */
export function fullModelName(model: string, version: string): string {
  const nome = (model ?? "").trim();
  const variante = (version ?? "").trim();
  if (!nome) return variante;
  if (!variante || nome.endsWith(` ${variante}`)) return nome;
  return `${nome} ${variante}`;
}

/**
 * Separa um modelo já gravado de volta em modelo e versão, para o formulário
 * abrir com as listas certas ao editar uma moto cadastrada antes disto.
 */
export function splitModelName(brand: string, saved: string): { model: string; version: string } {
  const texto = (saved ?? "").trim();
  if (!texto) return { model: "", version: "" };
  const entradas = motorcycleCatalog[brand] ?? [];
  // O modelo mais longo primeiro: sem isso "CB" casaria antes de "CB 500F" e a
  // versão sairia errada.
  const ordenadas = [...entradas].sort((a, b) => b.model.length - a.model.length);
  for (const entrada of ordenadas) {
    if (texto === entrada.model) return { model: entrada.model, version: "" };
    if (texto.startsWith(`${entrada.model} `)) {
      const resto = texto.slice(entrada.model.length + 1).trim();
      if (entrada.versions.includes(resto)) return { model: entrada.model, version: resto };
      return { model: entrada.model, version: resto };
    }
  }
  return { model: "", version: "" };
}

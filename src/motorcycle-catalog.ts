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
    { model: "CG 125", versions: ["Fan", "Fan KS", "Fan ES", "Titan", "Titan KS", "Titan ES", "Cargo", "Job", "ML"] },
    { model: "CG 150", versions: ["Titan", "Titan KS", "Titan ES", "Titan EX", "Titan Mix", "Sport", "Fan", "Fan ESI", "Job", "ESD"] },
    { model: "CG 160", versions: ["Fan", "Fan ESDI", "Start", "Titan", "Titan S", "Cargo"] },
    { model: "Biz", versions: ["100", "110i", "125", "125 KS", "125 ES", "125+"] },
    { model: "Pop", versions: ["100", "110i"] },
    { model: "NXR Bros", versions: ["125", "150", "150 ES", "160", "160 ESDD", "160 Adventure"] },
    { model: "XRE", versions: ["190", "190 Adventure", "300", "300 Sahara", "300 Rally", "300 ABS"] },
    { model: "XLR", versions: ["125"] },
    { model: "CBX", versions: ["150 Aero", "200 Strada", "250 Twister"] },
    { model: "CB", versions: ["250F Twister", "300R", "300F Twister", "500F", "500X", "500R", "600F Hornet", "650F", "650R", "1000R"] },
    { model: "NX", versions: ["150", "200", "350 Sahara", "400 Falcon", "500"] },
    { model: "XR", versions: ["200R", "250 Tornado"] },
    { model: "PCX", versions: ["150", "160", "160 DLX"] },
    { model: "Lead", versions: ["110"] },
    { model: "Elite", versions: ["125"] },
    { model: "ADV", versions: ["150", "350"] },
    { model: "SH", versions: ["300i"] },
    { model: "Shadow", versions: ["600", "750"] },
    { model: "Africa Twin", versions: ["1100"] },
    { model: "Dream", versions: ["100"] },
  ],
  Yamaha: [
    { model: "YBR", versions: ["125 K", "125 E", "125 ED", "125 Factor K", "125 Factor E", "150 Factor"] },
    { model: "Factor", versions: ["125 ED", "125i", "150 ED", "150 UBS", "150i"] },
    { model: "XTZ", versions: ["125", "125 E", "150 Crosser", "250 Lander", "250 Ténéré", "660 Ténéré"] },
    { model: "Crosser", versions: ["150 S", "150 Z", "150 ABS"] },
    { model: "Lander", versions: ["250", "250 ABS"] },
    { model: "Ténéré", versions: ["250", "700"] },
    { model: "Crypton", versions: ["100", "105", "115", "115 ED"] },
    { model: "Neo", versions: ["115", "125", "125 UBS"] },
    { model: "Fazer", versions: ["150", "150 SED", "250", "250 ABS", "250 BlueFlex", "600"] },
    { model: "MT", versions: ["03", "07", "09", "15", "10"] },
    { model: "R3", versions: ["321"] },
    { model: "R15", versions: ["155"] },
    { model: "XJ6", versions: ["N", "F"] },
    { model: "NMax", versions: ["160", "160 ABS", "160 Connected"] },
    { model: "Fluo", versions: ["125"] },
    { model: "DT", versions: ["180", "200"] },
    { model: "RD", versions: ["135", "350"] },
    { model: "Virago", versions: ["250"] },
    { model: "Midnight Star", versions: ["950"] },
    { model: "XMax", versions: ["250"] },
  ],
  Suzuki: [
    { model: "Yes", versions: ["125", "125 SE"] },
    { model: "Intruder", versions: ["125", "250"] },
    { model: "Burgman", versions: ["125", "125i", "400"] },
    { model: "GSR", versions: ["150i"] },
    { model: "GSX-S", versions: ["125", "750", "1000"] },
    { model: "GSX-R", versions: ["750", "1000"] },
    { model: "V-Strom", versions: ["650", "1000", "1050"] },
    { model: "Bandit", versions: ["600", "650", "1250"] },
    { model: "DR", versions: ["650", "800"] },
    { model: "Hayabusa", versions: ["1300"] },
  ],
  Kawasaki: [
    { model: "Ninja", versions: ["250", "300", "400", "650", "1000", "ZX-6R", "ZX-10R"] },
    { model: "Z", versions: ["300", "400", "650", "750", "800", "900", "1000"] },
    { model: "Versys", versions: ["300", "650", "1000"] },
    { model: "Vulcan", versions: ["S", "900"] },
    { model: "KLX", versions: ["230"] },
  ],
  Haojue: [
    { model: "DK", versions: ["150", "160"] },
    { model: "DR", versions: ["160", "300"] },
    { model: "Chopper Road", versions: ["150"] },
    { model: "Master Ride", versions: ["150"] },
    { model: "NK", versions: ["150"] },
  ],
  Dafra: [
    { model: "Apache", versions: ["150", "200", "RTR 200"] },
    { model: "Citycom", versions: ["300", "300i"] },
    { model: "Horizon", versions: ["150"] },
    { model: "Kansas", versions: ["150", "250"] },
    { model: "Laser", versions: ["150"] },
    { model: "Next", versions: ["250", "300"] },
    { model: "NH", versions: ["190", "300"] },
    { model: "Riva", versions: ["150"] },
    { model: "Speed", versions: ["150"] },
    { model: "Super", versions: ["100"] },
    { model: "Zig", versions: ["50", "100"] },
  ],
  Shineray: [
    { model: "Jet", versions: ["50"] },
    { model: "Phoenix", versions: ["50"] },
    { model: "XY", versions: ["50Q", "125", "150"] },
    { model: "Worker", versions: ["125"] },
    { model: "SHI", versions: ["175"] },
    { model: "Discover", versions: ["125"] },
  ],
  Traxx: [
    { model: "Star", versions: ["50"] },
    { model: "Work", versions: ["125"] },
    { model: "JH", versions: ["125"] },
    { model: "Fly", versions: ["150"] },
    { model: "Sky", versions: ["125"] },
  ],
  Kasinski: [
    { model: "Mirage", versions: ["150", "250"] },
    { model: "Comet", versions: ["150", "250"] },
    { model: "Prima", versions: ["150"] },
    { model: "Win", versions: ["110"] },
    { model: "Seta", versions: ["125"] },
  ],
  Sundown: [
    { model: "Web", versions: ["100"] },
    { model: "Hunter", versions: ["90", "125"] },
    { model: "Future", versions: ["125"] },
    { model: "Max", versions: ["125"] },
    { model: "STX", versions: ["200"] },
  ],
  "Royal Enfield": [
    { model: "Meteor", versions: ["350"] },
    { model: "Classic", versions: ["350"] },
    { model: "Hunter", versions: ["350"] },
    { model: "Himalayan", versions: ["411", "450"] },
    { model: "Interceptor", versions: ["650"] },
  ],
  BMW: [
    { model: "G", versions: ["310 R", "310 GS"] },
    { model: "F", versions: ["750 GS", "800 GS", "850 GS", "900 R", "900 XR"] },
    { model: "R", versions: ["1200 GS", "1250 GS", "1250 RT"] },
    { model: "S", versions: ["1000 RR", "1000 XR"] },
  ],
  Triumph: [
    { model: "Street Triple", versions: ["765 R", "765 RS"] },
    { model: "Trident", versions: ["660"] },
    { model: "Tiger", versions: ["660", "800", "900", "1200"] },
    { model: "Bonneville", versions: ["T100", "T120"] },
    { model: "Speed Triple", versions: ["1200"] },
  ],
  "Harley-Davidson": [
    { model: "Iron", versions: ["883"] },
    { model: "Sportster", versions: ["S", "883", "1200"] },
    { model: "Fat Bob", versions: ["114"] },
    { model: "Softail", versions: ["Standard", "Heritage"] },
  ],
  KTM: [
    { model: "Duke", versions: ["200", "250", "390", "790", "890"] },
    { model: "Adventure", versions: ["390", "790", "890", "1290"] },
    { model: "RC", versions: ["390"] },
  ],
  Ducati: [
    { model: "Monster", versions: ["797", "821", "937"] },
    { model: "Multistrada", versions: ["950", "V4"] },
    { model: "Panigale", versions: ["V2", "V4"] },
    { model: "Scrambler", versions: ["Icon", "Desert Sled"] },
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

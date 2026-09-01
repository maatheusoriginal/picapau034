/**
 * Procura hooks declarados DEPOIS de um return antecipado dentro do mesmo
 * componente — o defeito que derrubava a aba com
 * "Rendered more hooks than during the previous render".
 *
 * A profundidade de chaves é contada caractere a caractere para não se perder
 * com a lista de props em várias linhas (`}) {`) nem com JSX.
 */
import { readFileSync, globSync } from "node:fs";

const HOOK = /(?:^|[^.\w])use(?:State|Memo|Effect|LayoutEffect|Ref|Callback|Reducer|Context|Transition|Id|DeferredValue)\s*\(/;
const arquivos = globSync("{app,src}/**/*.tsx").sort();
let problemas = 0;

for (const arquivo of arquivos) {
  const texto = readFileSync(arquivo, "utf8");
  const linhas = texto.split("\n");

  // Profundidade de chaves no início de cada linha.
  const profundidade = new Array(linhas.length).fill(0);
  let d = 0, emString = "", emComentario = false;
  for (let i = 0; i < linhas.length; i += 1) {
    profundidade[i] = d;
    const linha = linhas[i];
    for (let c = 0; c < linha.length; c += 1) {
      const ch = linha[c], prox = linha[c + 1];
      if (emComentario) { if (ch === "*" && prox === "/") { emComentario = false; c += 1; } continue; }
      if (emString) { if (ch === "\\") { c += 1; continue; } if (ch === emString) emString = ""; continue; }
      if (ch === "/" && prox === "*") { emComentario = true; c += 1; continue; }
      if (ch === "/" && prox === "/") break;
      if (ch === '"' || ch === "'" || ch === "`") { emString = ch; continue; }
      if (ch === "{") d += 1;
      else if (ch === "}") d -= 1;
    }
  }

  // Componentes: função com nome em maiúscula.
  const inicios: number[] = [];
  linhas.forEach((linha, i) => {
    if (/^(export\s+)?(default\s+)?function\s+[A-Z]\w*/.test(linha) ||
        /^(export\s+)?const\s+[A-Z]\w*\s*(:[^=]*)?=\s*(\([^)]*\)|\w+)\s*(:[^=]*)?=>/.test(linha)) {
      inicios.push(i);
    }
  });

  for (let n = 0; n < inicios.length; n += 1) {
    const inicio = inicios[n];
    const fim = n + 1 < inicios.length ? inicios[n + 1] : linhas.length;
    const base = profundidade[inicio]; // 0 no topo do arquivo
    const corpo = base + 1;            // dentro do corpo da função
    let retorno = 0;
    for (let i = inicio + 1; i < fim; i += 1) {
      if (profundidade[i] < corpo) break; // saiu da função
      const linha = linhas[i];
      // Return antecipado: só conta o que está no corpo do componente. Um
      // `return` dentro de um .map/.filter ou de um callback está mais fundo e
      // não muda a contagem de hooks.
      if (!retorno && profundidade[i] === corpo && /^\s*if\s*\(/.test(linha)) {
        if (/\breturn\b/.test(linha)) retorno = i + 1;
        else {
          for (let j = i + 1; j < fim && profundidade[j] > corpo; j += 1) {
            if (profundidade[j] === corpo + 1 && /^\s*return\b/.test(linhas[j])) { retorno = j + 1; break; }
          }
        }
      }
      if (retorno && profundidade[i] === corpo && /^\s*(const|let)\s/.test(linha) && HOOK.test(linha)) {
        console.log(`FALHA ${arquivo}:${i + 1} — hook depois do return antecipado da linha ${retorno}`);
        console.log(`      componente: ${linhas[inicio].trim().slice(0, 70)}`);
        console.log(`      ${linha.trim().slice(0, 100)}`);
        problemas += 1;
      }
    }
  }
}
console.log(problemas === 0 ? "\nNenhum hook depois de return antecipado." : `\n${problemas} hook(s) em posição instável.`);
process.exit(problemas === 0 ? 0 : 1);

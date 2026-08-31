/**
 * Confere se as funções da Vercel conseguem carregar.
 *
 * O projeto é ESM ("type": "module"). Nesse modo o Node exige a extensão .js
 * nos imports entre arquivos, e a Vercel compila as funções sem empacotá-las —
 * então um import sem extensão passa no typecheck, passa no build, sobe, e só
 * quebra quando alguém abre a tela: ERR_MODULE_NOT_FOUND, HTTP 500.
 *
 * Foi exatamente o que aconteceu: /api/health funcionava (não importa nada em
 * tempo de execução) e /api/admin/users derrubava a função. Nenhuma verificação
 * local pegava isso, porque `tsx` e o Vite resolvem sem extensão.
 *
 * Rode com: npm run check:api-imports
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");

/** Todo arquivo .ts dentro de uma pasta, recursivamente. */
function arquivos(pasta: string): string[] {
  const alvo = join(raiz, pasta);
  try { statSync(alvo); } catch { return []; }
  return readdirSync(alvo, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? arquivos(join(pasta, item.name))
      : item.name.endsWith(".ts") ? [join(pasta, item.name)] : []);
}

// Só o que a Vercel publica como função e o que essas funções alcançam.
const vigiados = [...arquivos("api"), ...arquivos("server")];
const IMPORT = /from\s+"((?:\.\.?\/)[^"]*)"/g;

const semExtensao: string[] = [];
const quebrados: string[] = [];

for (const arquivo of vigiados) {
  const conteudo = readFileSync(join(raiz, arquivo), "utf8");
  for (const achado of conteudo.matchAll(IMPORT)) {
    const alvo = achado[1]!;
    if (!alvo.endsWith(".js")) { semExtensao.push(`${arquivo} → ${alvo}`); continue; }
    // A extensão sozinha não basta: o arquivo tem que existir de verdade.
    const real = join(dirname(join(raiz, arquivo)), alvo.replace(/\.js$/, ".ts"));
    try { statSync(real); } catch { quebrados.push(`${arquivo} → ${alvo}`); }
  }
}

const casos: Array<[string, unknown, unknown]> = [
  ["há funções e handlers para conferir", vigiados.length > 0, true],
  ["todo import relativo tem extensão .js", semExtensao.join(" | "), ""],
  ["todo import aponta para um arquivo existente", quebrados.join(" | "), ""],
];

let falhas = 0;
for (const [nome, obtido, esperado] of casos) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${ok ? "" : `: ${obtido}`}`);
}
console.log(falhas === 0
  ? `\n${vigiados.length} arquivo(s) conferidos: as funções carregam.`
  : `\n${falhas} problema(s). Sem a extensão .js o Node derruba a função em produção.`);
process.exit(falhas === 0 ? 0 : 1);

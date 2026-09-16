/**
 * O que o navegador baixa ANTES de o sistema aparecer na tela.
 *
 * Esta conferência existe por causa de um defeito que passou despercebido: a
 * biblioteca de PDF tinha pedaço próprio justamente para só descer no clique
 * de "Baixar PDF", mas um trecho minúsculo do empacotador foi parar dentro
 * desse pedaço — e o index.html passou a pré-carregar os 451 kB inteiros em
 * toda abertura do sistema. Tudo continuava funcionando, os testes passavam, o
 * pedaço estava lá separadinho na listagem do build. Só que o celular do
 * mecânico, no 4G da oficina, pagava a conta toda manhã.
 *
 * Defeito de peso não aparece sozinho: ninguém abre o index.html para conferir
 * qual <link rel="modulepreload"> entrou. Então a regra fica escrita aqui.
 *
 * Rode com: npm run check:bundle
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SAIDA = "dist-bundle-check";

/** O que PODE descer na abertura, e o teto de cada um em kB. */
const PERMITIDOS: Array<{ nome: string; teto: number }> = [
  { nome: "react", teto: 200 },
  { nome: "vendor", teto: 400 },
  { nome: "firebase", teto: 600 },
];

/** O que NUNCA pode descer na abertura: só no clique de quem precisa. */
const SOB_DEMANDA = ["pdf"];

function main() {
  execFileSync("npx", ["vite", "build", "--outDir", SAIDA], { stdio: "pipe" });

  const html = readFileSync(join(SAIDA, "index.html"), "utf8");
  const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([A-Za-z0-9._-]+)\.js"/g)]
    .map((achado) => achado[1]);
  // O nome do arquivo carrega um sufixo de versão: "vendor-B3OG8DWk".
  const familia = (arquivo: string) => arquivo.replace(/-[A-Za-z0-9_-]{8,}$/, "");
  const naAbertura = preloads.map(familia);

  const tamanhoKb = (familiaBuscada: string) => {
    const pasta = join(SAIDA, "assets");
    const arquivo = readdirSync(pasta).find((nome) => nome.endsWith(".js") && familia(nome.replace(/\.js$/, "")) === familiaBuscada);
    return arquivo ? Math.round(statSync(join(pasta, arquivo)).size / 1024) : 0;
  };

  const casos: Array<[string, unknown, unknown]> = [];

  for (const proibido of SOB_DEMANDA) {
    casos.push([
      `o pedaço "${proibido}" (${tamanhoKb(proibido)} kB) NÃO desce na abertura do sistema`,
      naAbertura.includes(proibido),
      false,
    ]);
  }

  for (const { nome, teto } of PERMITIDOS) {
    const kb = tamanhoKb(nome);
    casos.push([`o pedaço "${nome}" continua existindo`, kb > 0, true]);
    casos.push([`e cabe no teto: ${kb} kB de no máximo ${teto} kB`, kb <= teto, true]);
  }

  // Um pedaço novo e pesado no carregamento inicial é a mesma classe de
  // defeito com outro nome, então a lista acima é fechada.
  const inesperados = naAbertura.filter((nome) => !PERMITIDOS.some((p) => p.nome === nome));
  casos.push([
    `nada além do previsto desce na abertura${inesperados.length ? ` (apareceu: ${inesperados.join(", ")})` : ""}`,
    inesperados.length,
    0,
  ]);

  let falhas = 0;
  for (const [nome, obtido, esperado] of casos) {
    const ok = obtido === esperado;
    if (!ok) falhas += 1;
    console.log(`${ok ? "OK  " : "FALHA"} ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
  }
  rmSync(SAIDA, { recursive: true, force: true });
  console.log(falhas === 0
    ? `\nA abertura do sistema baixa só o necessário: ${naAbertura.join(", ")}.`
    : `\n${falhas} caso(s) errados.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();

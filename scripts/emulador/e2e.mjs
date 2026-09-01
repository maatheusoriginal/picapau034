/**
 * Teste ponta a ponta do sistema inteiro, contra um Firestore de verdade.
 *
 * Os `npm run check:*` conferem contas em funções puras — não provam que a tela
 * grava no banco. Este roteiro abre o navegador de verdade e faz o que a oficina
 * faz num dia: abre o caixa, cadastra uma peça, vende no balcão com desconto,
 * abre uma OS completa, tira uma sangria, fecha o caixa conferindo, e passa por
 * todas as abas e formulários procurando tela quebrada. Cada resultado é
 * conferido no Firestore, não no texto da tela.
 *
 * Antes de rodar, em dois terminais:
 *   npx -y firebase-tools emulators:start --project picapau-teste
 *   npm run dev:emulador
 *
 * Depois:
 *   node scripts/emulador/e2e.mjs /caminho/para/as/fotos
 */
import { execSync } from "node:child_process";

// O playwright-core não é dependência do projeto: são centenas de megabytes que
// só servem para este roteiro e atrasariam a instalação na Vercel.
let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch { console.error("Falta o navegador do teste. Rode antes:\n\n  npm i --no-save playwright-core\n"); process.exit(1); }
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? AQUI;
const GRUPO = { "Ordens de serviço":"Oficina","Orçamentos":"Oficina","PDV Balcão":"Balcão","Serviço rápido":"Balcão",
  "Vendas do balcão":"Balcão","Produtos e estoque":"Estoque","Compras e entradas":"Estoque","Fornecedores":"Estoque",
  "Clientes":"Cadastros","Motocicletas":"Cadastros","Funcionários":"Cadastros","Financeiro":"Gestão",
  "Contas a receber":"Gestão","Contas a pagar":"Gestão","Relatórios":"Gestão" };

// Banco limpo a cada execução: teste que depende do estado anterior não vale nada.
await fetch("http://127.0.0.1:8080/emulator/v1/projects/picapau-teste/databases/(default)/documents", { method: "DELETE" });
execSync(`node ${JSON.stringify(join(AQUI, "semear.mjs"))}`, { stdio: "pipe" });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1360, height: 950 } });
const erros = [];
p.on("pageerror", (e) => erros.push("PAGEERROR: " + String(e).split("\n")[0]));
p.on("console", (m) => { if (m.type() === "error") erros.push("CONSOLE: " + m.text().split("\n")[0].slice(0, 220)); });

let n = 0, falhas = 0;
const foto = async (s) => { n++; await p.screenshot({ path: `${OUT}/e2e-${String(n).padStart(2,"0")}-${s}.png`, fullPage: true }); };
const txt = () => p.evaluate(() => document.body.innerText);
// A conferência de verdade é no banco: a tela pode mostrar o que quiser.
const banco = async (colecao) => {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/picapau-teste/databases/(default)/documents/${colecao}?pageSize=300`,
    { headers: { Authorization: "Bearer owner" } });
  const j = await r.json();
  const plano = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => {
    const [tipo, valor] = Object.entries(v)[0];
    if (tipo === "integerValue") return [k, Number(valor)];
    if (tipo === "doubleValue") return [k, Number(valor)];
    if (tipo === "mapValue") return [k, plano(valor.fields)];
    if (tipo === "arrayValue") return [k, (valor.values || []).map((i) => Object.entries(i)[0][0] === "mapValue" ? plano(Object.entries(i)[0][1].fields) : Object.entries(i)[0][1])];
    if (tipo === "nullValue") return [k, null];
    return [k, valor];
  }));
  return (j.documents || []).map((d) => ({ _id: d.name.split("/").pop(), ...plano(d.fields) }));
};
const passo = async (nome, fn) => {
  const antes = erros.length;
  try { await fn(); const nov = [...new Set(erros.slice(antes))];
    console.log(`OK    ${nome}${nov.length ? "\n      ⚠ " + nov.join("\n      ⚠ ") : ""}`); }
  catch (e) { falhas++; console.log(`FALHA ${nome}\n      ${String(e).split("\n")[0].slice(0,300)}`);
    await foto("FALHA-" + nome.replace(/\W+/g,"-").slice(0,40)); }
};
const ir = async (destino) => {
  const g = GRUPO[destino];
  if (g) { await p.locator(".nav-group-trigger", { hasText: g }).first().click(); await p.waitForTimeout(450); }
  await p.locator(g ? ".nav-subitem" : ".nav-item", { hasText: destino }).first().click();
  await p.waitForTimeout(1500);
};

await p.goto(process.env.URL_TESTE ?? "http://127.0.0.1:5199/"); await p.waitForTimeout(1800);
await p.getByPlaceholder(/e-mail|email/i).first().fill("dono@picapau.test");
await p.locator('input[type="password"]').first().fill("teste123");
await p.getByRole("button", { name: /^Entrar$/ }).click();
await p.waitForTimeout(4500);
console.log("=== TESTE PONTA A PONTA — Firestore real, regras reais ===\n");

await passo("1. abrir caixa com R$ 200 de fundo", async () => {
  await ir("Financeiro");
  await p.getByRole("button", { name: /Abrir caixa/i }).first().click();
  await p.waitForTimeout(1500);
  await p.locator('.dialog input[inputmode="decimal"]').first().fill("200");
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(3500);
  const t = await txt();
  if (!/CX-0001/.test(t)) throw new Error("não abriu: " + t.slice(0, 250));
});

await passo("2. cadastrar produto: custo 25, estoque 10", async () => {
  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Adicionar produto/i }).click();
  await p.waitForTimeout(2000);
  await p.locator(".dialog-window .dialog-input").first().fill("Óleo 20W50 Mineral");
  await p.locator(".dialog-tabs button", { hasText: /Preços/ }).click(); await p.waitForTimeout(600);
  await p.locator('.dialog-window input[type="number"]').first().fill("25");
  await p.waitForTimeout(500);
  await p.locator(".dialog-tabs button", { hasText: /Estoque/ }).click(); await p.waitForTimeout(600);
  await p.locator('.dialog-window input[type="number"]').first().fill("10");
  await p.locator(".dialog-tabs button").last().click(); await p.waitForTimeout(600);
  await p.locator(".dialog-actions-row .primary-button").click();
  await p.waitForTimeout(4000);
  const t = await txt();
  if (!/Óleo 20W50/.test(t)) throw new Error("não entrou: " + t.slice(0, 250));
});
await foto("estoque");

await passo("3. preço gravado formatado (custo 25 + margem 60% = R$ 40,00)", async () => {
  const t = await txt();
  if (/R\$\s?40,00/.test(t)) return;
  const m = t.match(/Óleo 20W50[\s\S]{0,180}/);
  throw new Error("preço não saiu formatado: " + (m ? m[0].replace(/\n/g, " | ") : "?"));
});

await passo("4. vender no PDV em dinheiro com desconto", async () => {
  await ir("PDV Balcão");
  await p.getByRole("button", { name: /Óleo 20W50 Mineral/ }).first().click({ timeout: 10000 });
  await p.waitForTimeout(1200);
  await p.locator(".summary-lines button", { hasText: /Adicionar/ }).click();
  await p.waitForTimeout(500);
  await p.locator(".summary-discount-input").fill("5");
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: /Receber pagamento/i }).click();
  await p.waitForTimeout(1500);
  await p.locator(".payment-methods button").filter({ hasText: "Dinheiro" }).first().click();
  await p.waitForTimeout(600);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(4500);
  const vendas = await banco("sales");
  if (vendas.length !== 1) throw new Error(`gravou ${vendas.length} venda(s), esperado 1`);
  const venda = vendas[0];
  if (venda.total !== 35) throw new Error(`total gravado ${venda.total}, esperado 35 (40 - 5 de desconto)`);
  if (venda.paymentMethod !== "Dinheiro") throw new Error(`forma gravada "${venda.paymentMethod}", esperado Dinheiro`);
  await ir("Vendas do balcão");
  const t = await txt();
  if (!/35,00/.test(t)) throw new Error("a tela não mostra o total do dia: " + t.slice(0, 300));
});
await foto("venda");

await passo("5. estoque baixou de 10 para 9", async () => {
  const produto = (await banco("products"))[0];
  if (!produto) throw new Error("produto sumiu do banco");
  if (produto.stock !== 9) throw new Error(`estoque no banco é ${produto.stock}, esperado 9`);
  await ir("Produtos e estoque");
  const m = (await txt()).match(/Óleo 20W50[\s\S]{0,200}/);
  if (!m || !/\b9\b/.test(m[0])) throw new Error("a tela não mostra o saldo 9: " + (m ? m[0].replace(/\n/g, " | ") : "?"));
});

await passo("6. abrir uma OS completa com placa, problema e mão de obra", async () => {
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  // "Que tipo de atendimento é?": serviço rápido ou OS completa.
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  // Etapa 1 — moto e cliente. Sem placa a OS é (corretamente) recusada.
  await p.getByPlaceholder("ABC-1234 ou ABC-1D23").fill("TES-1D23");
  await p.getByPlaceholder("Nome do cliente").fill("Cliente de Teste");
  await p.getByPlaceholder("(34) 99999-9999", { exact: true }).fill("34999998888");
  await p.getByPlaceholder("Ex.: Honda CG 160 Fan").fill("Honda CG 160 Fan");
  await p.waitForTimeout(500);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 2 — origem: cliente direto já vem marcado.
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 3 — recepção.
  await p.getByPlaceholder("Ex.: 38.420 km").fill("38.420 km");
  await p.locator(".dialog textarea").first().fill("Barulho na relação");
  await p.waitForTimeout(400);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 4 — mão de obra: descrição + valor + "Adicionar mão de obra".
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Troca do kit relação");
  await p.locator(".dialog input[type=number]").first().fill("150");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 5 — revisão e confirmação.
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(4000);
  const ordens = await banco("serviceOrders");
  if (ordens.length !== 1) throw new Error(`gravou ${ordens.length} OS, esperado 1`);
  const os = ordens[0];
  if (!/Cliente de Teste/.test(os.customer || "")) throw new Error(`cliente gravado: "${os.customer}"`);
  if (!/TES-1D23/i.test(os.plate || "")) throw new Error(`placa gravada: "${os.plate}"`);
  if (!/Barulho na relação/.test(os.problem || "")) throw new Error(`problema gravado: "${os.problem}"`);
  if ((os.items || []).length !== 1) throw new Error(`gravou ${(os.items || []).length} item(ns), esperado a mão de obra`);
  if (Number(os.total) !== 150) throw new Error(`total gravado ${os.total}, esperado 150`);
  // A moto e o cliente novos precisam virar cadastro, não só texto na OS.
  if (!os.clientId) throw new Error("a OS não vinculou o cliente cadastrado");
  if (!os.motorcycleId) throw new Error("a OS não vinculou a motocicleta cadastrada");
  if ((await banco("clients")).length !== 1) throw new Error("o cliente novo não foi cadastrado");
  if ((await banco("motorcycles")).length !== 1) throw new Error("a moto nova não foi cadastrada");
  if (!/OS-/.test(await txt())) throw new Error("a OS não aparece na lista da tela");
});
await foto("os-aberta");

await passo("7. sangria de R$ 50 sai da gaveta", async () => {
  await ir("Financeiro");
  await p.getByRole("button", { name: /Movimentar caixa/i }).first().click();
  await p.waitForTimeout(1800);
  await p.locator(".cash-actions button", { hasText: /Sangria/ }).click();
  await p.waitForTimeout(700);
  await p.locator('.dialog input[inputmode="decimal"]').first().fill("50");
  await p.getByPlaceholder("Ex.: Depósito no banco").fill("Pagamento do motoboy");
  await p.waitForTimeout(400);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(3500);
  const caixa = (await banco("cashSessions"))[0];
  const movs = caixa?.movements || [];
  if (movs.length !== 1) throw new Error(`gravou ${movs.length} movimentação(ões), esperado 1`);
  if (Number(movs[0].amount) !== 50) throw new Error(`valor gravado ${movs[0].amount}, esperado 50`);
  if (!/sangria/i.test(movs[0].kind || movs[0].type || "")) throw new Error(`tipo gravado: ${JSON.stringify(movs[0])}`);
});

await passo("8. fechar o caixa e conferir", async () => {
  await ir("Financeiro");
  await p.getByRole("button", { name: /Movimentar caixa/i }).first().click();
  await p.waitForTimeout(1800);
  const esperado = await p.locator(".cash-balance strong").first().innerText();
  console.log(`      esperado na gaveta: ${esperado}`);
  if (!/185,00/.test(esperado)) throw new Error(`gaveta em ${esperado}; esperado R$ 185,00 (200 de fundo + 35 da venda - 50 de sangria)`);
  await p.locator(".cash-actions button", { hasText: /Fechar caixa/ }).click();
  await p.waitForTimeout(800);
  await p.locator('.dialog input[inputmode="decimal"]').first().fill(esperado.replace(/[^\d,]/g, "").replace(",", "."));
  await p.waitForTimeout(700);
  const conf = await txt();
  if (!/Confere/.test(conf)) throw new Error("não bateu: " + conf.match(/Esperado[\s\S]{0,220}/)?.[0]?.replace(/\n/g," | "));
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(3500);
  const caixas = await banco("cashSessions");
  const caixa = caixas[0];
  if (!caixa) throw new Error("nenhuma sessão de caixa no banco");
  if (caixa.status !== "fechado") throw new Error(`caixa ficou "${caixa.status}", esperado fechado`);
  if (caixa.openingAmount !== 200) throw new Error(`fundo gravado ${caixa.openingAmount}, esperado 200`);
  if (Math.abs((caixa.countedAmount ?? 0) - 185) > 0.01) throw new Error(`contado ${caixa.countedAmount}, esperado 185`);
  if (Math.abs(caixa.difference ?? 999) > 0.01) throw new Error(`diferença ${caixa.difference}, esperado 0`);
});
await foto("caixa-fechado");

await passo("9. o backup traz todas as coleções gravadas", async () => {
  const esperadas = { sales: 1, serviceOrders: 1, products: 1, cashSessions: 1, clients: 1, motorcycles: 1 };
  for (const [colecao, quantos] of Object.entries(esperadas)) {
    const achados = await banco(colecao);
    if (achados.length !== quantos) throw new Error(`${colecao}: ${achados.length} documento(s), esperado ${quantos}`);
  }
});

await passo("10. abrir cada aba do menu sem quebrar a tela", async () => {
  const quebradas = [];
  for (const destino of Object.keys(GRUPO).concat(["Relatórios"])) {
    const antes = erros.length;
    await ir(destino);
    const t = await txt();
    if (/Algo deu errado|Rendered (more|fewer) hooks/i.test(t) || erros.length > antes) quebradas.push(destino);
  }
  if (quebradas.length) throw new Error("abas com falha: " + quebradas.join(", "));
});

await passo("11. abrir cada formulário de cadastro sem quebrar a tela", async () => {
  const formularios = [
    ["Produtos e estoque", /Adicionar produto/i],
    ["Fornecedores", /Cadastrar fornecedor|Novo fornecedor|Adicionar fornecedor/i],
    ["Clientes", /Cadastrar cliente|Novo cliente|Adicionar cliente/i],
    ["Motocicletas", /Cadastrar moto|Nova moto|Adicionar moto/i],
    ["Funcionários", /Cadastrar funcionário|Novo funcionário|Adicionar funcionário/i],
  ];
  const quebrados = [];
  for (const [aba, botao] of formularios) {
    const antes = erros.length;
    try {
      await ir(aba);
      const alvo = p.getByRole("button", { name: botao }).first();
      if (!(await alvo.count())) { quebrados.push(`${aba}: botão não encontrado`); continue; }
      await alvo.click({ timeout: 8000 });
      await p.waitForTimeout(2200);
      const t = await txt();
      const abriu = await p.locator(".dialog, .dialog-window, .modal-overlay").count();
      if (!abriu) quebrados.push(`${aba}: não abriu formulário`);
      else if (/Algo deu errado/i.test(t)) quebrados.push(`${aba}: ErrorBoundary`);
      else if (erros.length > antes) quebrados.push(`${aba}: ${erros[erros.length - 1].slice(0, 90)}`);
      // Fecha pelo X ou por Cancelar; Escape nem sempre fecha.
      const fechar = p.locator(".dialog-close, .modal-close, button", { hasText: /^(Cancelar|Fechar)$/ }).first();
      if (await fechar.count()) await fechar.click({ timeout: 5000 }).catch(() => {});
      else await p.keyboard.press("Escape");
      await p.waitForTimeout(1200);
      if (await p.locator(".dialog, .dialog-window").count()) {
        quebrados.push(`${aba}: não fechou`);
        await p.keyboard.press("Escape"); await p.waitForTimeout(800);
      }
    } catch (e) {
      quebrados.push(`${aba}: ${String(e).split("\n")[0].slice(0, 90)}`);
      await p.keyboard.press("Escape").catch(() => {}); await p.waitForTimeout(800);
    }
  }
  if (quebrados.length) throw new Error("formulários com falha:\n      - " + quebrados.join("\n      - "));
});

console.log(`\n=== ${falhas} falha(s) ===`);
console.log("erros de navegador:", erros.length ? "\n  " + [...new Set(erros)].join("\n  ") : "nenhum");
await b.close();

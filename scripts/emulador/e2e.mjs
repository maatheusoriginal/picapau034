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

let n = 0, falhas = 0, ordem = 0;
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
  ordem += 1;
  try { await fn(); const nov = [...new Set(erros.slice(antes))];
    console.log(`OK    ${ordem}. ${nome}${nov.length ? "\n      ⚠ " + nov.join("\n      ⚠ ") : ""}`); }
  catch (e) { falhas++; console.log(`FALHA ${ordem}. ${nome}\n      ${String(e).split("\n")[0].slice(0,300)}`);
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

await passo("abrir caixa com R$ 200 de fundo", async () => {
  await ir("Financeiro");
  await p.getByRole("button", { name: /Abrir caixa/i }).first().click();
  await p.waitForTimeout(1500);
  await p.locator('.dialog input[inputmode="decimal"]').first().fill("200");
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(3500);
  const t = await txt();
  if (!/CX-0001/.test(t)) throw new Error("não abriu: " + t.slice(0, 250));
});

await passo("cadastrar produto: custo 25, estoque 10", async () => {
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

await passo("preço gravado formatado (custo 25 + margem 60% = R$ 40,00)", async () => {
  const t = await txt();
  if (/R\$\s?40,00/.test(t)) return;
  const m = t.match(/Óleo 20W50[\s\S]{0,180}/);
  throw new Error("preço não saiu formatado: " + (m ? m[0].replace(/\n/g, " | ") : "?"));
});

await passo("vender no PDV em dinheiro com desconto", async () => {
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

await passo("estoque baixou de 10 para 9", async () => {
  const produto = (await banco("products"))[0];
  if (!produto) throw new Error("produto sumiu do banco");
  if (produto.stock !== 9) throw new Error(`estoque no banco é ${produto.stock}, esperado 9`);
  await ir("Produtos e estoque");
  const m = (await txt()).match(/Óleo 20W50[\s\S]{0,200}/);
  if (!m || !/\b9\b/.test(m[0])) throw new Error("a tela não mostra o saldo 9: " + (m ? m[0].replace(/\n/g, " | ") : "?"));
});

await passo("abrir uma OS completa com placa, problema e mão de obra", async () => {
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

await passo("levar a OS até a entrega e faturar em dinheiro", async () => {
  await ir("Ordens de serviço");
  await p.locator("button", { hasText: /^Abrir$/ }).first().click();
  await p.waitForTimeout(2500);
  await p.locator(".order-status-control select").selectOption("Entrega");
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click();  // Salvar alterações -> checkout
  await p.waitForTimeout(2000);
  const titulo = await p.locator(".dialog h2").first().innerText();
  if (!/receber/i.test(titulo)) throw new Error(`não abriu o recebimento da OS: "${titulo}"`);
  await p.locator(".payment-methods button").filter({ hasText: "Dinheiro" }).first().click();
  await p.waitForTimeout(700);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(4500);
  const os = (await banco("serviceOrders"))[0];
  if (!/Entrega|Conclu/i.test(os.status || "")) throw new Error(`OS ficou em "${os.status}"`);
  if (!os.closedAt && !os.closedAtISO) throw new Error("a OS não registrou o encerramento");
  // O recebimento fica gravado na própria OS — não vira documento em "sales".
  if (Number(os.total) !== 150) throw new Error(`faturou ${os.total}, esperado 150`);
  if (os.paymentMethod !== "Dinheiro") throw new Error(`forma gravada "${os.paymentMethod}", esperado Dinheiro`);
});

await passo("serviço rápido de R$ 80 recebido em dinheiro", async () => {
  await ir("Serviço rápido");
  await p.getByRole("button", { name: /Novo serviço rápido/i }).first().click();
  await p.waitForTimeout(2200);
  await p.locator(".dialog input[type=number]").first().fill("80");
  await p.getByPlaceholder("Nome ou telefone").fill("Cliente do balcão");
  await p.waitForTimeout(400);
  const pagamento = p.locator(".dialog select").filter({ has: p.locator('option:text-is("Dinheiro")') }).first();
  if (await pagamento.count()) await pagamento.selectOption({ label: "Dinheiro" });
  await p.waitForTimeout(400);
  await p.locator(".dialog-footer .primary-button, .dialog button", { hasText: /Finalizar e receber/ }).first().click();
  await p.waitForTimeout(4500);
  const rapidas = (await banco("sales")).filter((v) => Number(v.total) === 80);
  if (!rapidas.length) throw new Error("o serviço rápido não gravou venda de R$ 80");
});

await passo("entrada de estoque: 10 peças a R$ 30 sobem o saldo e o custo médio", async () => {
  await ir("Compras e entradas");
  await p.getByRole("button", { name: /Nova entrada/i }).first().click();
  await p.waitForTimeout(2200);
  await p.locator(".dialog button", { hasText: /Adicionar produto/ }).click();
  await p.waitForTimeout(1200);
  const linha = p.locator(".dialog select").last();
  await linha.selectOption({ index: 1 }).catch(() => {});
  await p.waitForTimeout(600);
  const numeros = p.locator(".dialog input[type=number]");
  const quantos = await numeros.count();
  if (quantos < 2) throw new Error(`a linha da entrada não trouxe quantidade e custo (${quantos} campos)`);
  await numeros.nth(quantos - 2).fill("10");
  await numeros.nth(quantos - 1).fill("30");
  await p.waitForTimeout(500);
  await p.locator(".dialog button", { hasText: /Confirmar entrada/ }).click();
  await p.waitForTimeout(4500);
  const produto = (await banco("products"))[0];
  if (produto.stock !== 19) throw new Error(`estoque ficou ${produto.stock}, esperado 19 (9 + 10)`);
  const entradas = await banco("stockEntries");
  if (!entradas.length) throw new Error("a entrada não foi gravada em stockEntries");
});

await passo("lançar uma conta a receber de R$ 200", async () => {
  await ir("Contas a receber");
  await p.getByRole("button", { name: /Nova conta/i }).first().click();
  await p.waitForTimeout(2200);
  await p.getByPlaceholder("Ex.: Parcela de peças e serviço").fill("Parcela do kit relação");
  await p.locator(".dialog input[type=number]").first().fill("200");
  await p.waitForTimeout(400);
  await p.locator(".dialog button", { hasText: /Criar conta a receber/ }).click();
  await p.waitForTimeout(4500);
  const contas = await banco("accounts");
  const conta = contas.find((c) => Number(c.amount ?? c.total) === 200);
  if (!conta) throw new Error(`nenhuma conta de R$ 200; gravadas: ${JSON.stringify(contas).slice(0, 200)}`);
  if (!/receber/i.test(conta.kind || conta.type || "")) throw new Error(`gravou como "${conta.kind ?? conta.type}"`);
});

await passo("registrar um gasto de R$ 40 pago pelo caixa", async () => {
  await ir("Financeiro");
  await p.getByRole("button", { name: /Adicionar gasto/i }).first().click();
  await p.waitForTimeout(2200);
  await p.getByPlaceholder("Ex.: Retificador CG 160").fill("Óleo para a bancada");
  await p.locator(".dialog input[type=number]").first().fill("40");
  await p.waitForTimeout(400);
  await p.locator(".dialog button", { hasText: /Registrar gasto/ }).click();
  await p.waitForTimeout(4500);
  // Este passo pegou o defeito: sem fornecedor escolhido o campo ia como
  // `undefined`, o Firestore recusava o lote inteiro, a tela dizia "gasto
  // registrado" e descontava do saldo — e no banco não havia nada.
  const gastos = (await banco("expenses")).filter((e) => Number(e.amount ?? e.value ?? e.total) === 40);
  if (!gastos.length) throw new Error("o gasto de R$ 40 não foi gravado no banco");
  if (gastos[0].status !== "Pago") throw new Error(`gasto gravado como "${gastos[0].status}", esperado Pago`);
});

await passo("sangria de R$ 50 sai da gaveta", async () => {
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

await passo("fechar o caixa e conferir", async () => {
  await ir("Financeiro");
  await p.getByRole("button", { name: /Movimentar caixa/i }).first().click();
  await p.waitForTimeout(1800);
  const esperado = await p.locator(".cash-balance strong").first().innerText();
  console.log(`      esperado na gaveta: ${esperado}`);
  // 200 de fundo + 35 da venda + 150 da OS + 80 do serviço rápido - 40 de gasto - 50 de sangria
  if (!/375,00/.test(esperado)) throw new Error(`gaveta em ${esperado}; esperado R$ 375,00 (200 + 35 + 150 + 80 - 40 - 50)`);
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
  if (Math.abs((caixa.countedAmount ?? 0) - 375) > 0.01) throw new Error(`contado ${caixa.countedAmount}, esperado 375`);
  if (Math.abs(caixa.difference ?? 999) > 0.01) throw new Error(`diferença ${caixa.difference}, esperado 0`);
});
await foto("caixa-fechado");

await passo("o backup traz todas as coleções gravadas", async () => {
  const esperadas = { serviceOrders: 1, products: 1, cashSessions: 1, clients: 1, motorcycles: 1, stockEntries: 1, expenses: 1, accounts: 1 };
  for (const [colecao, quantos] of Object.entries(esperadas)) {
    const achados = await banco(colecao);
    if (achados.length !== quantos) throw new Error(`${colecao}: ${achados.length} documento(s), esperado ${quantos}`);
  }
});

await passo("abrir cada aba do menu sem quebrar a tela", async () => {
  const quebradas = [];
  for (const destino of Object.keys(GRUPO).concat(["Relatórios"])) {
    const antes = erros.length;
    await ir(destino);
    const t = await txt();
    if (/Algo deu errado|Rendered (more|fewer) hooks/i.test(t) || erros.length > antes) quebradas.push(destino);
  }
  if (quebradas.length) throw new Error("abas com falha: " + quebradas.join(", "));
});

await passo("Configurações: avisar em português e gravar o que foi mudado", async () => {
  await p.locator(".nav-item", { hasText: "Configurações" }).first().click();
  await p.waitForTimeout(2500);
  const problemas = [];

  // Nenhuma aba pode ficar cortada: a barra rolava e sobrava um botão com só
  // o contador ("0") aparecendo, sem nome nenhum.
  const rotulos = await p.locator(".settings-tab-button").allInnerTexts();
  if (rotulos.length !== 8) problemas.push(`${rotulos.length} abas, esperado 8`);
  if (!rotulos.every((t) => /[A-Za-zÀ-ú]/.test(t))) problemas.push("aba sem nome visível: " + JSON.stringify(rotulos));
  const foraDaTela = await p.locator(".settings-tab-button").evaluateAll((els) =>
    els.filter((e) => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 1 || b.x < -1; }).map((e) => e.innerText.replace(/\n/g, " ")));
  if (foraDaTela.length) problemas.push("aba fora da tela: " + foraDaTela.join(", "));

  // Salvar sem o obrigatório precisa dizer o que falta, em português, e ficar
  // na tela. Era o aviso do navegador, em inglês, que sumia sozinho — e por
  // isso parecia que a aba simplesmente não salvava.
  await p.locator(".settings-tab-button", { hasText: "Serviços" }).first().click();
  await p.waitForTimeout(1400);
  await p.locator("button").filter({ hasText: /Novo Serviço Rápido/ }).first().click();
  await p.waitForTimeout(1800);
  const aviso = await p.locator(".settings-modal-error").innerText().catch(() => "");
  await p.locator("button").filter({ hasText: /Salvar Serviço/ }).first().click();
  await p.waitForTimeout(1200);
  const depois = await p.locator(".settings-modal-error").innerText().catch(() => "");
  if (aviso) problemas.push("o aviso já aparecia antes de tentar salvar");
  if (!/nome ao serviço/i.test(depois)) problemas.push(`aviso do modal: ${JSON.stringify(depois)}`);

  // A categoria do serviço saiu do texto livre para a lista cadastrada.
  const categorias = await p.locator(".dialog select").first().locator("option").allInnerTexts();
  if (categorias.length < 4) problemas.push(`categoria com ${categorias.length} opção(ões)`);

  await p.locator(".dialog input[type=text]").first().fill("Troca de óleo 1L");
  await p.waitForTimeout(400);
  await p.locator("button").filter({ hasText: /Salvar Serviço/ }).first().click();
  await p.waitForTimeout(3500);
  if ((await banco("quickServices")).length !== 1) problemas.push("o serviço rápido não gravou");

  // Formas de pagamento não tinham tela nenhuma; e gravar a primeira precisa
  // levar junto as seis padrão, senão elas somem da hora de receber.
  await p.locator(".settings-tab-button", { hasText: "Pagamentos" }).first().click();
  await p.waitForTimeout(1400);
  const formas = await p.locator(".settings-card").first().locator("tbody tr").count();
  if (formas < 6) problemas.push(`${formas} forma(s) de pagamento listada(s), esperado 6`);
  await p.locator("button").filter({ hasText: /Nova Forma de Pagamento/ }).first().click();
  await p.waitForTimeout(1800);
  await p.locator(".dialog input[type=text]").first().fill("Vale-combustível");
  await p.waitForTimeout(400);
  await p.locator("button").filter({ hasText: /Salvar Forma/ }).first().click();
  await p.waitForTimeout(3500);
  const gravadas = (await banco("paymentMethods")).length;
  if (gravadas !== 7) problemas.push(`${gravadas} forma(s) no banco, esperado 7 (as 6 padrão + a nova)`);

  // O modelo da impressora era texto livre.
  await p.locator(".settings-tab-button", { hasText: "Impressão" }).first().click();
  await p.waitForTimeout(1400);
  const impressoras = await p.locator(".settings-card select").first().locator("option").count();
  if (impressoras < 8) problemas.push(`lista de impressoras com ${impressoras} opção(ões)`);

  if (problemas.length) throw new Error("Configurações:\n      - " + problemas.join("\n      - "));
});

await passo("campo de número deixa apagar o valor", async () => {
  // O defeito: `onChange={(e) => setValor(parseFloat(e.target.value) || 0)}`.
  // Apagar fazia o campo voltar para 0 na mesma tecla, e o número digitado em
  // seguida entrava depois dele — "020" no lugar de 20.
  const problemas = [];
  await p.locator(".nav-item", { hasText: "Configurações" }).first().click();
  await p.waitForTimeout(2200);
  await p.locator(".settings-tab-button", { hasText: "Serviços" }).first().click();
  await p.waitForTimeout(1300);
  await p.locator("button").filter({ hasText: /Novo Serviço Rápido/ }).first().click();
  await p.waitForTimeout(1800);

  const preco = p.locator(".dialog input[type=number]").first();
  await preco.click();
  await p.keyboard.press("Control+a");
  await p.keyboard.press("Backspace");
  await p.waitForTimeout(250);
  const vazio = await preco.inputValue();
  if (vazio !== "") problemas.push(`apagar deixou "${vazio}" no campo, esperado vazio`);

  await p.keyboard.type("20");
  await p.waitForTimeout(350);
  const digitado = await preco.inputValue();
  if (digitado !== "20") problemas.push(`digitar 20 deu "${digitado}"`);

  // Sair do campo vazio cai no padrão declarado, e não num zero silencioso
  // onde a tela esperava outra coisa.
  await preco.click();
  await p.keyboard.press("Control+a");
  await p.keyboard.press("Backspace");
  await p.locator(".dialog input[type=text]").first().click();
  await p.waitForTimeout(500);
  const aoSair = await preco.inputValue();
  if (aoSair !== "0") problemas.push(`sair vazio deixou "${aoSair}", esperado o padrão do campo`);
  await p.locator(".dialog button", { hasText: /^Cancelar$/ }).first().click();
  await p.waitForTimeout(1000);

  // No cadastro de peça os campos conversam entre si: mudar o custo recalcula
  // o preço enquanto se digita. O campo novo não pode quebrar isso.
  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Adicionar produto/i }).first().click();
  await p.waitForTimeout(2200);
  await p.locator(".dialog-tabs button", { hasText: /Preços/ }).click();
  await p.waitForTimeout(700);
  const custo = p.locator(".dialog-window input[type=number]").first();
  await custo.click();
  await p.keyboard.type("25");
  await p.waitForTimeout(400);
  await p.keyboard.press("Control+a");
  await p.keyboard.press("Backspace");
  await p.keyboard.type("30");
  await p.waitForTimeout(700);
  const precos = await p.locator(".dialog-window input[type=number]").evaluateAll((els) => els.map((e) => e.value));
  if (precos[0] !== "30") problemas.push(`custo ficou "${precos[0]}", esperado 30`);
  if (precos[2] !== "48") problemas.push(`preço ficou "${precos[2]}", esperado 48 (custo 30 + margem 60%)`);
  await p.locator(".dialog-window button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1000);

  if (problemas.length) throw new Error("campo de número:\n      - " + problemas.join("\n      - "));
});

await passo("cadastro de peça: marca em lista e sem gravar antes da hora", async () => {
  const problemas = [];
  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Adicionar produto/i }).first().click();
  await p.waitForTimeout(2200);

  // A marca era texto livre: cada pessoa escrevia de um jeito e o filtro do
  // estoque não juntava nada.
  const marca = p.locator(".dialog-window select").nth(1);
  const marcas = await marca.locator("option").allInnerTexts();
  if (marcas.length < 6) problemas.push(`lista de marcas com ${marcas.length} opção(ões)`);
  await marca.selectOption("__outra__");
  await p.waitForTimeout(600);
  if (!(await p.locator('.dialog-window input[placeholder="Ex: Yamalube, Mobil, Cobreq"]').count()))
    problemas.push('"Outra" não abriu o campo para digitar');
  await marca.selectOption("Motul");
  await p.waitForTimeout(400);

  // Clique duplo em "Próxima etapa" na penúltima etapa cadastrava a peça pela
  // metade e fechava a tela: o botão de gravar aparecia no mesmo pixel.
  const antesDoClique = (await banco("products")).length;
  await p.locator(".dialog-window .dialog-input").first().fill("Óleo Motul 5100 4T");
  await p.locator(".dialog-tabs button", { hasText: /Preços/ }).click();
  await p.waitForTimeout(600);
  await p.locator(".dialog-window input[type=number]").first().fill("25");
  await p.locator(".dialog-tabs button", { hasText: /Compatibilidade/ }).click();
  await p.waitForTimeout(700);
  const proxima = p.locator(".dialog-window button", { hasText: /Próxima etapa/ }).first();
  const caixa = await proxima.boundingBox();
  await p.mouse.dblclick(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await p.waitForTimeout(3000);
  if ((await banco("products")).length !== antesDoClique) problemas.push("o clique duplo cadastrou a peça sozinho");
  if (!(await p.locator(".dialog-window").count())) problemas.push("o clique duplo fechou a tela");
  if ((await p.locator(".dialog-window button", { hasText: /Próxima etapa|Cadastrar Produto/ }).count()) !== 2)
    problemas.push("os dois botões precisam ficar sempre na tela");
  await p.locator(".dialog-window button", { hasText: /Cadastrar Produto/ }).first().click();
  await p.waitForTimeout(4000);
  if ((await banco("products")).length !== antesDoClique + 1) problemas.push("o botão de cadastrar não gravou");
  if (problemas.length) throw new Error("cadastro de peça:\n      - " + problemas.join("\n      - "));
});

await passo("cadastrar cliente completo sem sair da OS", async () => {
  const problemas = [];
  const antes = (await banco("clients")).length;
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  const atalhos = await p.locator(".os-full-register button").allInnerTexts();
  if (atalhos.length !== 2) problemas.push(`${atalhos.length} atalho(s) de cadastro completo, esperado 2`);
  await p.locator(".os-full-register button", { hasText: /cliente/i }).click();
  await p.waitForTimeout(2500);
  const abas = await p.locator(".dialog-window .dialog-tabs button").allInnerTexts();
  if (!abas.some((t) => /Endereço/i.test(t))) problemas.push(`o cadastro completo não abriu: ${JSON.stringify(abas)}`);

  // Salvar sem o telefone avisava por um toast que ficava ATRÁS do modal:
  // a aba trocava sozinha e nada mais acontecia.
  await p.locator('.dialog-window input[placeholder*="Carlos Eduardo"]').fill("Transportes Bom Dia");
  await p.waitForTimeout(400);
  await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
  await p.waitForTimeout(1500);
  const aviso = await p.locator(".dialog-window .settings-modal-error").innerText().catch(() => "");
  if (!/WhatsApp|telefone/i.test(aviso)) problemas.push(`aviso dentro do formulário: ${JSON.stringify(aviso)}`);
  if ((await banco("clients")).length !== antes) problemas.push("gravou sem o telefone");

  await p.locator(".dialog-window input").first().fill("34999998888");
  await p.waitForTimeout(400);
  await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
  await p.waitForTimeout(4000);
  if ((await banco("clients")).length !== antes + 1) problemas.push("o cliente completo não foi gravado");
  if (!(await p.locator(".dialog", { hasText: /Abrir nova ordem/i }).count())) problemas.push("não voltou para a OS depois de cadastrar");
  await p.locator(".dialog-footer .ghost-button, .dialog button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  if (problemas.length) throw new Error("cadastro dentro da OS:\n      - " + problemas.join("\n      - "));
});

await passo("em tela baixa, o botão de salvar continua alcançável", async () => {
  // O <form> dos modais de Configurações fica entre o .dialog e o rodapé. Sem
  // ser uma coluna flexível, o corpo crescia com o conteúdo, estourava o
  // max-height do .dialog e o rodapé — onde fica o "Salvar" — era cortado pelo
  // overflow: hidden, fora da tela e sem barra de rolagem. Numa tela de 620px
  // de altura o botão ficava 18px abaixo do fim da tela.
  const contexto = await b.newContext({ viewport: { width: 1280, height: 620 } });
  const baixa = await contexto.newPage();
  const problemas = [];
  try {
    await baixa.goto(process.env.URL_TESTE ?? "http://127.0.0.1:5199/");
    await baixa.waitForTimeout(2200);
    await baixa.getByPlaceholder(/e-mail|email/i).first().fill("dono@picapau.test");
    await baixa.locator('input[type="password"]').first().fill("teste123");
    await baixa.getByRole("button", { name: /^Entrar$/ }).click();
    await baixa.waitForTimeout(5000);
    await baixa.locator(".nav-item", { hasText: "Configurações" }).first().click();
    await baixa.waitForTimeout(2500);

    const modais = [
      ["Serviços", /Novo Serviço Rápido/, /Salvar Serviço/],
      ["Categorias", /Nova Categoria/, /Salvar Categoria/],
      ["Pagamentos", /Nova Forma de Pagamento/, /Salvar Forma/],
      ["Pagamentos", /Nova Maquininha/, /Salvar Maquininha/],
      ["Parceiros", /Novo Parceiro/, /Salvar Parceiro/],
    ];
    for (const [nomeAba, abrir, salvar] of modais) {
      await baixa.locator(".settings-tab-button", { hasText: nomeAba }).first().click();
      await baixa.waitForTimeout(1200);
      await baixa.locator("button").filter({ hasText: abrir }).first().click();
      await baixa.waitForTimeout(1600);
      const alcance = await baixa.locator(".dialog button").filter({ hasText: salvar }).first().evaluate((el) => {
        const caixa = el.getBoundingClientRect();
        const noPonto = document.elementFromPoint(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
        return { dentro: caixa.bottom <= window.innerHeight && caixa.top >= 0,
          clicavel: el.contains(noPonto) || noPonto === el,
          fundo: Math.round(caixa.bottom), tela: window.innerHeight };
      }).catch(() => null);
      if (!alcance) problemas.push(`${salvar.source}: botão não encontrado`);
      else if (!alcance.dentro || !alcance.clicavel) problemas.push(`${salvar.source}: termina em ${alcance.fundo}px numa tela de ${alcance.tela}px`);
      await baixa.locator(".dialog button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
      await baixa.waitForTimeout(900);
    }
  } finally {
    await contexto.close();
  }
  if (problemas.length) throw new Error("rodapé fora do alcance:\n      - " + problemas.join("\n      - "));
});

await passo("abrir cada formulário de cadastro sem quebrar a tela", async () => {
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

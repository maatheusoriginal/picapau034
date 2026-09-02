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
  catch (e) { falhas++; console.log(`FALHA ${ordem}. ${nome}\n      ${String(e).replace(/^Error: /, "").split("\n").slice(0, 8).join("\n      ").slice(0, 700)}`);
    await foto("FALHA-" + nome.replace(/\W+/g,"-").slice(0,40)); }
};
/**
 * Preenche a etapa 1 da OS: cliente e depois a moto.
 *
 * A etapa é dois blocos com um estado só de cada vez — procurando, encontrado
 * ou cadastrando —, então o roteiro segue o mesmo caminho de quem atende:
 * digita o nome, o botão de cadastrar aparece, e só então a moto libera.
 */
const preencherEtapa1 = async (dados) => {
  await p.locator(".os-search input").first().fill(dados.nome);
  await p.waitForTimeout(900);
  await p.locator(".os-search-empty button").first().click();
  await p.waitForTimeout(900);
  await p.locator('.os-inline-form input[placeholder="Nome do cliente"]').fill(dados.nome);
  await p.locator('.os-inline-form input[placeholder="(34) 99999-9999"]').fill(dados.telefone);
  await p.waitForTimeout(500);
  await p.locator('.os-inline-form.vehicle input[placeholder*="ABC-1234"]').fill(dados.placa);
  await p.waitForTimeout(400);
  const listas = p.locator(".os-inline-form.vehicle select");
  await listas.nth(0).selectOption(dados.marca);
  await p.waitForTimeout(600);
  await listas.nth(1).selectOption(dados.modelo);
  await p.waitForTimeout(600);
  if (dados.versao) { await listas.nth(2).selectOption(dados.versao); await p.waitForTimeout(500); }
  await p.waitForTimeout(300);
};

const ir = async (destino) => {
  const g = GRUPO[destino];
  const alvo = p.locator(g ? ".nav-subitem" : ".nav-item", { hasText: destino }).first();
  // Só abre o grupo se ele estiver fechado: clicar num grupo já aberto o
  // FECHA, e aí o item some e o passo trava esperando por ele.
  if (g && !(await alvo.isVisible().catch(() => false))) {
    await p.locator(".nav-group-trigger", { hasText: g }).first().click();
    await p.waitForTimeout(600);
  }
  await alvo.click();
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
  // Etapa 1 — cliente e depois a moto. Sem placa a OS é (corretamente) recusada.
  await preencherEtapa1({ nome: "Cliente de Teste", telefone: "34999998888", placa: "TES-1D23", marca: "Honda", modelo: "CG 160", versao: "Fan" });
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 2 — recepção.
  await p.getByPlaceholder("Ex.: 38.420 km").fill("38.420 km");
  await p.locator(".dialog textarea").first().fill("Barulho na relação");
  await p.waitForTimeout(400);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 3 — mão de obra: descrição + valor + "Adicionar mão de obra".
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Troca do kit relação");
  await p.locator(".dialog input[type=number]").first().fill("150");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1300);
  // Etapa 4 — revisão e confirmação.
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
  if (!/Honda CG 160 Fan/.test(os.bike || "")) throw new Error(`moto gravada: "${os.bike}", esperado do catálogo`);
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
  // O cadastro completo fica dentro do bloco do cliente, como ação secundária:
  // aparece quando a pessoa escolhe cadastrar, e não o tempo todo.
  await p.locator(".os-search input").first().fill("Transportes Bom Dia");
  await p.waitForTimeout(900);
  await p.locator(".os-search-empty button").first().click();
  await p.waitForTimeout(900);
  const atalhos = await p.locator(".os-inline-actions .outline-button").allInnerTexts();
  if (!atalhos.some((t) => /completo/i.test(t))) problemas.push(`sem atalho de cadastro completo: ${JSON.stringify(atalhos)}`);
  await p.locator(".os-inline-actions .outline-button", { hasText: /completo/i }).first().click();
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
  // Cliente sem placa vinculada é recusado: numa oficina não existe cliente sem
  // moto. A placa da OS já vem preenchida aqui, para não digitar duas vezes.
  await p.locator(".dialog-tabs button", { hasText: /Dados Pessoais/ }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-moto-block input[placeholder*="ABC-1234"]').fill("BOM-7C77");
  await p.waitForTimeout(500);
  await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
  await p.waitForTimeout(4000);
  if ((await banco("clients")).length !== antes + 1) problemas.push("o cliente completo não foi gravado");
  if (!(await p.locator(".dialog", { hasText: /Abrir nova ordem/i }).count())) problemas.push("não voltou para a OS depois de cadastrar");
  await p.locator(".dialog-footer .ghost-button, .dialog button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  if (problemas.length) throw new Error("cadastro dentro da OS:\n      - " + problemas.join("\n      - "));
});

await passo("frota: moto sem dono, parceira responsável e fatura no mês seguinte", async () => {
  const problemas = [];

  // 1. a empresa parceira, com desconto combinado na mão de obra
  await p.locator(".nav-item", { hasText: "Configurações" }).first().click();
  await p.waitForTimeout(2200);
  await p.locator(".settings-tab-button", { hasText: "Parceiros" }).first().click();
  await p.waitForTimeout(1400);
  await p.locator("button").filter({ hasText: /Novo Parceiro/ }).first().click();
  await p.waitForTimeout(1800);
  await p.locator(".dialog input").first().fill("Flash Entregas");
  await p.locator(".dialog input[type=number]").first().fill("15");
  await p.waitForTimeout(400);
  await p.locator(".dialog button", { hasText: /Salvar Parceiro/ }).first().click();
  await p.waitForTimeout(3500);
  if (!(await banco("partners")).length) problemas.push("a empresa parceira não foi cadastrada");

  // 2. a moto da frota: sem dono individual, com a parceira como responsável.
  // A oficina atende a moto do aplicativo sem saber quem é o motoboy da vez.
  await ir("Motocicletas");
  await p.getByRole("button", { name: /Cadastrar moto|Nova moto|Adicionar moto/i }).first().click();
  await p.waitForTimeout(2200);
  await p.locator('.dialog-window input[placeholder*="ABC-1234"]').fill("FLA-2C34");
  const rotulos = async () => p.locator(".dialog-window select").evaluateAll((els) => els.map((e) => (e.closest("label")?.innerText || "").split("\n")[0]));
  let atuais = await rotulos();
  await p.locator(".dialog-window select").nth(atuais.findIndex((t) => /Marca/i.test(t))).selectOption("Honda");
  await p.waitForTimeout(600);
  atuais = await rotulos();
  await p.locator(".dialog-window select").nth(atuais.findIndex((t) => /^Modelo/i.test(t))).selectOption("Biz");
  await p.waitForTimeout(600);
  atuais = await rotulos();
  const indiceParceira = atuais.findIndex((t) => /parceira responsável/i.test(t));
  if (indiceParceira < 0) problemas.push(`o cadastro de moto não oferece a parceira responsável: ${JSON.stringify(atuais)}`);
  else {
    await p.locator(".dialog-window select").nth(indiceParceira).selectOption({ label: "Flash Entregas" });
    await p.waitForTimeout(500);
  }
  await p.locator(".dialog-window button", { hasText: /Cadastrar Motocicleta|Salvar/ }).first().click();
  await p.waitForTimeout(4000);
  const daFrota = (await banco("motorcycles")).find((moto) => moto.plate === "FLA-2C34");
  if (!daFrota) problemas.push("a moto da frota não foi cadastrada");
  else {
    if (daFrota.ownerId) problemas.push(`a moto de frota ficou com dono "${daFrota.ownerId}"`);
    if (daFrota.partnerName !== "Flash Entregas") problemas.push(`responsável gravado: "${daFrota.partnerName}"`);
  }

  // 3. a OS começa escolhendo a parceira, na PRIMEIRA etapa — a de origem
  // deixou de existir, porque quem abre a OS já escolhe a empresa e a moto.
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  const etapas = await p.locator(".stepper .step span").allInnerTexts();
  if (etapas.length !== 4) problemas.push(`a OS tem ${etapas.length} etapas, esperado 4`);
  if (etapas.some((texto) => /Origem/i.test(texto))) problemas.push("a etapa de origem continua na tela");
  if ((await p.locator(".os-party-switch button").count()) !== 2) problemas.push("a etapa 1 não deixa escolher entre cliente e parceira");

  await p.locator(".os-party-switch button", { hasText: /parceira/i }).click();
  await p.waitForTimeout(1000);
  const escolhida = await p.locator(".os-partner-pick select").first().locator("option:checked").innerText();
  if (!/Flash Entregas/.test(escolhida)) problemas.push(`a parceira não veio selecionada: ${JSON.stringify(escolhida)}`);

  // A frota dela aparece para escolher. O <select> mostrava a primeira parceira
  // com o estado ainda vazio, e o filtro procurava por id vazio: a lista da
  // parceira vinha sempre vazia.
  const motosNaTela = await p.locator(".vehicle-choice-list > button").allInnerTexts();
  if (!motosNaTela.some((texto) => /FLA-2C34/.test(texto))) problemas.push(`as motos da parceira não apareceram: ${JSON.stringify(motosNaTela)}`);
  await p.locator(".vehicle-choice-list > button", { hasText: "FLA-2C34" }).click();
  await p.waitForTimeout(800);
  if ((await p.locator(".os-block.done").count()) !== 2) problemas.push("os dois blocos deviam ficar prontos");

  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(1400);
  await p.getByPlaceholder("Ex.: 38.420 km").fill("12.000 km");
  await p.locator(".dialog textarea").first().fill("Revisão da frota");
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(1400);
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Revisão completa");
  await p.locator(".dialog input[type=number]").first().fill("200");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(1400);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(4500);

  const daParceira = (await banco("serviceOrders")).find((ordem) => ordem.partnerName === "Flash Entregas");
  if (!daParceira) problemas.push("a OS não gravou a empresa parceira");
  else if (daParceira.payer !== "partner") problemas.push(`quem paga ficou "${daParceira.payer}"`);
  // OS de frota não inventa cliente: quem responde é a empresa.
  const clientesInventados = (await banco("clients")).filter((cliente) => /Flash/i.test(cliente.name || ""));
  if (clientesInventados.length) problemas.push("a OS de frota criou um cliente com o nome da parceira");

  // 4. o encerramento não pergunta forma de pagamento
  await p.locator("tr", { hasText: "FLA-2C34" }).locator("button", { hasText: /^Abrir$/ }).first().click();
  await p.waitForTimeout(2500);
  await p.locator(".order-status-control select").selectOption("Entrega");
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(2200);
  if (await p.locator(".payment-methods.checkout-methods").count()) problemas.push("perguntou forma de pagamento numa OS de parceira");
  if (!(await p.locator(".partner-billing-card").count())) problemas.push("não mostrou o que vai para a fatura");
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(5000);

  // 5. virou fatura no nome da empresa, com desconto e vencimento certos
  const fatura = (await banco("accounts")).find((conta) => conta.person === "Flash Entregas");
  if (!fatura) problemas.push("não gerou a conta a receber no nome da empresa");
  else {
    if (Number(fatura.amount) !== 170) problemas.push(`fatura de R$ ${fatura.amount}, esperado 170 (200 de mão de obra − 15%)`);
    const agora = new Date();
    const primeiro = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
    const esperado = `${String(primeiro.getDate()).padStart(2, "0")}/${String(primeiro.getMonth() + 1).padStart(2, "0")}/${primeiro.getFullYear()}`;
    if (fatura.dueDate !== esperado) problemas.push(`vence em ${fatura.dueDate}, esperado ${esperado}`);
  }
  const encerrada = (await banco("serviceOrders")).find((ordem) => ordem.partnerName === "Flash Entregas");
  if (encerrada?.paymentMethod !== "Faturado no parceiro") problemas.push(`forma gravada: "${encerrada?.paymentMethod}"`);

  // A OS do passo 6 não pode ter sido tocada.
  const antiga = (await banco("serviceOrders")).find((ordem) => ordem.plate === "TES-1D23");
  if (Number(antiga?.total) !== 150) problemas.push(`a OS do passo 6 virou R$ ${antiga?.total}, esperado 150`);

  if (problemas.length) throw new Error("frota e parceira:\n      - " + problemas.join("\n      - "));
});

await passo("moto por marca, modelo e versão; código de barras gerado", async () => {
  const problemas = [];

  // O modelo era texto livre: a mesma moto entrava como "CG 160 Fan",
  // "cg160 fan" e "CG FAN 160", e a busca por modelo parava de funcionar.
  await ir("Motocicletas");
  await p.getByRole("button", { name: /Cadastrar moto|Nova moto|Adicionar moto/i }).first().click();
  await p.waitForTimeout(2200);
  const rotulos = await p.locator(".dialog-window select").evaluateAll((els) => els.map((e) => (e.closest("label")?.innerText || "").split("\n")[0]));
  const marca = p.locator(".dialog-window select").nth(rotulos.findIndex((t) => /Marca/i.test(t)));
  const modelo = p.locator(".dialog-window select").nth(rotulos.findIndex((t) => /^Modelo/i.test(t)));
  if (!(await marca.count()) || !(await modelo.count())) problemas.push(`o formulário não tem marca e modelo em lista: ${JSON.stringify(rotulos)}`);

  await marca.selectOption("Honda");
  await p.waitForTimeout(700);
  const daHonda = await modelo.locator("option").allInnerTexts();
  if (!daHonda.some((t) => /CG 160/.test(t))) problemas.push(`Honda não trouxe os modelos dela: ${JSON.stringify(daHonda.slice(0, 5))}`);

  // Trocar de marca precisa trocar a lista: "CG 160" não existe na Yamaha.
  await marca.selectOption("Yamaha");
  await p.waitForTimeout(700);
  const daYamaha = await modelo.locator("option").allInnerTexts();
  if (daYamaha.some((t) => /CG 160/.test(t))) problemas.push("trocar de marca manteve os modelos da anterior");
  if (!daYamaha.some((t) => /Factor/.test(t))) problemas.push(`Yamaha não trouxe os modelos dela: ${JSON.stringify(daYamaha.slice(0, 5))}`);

  await marca.selectOption("Honda");
  await p.waitForTimeout(600);
  await modelo.selectOption("CG 160");
  await p.waitForTimeout(700);
  const rotulos2 = await p.locator(".dialog-window select").evaluateAll((els) => els.map((e) => (e.closest("label")?.innerText || "").split("\n")[0]));
  const versao = p.locator(".dialog-window select").nth(rotulos2.findIndex((t) => /Versão/i.test(t)));
  const versoes = await versao.locator("option").allInnerTexts();
  if (!versoes.some((t) => /Fan/.test(t))) problemas.push(`CG 160 não trouxe as versões: ${JSON.stringify(versoes)}`);
  await versao.selectOption("Fan");
  await p.waitForTimeout(700);
  // A dica de como o modelo fica gravado é uma entre várias no formulário — a
  // da empresa parceira vem antes dela —, então procura em todas.
  const dicas = await p.locator(".dialog-window .settings-hint").allInnerTexts();
  if (!dicas.some((texto) => /CG 160 Fan/.test(texto))) problemas.push(`não mostrou como fica gravado: ${JSON.stringify(dicas)}`);
  await p.locator(".dialog-window button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);

  // Peça sem código de fábrica (adesivo, parafuso avulso): o botão gera um
  // EAN-13 de circulação restrita, prefixo 2, que a leitora do balcão lê.
  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Adicionar produto/i }).first().click();
  await p.waitForTimeout(2200);
  const gerar = p.locator(".dialog-window .input-action-button");
  if ((await gerar.count()) !== 1) problemas.push("não existe o botão de gerar código de barras");
  else {
    await gerar.click();
    await p.waitForTimeout(700);
    const ean = await p.locator('.dialog-window input[placeholder="789..."]').inputValue();
    if (!/^\d{13}$/.test(ean)) problemas.push(`gerou "${ean}", esperado 13 dígitos`);
    else {
      if (ean[0] !== "2") problemas.push(`o código gerado começa com ${ean[0]}, esperado 2 (uso interno GS1)`);
      const soma = ean.slice(0, 12).split("").reduce((total, digito, indice) => total + Number(digito) * (indice % 2 === 0 ? 1 : 3), 0);
      if ((10 - (soma % 10)) % 10 !== Number(ean[12])) problemas.push(`o dígito verificador de ${ean} não confere`);
    }
    await gerar.click();
    await p.waitForTimeout(700);
    const outro = await p.locator('.dialog-window input[placeholder="789..."]').inputValue();
    if (outro === ean) problemas.push("clicar de novo repetiu o mesmo código");
  }
  await p.locator(".dialog-window button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);

  if (problemas.length) throw new Error("moto e código de barras:\n      - " + problemas.join("\n      - "));
});

await passo("OS de cliente que já é da casa: acha, mostra as motos dele e não mistura", async () => {
  // O caminho mais usado no dia a dia, e o que estava mais confuso: a tela
  // tinha busca por cliente, busca por placa e um formulário que aparecia
  // sozinho, tudo junto.
  const problemas = [];
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }

  if ((await p.locator(".os-block").count()) !== 2) problemas.push("a etapa não tem os dois blocos");
  if (await p.locator(".os-inline-form").count()) problemas.push("o formulário de cadastro apareceu sem ninguém pedir");
  if (!/Escolha o cliente acima/.test(await p.locator(".os-block").nth(1).innerText()))
    problemas.push("o bloco da moto não espera o cliente ser escolhido");

  // Cliente do passo 6, procurado pelo nome.
  await p.locator(".os-search input").first().fill("Cliente de Teste");
  await p.waitForTimeout(1200);
  const achado = await p.locator(".os-picked").innerText().catch(() => "");
  if (!/Cliente de Teste/.test(achado)) problemas.push(`não achou o cliente: ${JSON.stringify(achado)}`);
  if (!/1 moto cadastrada/.test(achado)) problemas.push(`não contou as motos dele: ${JSON.stringify(achado)}`);

  // A moto dele aparece para escolher, e não um formulário em branco.
  const motos = await p.locator(".vehicle-choice-list > button").allInnerTexts();
  if (!motos.some((t) => /TES-1D23/.test(t))) problemas.push(`as motos do cliente não apareceram: ${JSON.stringify(motos)}`);
  if (!motos.some((t) => /Outra moto/.test(t))) problemas.push("falta a opção de cadastrar outra moto");
  await p.locator(".vehicle-choice-list > button", { hasText: "TES-1D23" }).first().click();
  await p.waitForTimeout(700);
  if ((await p.locator(".os-block.done").count()) !== 2) problemas.push("os dois blocos deviam estar marcados como prontos");

  // "Outra moto" abre o cadastro rápido com as listas do catálogo.
  await p.locator(".vehicle-choice-list > button", { hasText: "Outra moto" }).click();
  await p.waitForTimeout(800);
  if ((await p.locator(".os-inline-form.vehicle select").count()) < 2) problemas.push("a moto nova não veio com marca e modelo em lista");
  await p.locator(".os-inline-form.vehicle .ghost-button").first().click();
  await p.waitForTimeout(700);
  if (!(await p.locator(".vehicle-choice-list").count())) problemas.push("voltar não trouxe as motos do cliente de volta");

  // Trocar de cliente limpa a escolha, em vez de manter a moto do anterior.
  await p.locator(".os-picked-change").click();
  await p.waitForTimeout(800);
  if (!(await p.locator(".os-search input").count())) problemas.push("trocar não voltou para a busca");
  if (!/Escolha o cliente acima/.test(await p.locator(".os-block").nth(1).innerText()))
    problemas.push("trocar de cliente deixou a moto do anterior escolhida");

  await p.locator(".dialog-footer .ghost-button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  if (problemas.length) throw new Error("etapa 1 da OS:\n      - " + problemas.join("\n      - "));
});

await passo("cliente exige placa vinculada, e a moto vai junto", async () => {
  // Numa oficina não existe cliente sem moto: sem a placa vinculada, a próxima
  // OS dessa pessoa não a encontra pela busca por placa.
  const problemas = [];
  const antes = (await banco("clients")).length;
  await ir("Clientes");
  await p.getByRole("button", { name: /Cadastrar cliente|Novo cliente|Adicionar cliente/i }).first().click();
  await p.waitForTimeout(2200);
  if (!(await p.locator(".client-moto-block").count())) problemas.push("o cadastro de cliente não tem o bloco da moto");
  await p.locator('.dialog-window input[placeholder*="Carlos Eduardo"]').fill("Rayane Souza");
  await p.locator(".dialog-tabs button", { hasText: /Contato/ }).click();
  await p.waitForTimeout(600);
  await p.locator(".dialog-window input").first().fill("34988887777");
  await p.waitForTimeout(400);
  await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
  await p.waitForTimeout(1500);
  const aviso = await p.locator(".dialog-window .settings-modal-error").innerText().catch(() => "");
  if (!/placa/i.test(aviso)) problemas.push(`sem placa devia recusar: ${JSON.stringify(aviso)}`);
  if ((await banco("clients")).length !== antes) problemas.push("gravou sem a placa");

  await p.locator('.client-moto-block input[placeholder*="ABC-1234"]').fill("RAY1B22");
  await p.waitForTimeout(500);
  const listas = p.locator(".client-moto-block select");
  await listas.nth(0).selectOption("Honda"); await p.waitForTimeout(600);
  await listas.nth(1).selectOption("CG 150"); await p.waitForTimeout(600);
  await listas.nth(2).selectOption("Titan"); await p.waitForTimeout(500);
  await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
  await p.waitForTimeout(4000);
  const cliente = (await banco("clients")).find((item) => item.name === "Rayane Souza");
  const moto = (await banco("motorcycles")).find((item) => item.plate === "RAY-1B22");
  if (!cliente) problemas.push("com a placa, o cliente devia gravar");
  if (!moto) problemas.push("a moto não foi cadastrada junto");
  else {
    if (!/CG 150 Titan/.test(moto.model || "")) problemas.push(`modelo gravado: "${moto.model}"`);
    if (moto.ownerId !== cliente?._id) problemas.push("a moto não ficou vinculada ao cliente");
  }
  if (problemas.length) throw new Error("cliente e placa:\n      - " + problemas.join("\n      - "));
});

await passo("OS sem cliente identificado: abre pela placa e cobra os dados no fim", async () => {
  // A moto chega de guincho, ou o cliente deixa e sai correndo. A OS abre e o
  // serviço anda; o encerramento é que cobra o nome e o WhatsApp — senão a
  // oficina fica com serviço feito e ninguém para cobrar.
  const problemas = [];
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  const acoes = await p.locator(".os-search-actions button").allInnerTexts();
  if (acoes.length !== 2) problemas.push(`a etapa 1 tem ${acoes.length} ação(ões), esperado cadastrar e seguir sem cadastrar`);
  await p.locator(".os-search-actions .ghost-button").click();
  await p.waitForTimeout(900);
  if (!(await p.locator(".os-pending-card").count())) problemas.push("não avisou que o cliente ficou pendente");
  if (/Escolha o cliente acima/.test(await p.locator(".os-block").nth(1).innerText()))
    problemas.push("o bloco da moto continuou travado");

  await p.locator('.os-inline-form.vehicle input[placeholder*="ABC-1234"]').fill("GUI-4D44");
  await p.waitForTimeout(500);
  const listas = p.locator(".os-inline-form.vehicle select");
  await listas.nth(0).selectOption("Honda"); await p.waitForTimeout(600);
  await listas.nth(1).selectOption("CG 150"); await p.waitForTimeout(600);
  await listas.nth(2).selectOption("Fan"); await p.waitForTimeout(500);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1400);
  await p.getByPlaceholder("Ex.: 38.420 km").fill("50.000 km");
  await p.locator(".dialog textarea").first().fill("Chegou de guincho");
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1400);
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Revisão");
  await p.locator(".dialog input[type=number]").first().fill("120");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(1400);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(4000);

  const aberta = (await banco("serviceOrders")).find((ordem) => ordem.plate === "GUI-4D44");
  if (aberta?.customerPending !== true) problemas.push("a OS não ficou marcada como cliente pendente");
  // A moto precisa existir mesmo sem dono: é a placa que segura a ordem.
  if (!(await banco("motorcycles")).some((moto) => moto.plate === "GUI-4D44")) problemas.push("a moto não foi cadastrada sem o cliente");

  await p.locator("tr", { hasText: "GUI-4D44" }).locator("button", { hasText: /^Abrir$/ }).first().click();
  await p.waitForTimeout(2500);
  await p.locator(".order-status-control select").selectOption("Entrega");
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(2200);
  if (!(await p.locator(".checkout-pending-customer").count())) problemas.push("o encerramento não pediu os dados que faltam");
  await p.locator(".payment-methods button").filter({ hasText: "Dinheiro" }).first().click();
  await p.waitForTimeout(600);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(1800);
  const recusa = await p.locator(".dialog-error-strip").innerText().catch(() => "");
  if (!/nome/i.test(recusa)) problemas.push(`devia recusar encerrar sem o nome: ${JSON.stringify(recusa)}`);

  await p.locator('.checkout-pending-customer input[placeholder*="retirar"]').fill("Dono do Guincho");
  await p.locator('.checkout-pending-customer input[placeholder*="99999"]').fill("34977776666");
  await p.waitForTimeout(500);
  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(5000);
  const fechada = (await banco("serviceOrders")).find((ordem) => ordem.plate === "GUI-4D44");
  if (fechada?.closed !== true) problemas.push(`a OS não encerrou: ${fechada?.status}`);
  if (fechada?.customerPending === true) problemas.push("a OS continuou marcada como pendente");
  const novo = (await banco("clients")).find((item) => item.name === "Dono do Guincho");
  if (!novo) problemas.push("o cliente informado no encerramento não virou cadastro");
  const moto = (await banco("motorcycles")).find((item) => item.plate === "GUI-4D44");
  if (moto?.ownerId !== novo?._id) problemas.push("a moto não passou a ser do cliente identificado");
  if (problemas.length) throw new Error("OS sem cliente:\n      - " + problemas.join("\n      - "));
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

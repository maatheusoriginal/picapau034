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
// Cadastro entra em maiúsculo: comparar nome com maiúscula/minúscula fixa
// quebraria o roteiro sem nada estar errado no sistema.
const mesmoNome = (valor, esperado) => (valor || "").toLocaleUpperCase("pt-BR") === esperado.toLocaleUpperCase("pt-BR");
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
  if (!/Óleo 20W50/i.test(t)) throw new Error("não entrou: " + t.slice(0, 250));
});
await foto("estoque");

await passo("preço gravado formatado (custo 25 + margem 60% = R$ 40,00)", async () => {
  const t = await txt();
  if (/R\$\s?40,00/.test(t)) return;
  const m = t.match(/Óleo 20W50[\s\S]{0,180}/i);
  throw new Error("preço não saiu formatado: " + (m ? m[0].replace(/\n/g, " | ") : "?"));
});

await passo("vender no PDV em dinheiro com desconto", async () => {
  await ir("PDV Balcão");
  await p.getByRole("button", { name: /Óleo 20W50 Mineral/i }).first().click({ timeout: 10000 });
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
  const m = (await txt()).match(/Óleo 20W50[\s\S]{0,200}/i);
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
  // Tela única: recepção, mão de obra e confirmação sem trocar de tela.
  if (await p.locator(".stepper").count()) throw new Error("a OS voltou a ser por etapas");
  await p.getByPlaceholder("Ex.: 38.420 km").fill("38.420 km");
  await p.locator(".dialog textarea").first().fill("Barulho na relação");
  await p.waitForTimeout(400);
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Troca do kit relação");
  await p.locator(".dialog input[type=number]").first().fill("150");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
  // O total fica no rodapé, à vista o tempo todo enquanto se monta a OS.
  const rodape = await p.locator(".os-single-total").innerText().catch(() => "");
  if (!/150,00/.test(rodape)) throw new Error(`o rodapé não mostra o total: ${JSON.stringify(rodape)}`);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(4000);
  const ordens = await banco("serviceOrders");
  if (ordens.length !== 1) throw new Error(`gravou ${ordens.length} OS, esperado 1`);
  const os = ordens[0];
  if (!/Cliente de Teste/i.test(os.customer || "")) throw new Error(`cliente gravado: "${os.customer}"`);
  if (!/TES-1D23/i.test(os.plate || "")) throw new Error(`placa gravada: "${os.plate}"`);
  if (!/Barulho na relação/i.test(os.problem || "")) throw new Error(`problema gravado: "${os.problem}"`);
  if ((os.items || []).length !== 1) throw new Error(`gravou ${(os.items || []).length} item(ns), esperado a mão de obra`);
  if (Number(os.total) !== 150) throw new Error(`total gravado ${os.total}, esperado 150`);
  // A moto e o cliente novos precisam virar cadastro, não só texto na OS.
  if (!os.clientId) throw new Error("a OS não vinculou o cliente cadastrado");
  if (!os.motorcycleId) throw new Error("a OS não vinculou a motocicleta cadastrada");
  if ((await banco("clients")).length !== 1) throw new Error("o cliente novo não foi cadastrado");
  if ((await banco("motorcycles")).length !== 1) throw new Error("a moto nova não foi cadastrada");
  if (!/Honda CG 160 Fan/i.test(os.bike || "")) throw new Error(`moto gravada: "${os.bike}", esperado do catálogo`);
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

  // Nenhuma seção pode ficar cortada: a barra de abas rolava e sobrava um
  // botão com só o contador ("0") aparecendo, sem nome nenhum. Virou menu
  // lateral, mas a exigência é a mesma.
  const rotulos = await p.locator(".settings-nav-item").allInnerTexts();
  if (rotulos.length !== 8) problemas.push(`${rotulos.length} seções, esperado 8`);
  if (!rotulos.every((t) => /[A-Za-zÀ-ú]/.test(t))) problemas.push("seção sem nome visível: " + JSON.stringify(rotulos));
  const foraDaTela = await p.locator(".settings-nav-item").evaluateAll((els) =>
    els.filter((e) => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 1 || b.x < -1; }).map((e) => e.innerText.replace(/\n/g, " ")));
  if (foraDaTela.length) problemas.push("seção fora da tela: " + foraDaTela.join(", "));

  // Salvar sem o obrigatório precisa dizer o que falta, em português, e ficar
  // na tela. Era o aviso do navegador, em inglês, que sumia sozinho — e por
  // isso parecia que a aba simplesmente não salvava.
  await p.locator(".settings-nav-item", { hasText: "Serviços" }).first().click();
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
  await p.locator(".settings-nav-item", { hasText: "Pagamentos" }).first().click();
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
  await p.locator(".settings-nav-item", { hasText: "Impressão" }).first().click();
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
  await p.locator(".settings-nav-item", { hasText: "Serviços" }).first().click();
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
  // estoque não juntava nada. Agora sai da lista, com o "+" ao lado para
  // criar o que ainda não está nela.
  const marca = p.locator(".dialog-window .quick-add select").nth(1);
  const marcas = await marca.locator("option").allInnerTexts();
  if (marcas.length < 6) problemas.push(`lista de marcas com ${marcas.length} opção(ões)`);
  if ((await p.locator(".dialog-window .quick-add-open").count()) < 2)
    problemas.push("falta o botão de criar do lado da categoria e da marca");
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
  await p.locator(".settings-nav-item", { hasText: "Parceiros" }).first().click();
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
  const rotulos = async () => p.locator(".dialog-window select").evaluateAll((els) => els.map((e) => (e.closest("label, .field-group")?.innerText || "").split("\n")[0]));
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

  // 3. a OS começa escolhendo a parceira, e tudo cabe numa tela só.
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  if (await p.locator(".stepper").count()) problemas.push("a OS voltou a ser por etapas");
  if ((await p.locator(".os-single-columns").count()) !== 1) problemas.push("a OS não abriu na tela única");
  // Quem, qual moto, a recepção e os itens: tudo à vista de uma vez.
  const naTela = await p.locator(".os-single").innerText();
  for (const pedaco of ["Quem responde por esta OS", "Motocicleta", "Quilometragem", "Adicionar peças", "Adicionar mão de obra"]) {
    if (!naTela.includes(pedaco)) problemas.push(`a tela única não traz "${pedaco}"`);
  }
  if ((await p.locator(".os-party-switch button").count()) !== 2) problemas.push("não dá para escolher entre cliente e parceira");

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

  await p.getByPlaceholder("Ex.: 38.420 km").fill("12.000 km");
  await p.locator(".dialog textarea").first().fill("Revisão da frota");
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Revisão completa");
  await p.locator(".dialog input[type=number]").first().fill("200");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
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
  const rotulos = await p.locator(".dialog-window select").evaluateAll((els) => els.map((e) => (e.closest("label, .field-group")?.innerText || "").split("\n")[0]));
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
  const rotulos2 = await p.locator(".dialog-window select").evaluateAll((els) => els.map((e) => (e.closest("label, .field-group")?.innerText || "").split("\n")[0]));
  const versao = p.locator(".dialog-window select").nth(rotulos2.findIndex((t) => /Versão/i.test(t)));
  const versoes = await versao.locator("option").allInnerTexts();
  if (!versoes.some((t) => /Fan/.test(t))) problemas.push(`CG 160 não trouxe as versões: ${JSON.stringify(versoes)}`);
  await versao.selectOption("Fan");
  await p.waitForTimeout(700);
  // A dica de como o modelo fica gravado é uma entre várias no formulário — a
  // da empresa parceira vem antes dela —, então procura em todas.
  const dicas = await p.locator(".dialog-window .settings-hint").allInnerTexts();
  if (!dicas.some((texto) => /CG 160 Fan/i.test(texto))) problemas.push(`não mostrou como fica gravado: ${JSON.stringify(dicas)}`);
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
  // Digitar LISTA quem bateu; escolher é o clique. Antes o campo já prendia a
  // OS no primeiro cliente que batesse, sem mostrar que havia outros.
  const listados = await p.locator(".os-search-results > button").allInnerTexts();
  if (!listados.length) problemas.push("a busca não listou os clientes encontrados");
  if (await p.locator(".os-picked").count()) problemas.push("digitar já escolheu o cliente sozinho");
  await p.locator(".os-search-results > button", { hasText: "Cliente de Teste" }).first().click();
  await p.waitForTimeout(1000);
  const achado = await p.locator(".os-picked").innerText().catch(() => "");
  if (!/Cliente de Teste/i.test(achado)) problemas.push(`não achou o cliente: ${JSON.stringify(achado)}`);
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
  await p.locator(".os-picked-change", { hasText: /^Trocar$/ }).click();
  await p.waitForTimeout(800);
  if (!(await p.locator(".os-search input").count())) problemas.push("trocar não voltou para a busca");
  if (!/Escolha o cliente acima/.test(await p.locator(".os-block").nth(1).innerText()))
    problemas.push("trocar de cliente deixou a moto do anterior escolhida");

  await p.locator(".dialog-footer .ghost-button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  if (problemas.length) throw new Error("etapa 1 da OS:\n      - " + problemas.join("\n      - "));
});

await passo("dois clientes com o mesmo nome: a busca lista os dois e a OS vai para o certo", async () => {
  // Pai e filho, dois Silva, a mesma pessoa cadastrada duas vezes: a busca
  // fazia `.find()` e prendia a OS no PRIMEIRO que batesse, sem mostrar que
  // existia outro. A OS saía no nome errado, com a moto errada para escolher.
  const problemas = [];

  for (const pessoa of [
    { nome: "Joaquim Ribeiro", telefone: "34911112222", placa: "JOA-1A11", versao: "Titan" },
    { nome: "Joaquim Ribeiro Filho", telefone: "34933334444", placa: "JOA-2A22", versao: "Fan" },
  ]) {
    await ir("Clientes");
    await p.getByRole("button", { name: /Cadastrar cliente|Novo cliente|Adicionar cliente/i }).first().click();
    await p.waitForTimeout(2200);
    await p.locator('.dialog-window input[placeholder*="Carlos Eduardo"]').fill(pessoa.nome);
    await p.locator(".dialog-tabs button", { hasText: /Contato/ }).click();
    await p.waitForTimeout(600);
    await p.locator(".dialog-window input").first().fill(pessoa.telefone);
    await p.locator(".dialog-tabs button", { hasText: /Dados Pessoais/ }).click();
    await p.waitForTimeout(600);
    await p.locator('.client-moto-block input[placeholder*="ABC-1234"]').fill(pessoa.placa);
    await p.waitForTimeout(400);
    const listas = p.locator(".client-moto-block select");
    await listas.nth(0).selectOption("Honda"); await p.waitForTimeout(600);
    await listas.nth(1).selectOption("CG 150"); await p.waitForTimeout(600);
    await listas.nth(2).selectOption(pessoa.versao); await p.waitForTimeout(500);
    await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
    await p.waitForTimeout(3500);
  }
  const oFilho = (await banco("clients")).find((item) => mesmoNome(item.name, "Joaquim Ribeiro Filho"));
  if (!oFilho) throw new Error("os dois homônimos não foram cadastrados");

  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  await p.locator(".os-search input").first().fill("Joaquim");
  await p.waitForTimeout(1300);
  const achados = await p.locator(".os-search-results > button").allInnerTexts();
  if (achados.length !== 2) problemas.push(`a busca listou ${achados.length} cliente(s), esperado os dois Joaquim`);
  if (await p.locator(".os-picked").count()) problemas.push("digitar escolheu um dos dois sozinho");
  // Cada linha precisa dar para diferenciar: telefone e placa da moto.
  if (!achados.some((texto) => /JOA-2A22/.test(texto))) problemas.push(`a lista não mostra a placa para diferenciar: ${JSON.stringify(achados)}`);

  // O SEGUNDO da lista — justamente o que o `.find()` nunca escolheria.
  await p.locator(".os-search-results > button", { hasText: "Joaquim Ribeiro Filho" }).first().click();
  await p.waitForTimeout(1100);
  const escolhido = await p.locator(".os-picked").innerText().catch(() => "");
  if (!/Joaquim Ribeiro Filho/i.test(escolhido)) problemas.push(`escolheu outro cliente: ${JSON.stringify(escolhido)}`);
  const motoDoBloco = await p.locator(".os-block").nth(1).innerText();
  if (/JOA-1A11/.test(motoDoBloco)) problemas.push("mostrou a moto do homônimo");

  await p.getByPlaceholder("Ex.: 38.420 km").fill("21.000 km");
  await p.locator(".dialog textarea").first().fill("Revisão dos 20 mil");
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Revisão");
  await p.locator(".dialog input[type=number]").first().fill("90");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
  await p.locator(".dialog-footer .primary-button").click(); await p.waitForTimeout(4500);

  // A conferência que vale: no banco, a OS é do filho, com a moto do filho.
  const aberta = (await banco("serviceOrders")).find((ordem) => ordem.plate === "JOA-2A22");
  if (!aberta) problemas.push("a OS do homônimo escolhido não foi gravada");
  else {
    if (!mesmoNome(aberta.customer, "Joaquim Ribeiro Filho")) problemas.push(`a OS saiu no nome de "${aberta.customer}"`);
    if (aberta.clientId !== oFilho._id) problemas.push("a OS ficou vinculada ao cliente errado");
  }
  if (problemas.length) throw new Error("homônimos na busca:\n      - " + problemas.join("\n      - "));
});

await passo("busca por placa acha o dono, e o histórico dele abre quando pedido", async () => {
  // A moto chega no portão e o balcão lê a PLACA — ninguém pergunta o nome
  // antes. E com a moto na frente a pergunta seguinte é sempre a mesma: o que
  // já foi feito nela? A resposta estava só no caderno.
  const problemas = [];
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }

  // A placa do passo 6, digitada sem hífen, como quem lê a moto de longe.
  await p.locator(".os-search input").first().fill("tes1d23");
  await p.waitForTimeout(1300);
  const achados = await p.locator(".os-search-results > button").allInnerTexts();
  if (achados.length !== 1) problemas.push(`a busca por placa achou ${achados.length}, esperado só o dono`);
  if (!achados.some((texto) => /Cliente de Teste/i.test(texto))) problemas.push(`a placa não achou o dono: ${JSON.stringify(achados)}`);
  if (!(await p.locator(".os-search-hit").count())) problemas.push("não marcou qual placa bateu");

  await p.locator(".os-search-results > button").first().click();
  await p.waitForTimeout(1200);
  // Achou pela placa: a moto já tem de vir escolhida, sem procurar de novo.
  const blocoDaMoto = await p.locator(".os-block").nth(1).innerText();
  if (!/TES-1D23/.test(blocoDaMoto)) problemas.push(`a moto da placa não veio escolhida: ${JSON.stringify(blocoDaMoto.slice(0, 120))}`);

  // O histórico fica FECHADO até alguém pedir.
  if (await p.locator(".history-panel").count()) problemas.push("o histórico apareceu sem ninguém pedir");
  await p.locator(".os-picked-change", { hasText: /Ver histórico/ }).click();
  await p.waitForTimeout(900);
  const historico = await p.locator(".history-panel").innerText().catch(() => "");
  if (!historico) problemas.push("o botão de ver histórico não abriu nada");
  // A OS do passo 6 foi encerrada por R$ 150 em dinheiro: é o que tem de estar lá.
  if (!/Troca do kit relação/i.test(historico)) problemas.push(`o histórico não traz o serviço feito: ${JSON.stringify(historico.slice(0, 200))}`);
  if (!/150,00/.test(historico)) problemas.push(`o histórico não traz o valor: ${JSON.stringify(historico.slice(0, 200))}`);
  if (!/TES-1D23/.test(historico)) problemas.push("o histórico não diz em qual moto foi");
  await p.locator(".os-picked-change", { hasText: /Ocultar histórico/ }).click();
  await p.waitForTimeout(700);
  if (await p.locator(".history-panel").count()) problemas.push("não deu para fechar o histórico");

  await p.locator(".dialog-footer .ghost-button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);

  // A mesma busca por placa, e o mesmo histórico, na aba de Clientes.
  await ir("Clientes");
  await p.locator(".mini-search input").first().fill("tes1d23");
  await p.waitForTimeout(1200);
  const linhas = await p.locator(".registry-item").count();
  if (linhas !== 1) problemas.push(`a aba de clientes achou ${linhas} pela placa, esperado 1`);
  await p.locator(".registry-history-button").first().click();
  await p.waitForTimeout(900);
  const naLista = await p.locator(".history-panel").innerText().catch(() => "");
  if (!/Troca do kit relação/i.test(naLista)) problemas.push(`o histórico da aba de clientes veio vazio: ${JSON.stringify(naLista.slice(0, 200))}`);
  if (!/Entregue/.test(naLista)) problemas.push("o histórico não mostra que a OS foi entregue");
  await p.locator(".mini-search input").first().fill("");
  await p.waitForTimeout(800);
  if (problemas.length) throw new Error("placa e histórico:\n      - " + problemas.join("\n      - "));
});

await passo("mecânico com login mas sem cadastro entra na OS pelo aviso", async () => {
  // O caso real: a pessoa é criada em "Usuários e acessos" com o cargo
  // Mecânico. Isso grava em `userAccess`/`users`; a OS lê `employees`. O
  // resultado era alguém que entra no sistema e não existe para a oficina —
  // não aparecia no seletor de mecânicos e nada avisava.
  const problemas = [];
  const texto = (valor) => ({ stringValue: valor });
  await fetch("http://127.0.0.1:8080/v1/projects/picapau-teste/databases/(default)/documents/userAccess/uid-erasmo", {
    method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: {
      uid: texto("uid-erasmo"), name: texto("ERASMO SOUZA"), email: texto("erasmo@picapau.test"),
      phone: texto("(34) 98888-1111"), role: texto("Mecânico"), employeeId: texto(""),
      active: { booleanValue: true }, mustChangePassword: { booleanValue: false },
      permissions: { arrayValue: { values: ["orders.view", "orders.update", "budgets.view", "inventory.view", "customers.view"].map(texto) } },
    } }),
  });
  await fetch("http://127.0.0.1:8080/v1/projects/picapau-teste/databases/(default)/documents/users/uid-erasmo", {
    method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: { uid: texto("uid-erasmo"), name: texto("ERASMO SOUZA"), email: texto("erasmo@picapau.test"), role: texto("Mecânico"), active: { booleanValue: true } } }),
  });
  await p.reload();
  await p.waitForTimeout(4000);

  const antesDaCorrecao = (await banco("employees")).some((item) => /ERASMO/i.test(item.name || ""));
  if (antesDaCorrecao) problemas.push("o funcionário já existia; o teste não reproduz o caso");

  await p.locator(".nav-item", { hasText: "Usuários e acessos" }).first().click();
  await p.waitForTimeout(2500);
  const aviso = await p.locator(".access-fix-banner").innerText().catch(() => "");
  if (!/ERASMO SOUZA/i.test(aviso)) problemas.push(`a tela não apontou o mecânico sem cadastro: ${JSON.stringify(aviso)}`);
  if (!/abertura de OS/i.test(aviso)) problemas.push("o aviso não explica o efeito");

  await p.locator(".access-fix-banner button").click();
  await p.waitForTimeout(5000);
  const criado = (await banco("employees")).find((item) => /ERASMO/i.test(item.name || ""));
  if (!criado) problemas.push("o botão não criou o cadastro de funcionário");
  else {
    if (criado.isMechanic !== true) problemas.push("o funcionário criado não ficou como mecânico");
    // Sem o vínculo de volta, o próximo carregamento criaria um segundo
    // cadastro da mesma pessoa, casando pelo nome outra vez.
    const conta = (await banco("userAccess")).find((item) => item.uid === "uid-erasmo");
    if (conta?.employeeId !== criado._id) problemas.push(`a conta não guardou o vínculo: ${JSON.stringify(conta?.employeeId)}`);
  }
  if (await p.locator(".access-fix-banner").count()) problemas.push("o aviso continuou depois de resolvido");

  // A prova que importa: agora ele aparece para escolher na nova OS.
  await ir("Ordens de serviço");
  await p.getByRole("button", { name: /Abrir nova OS/i }).first().click();
  await p.waitForTimeout(1500);
  if (await p.getByText(/tipo de atendimento/i).count()) {
    await p.getByText(/Abrir OS completa/i).first().click();
    await p.waitForTimeout(1800);
  }
  const mecanicos = await p.locator(".mechanic-picker button").allInnerTexts();
  if (!mecanicos.some((linha) => /ERASMO/i.test(linha))) problemas.push(`o mecânico continua fora da OS: ${JSON.stringify(mecanicos)}`);
  await p.locator(".dialog-footer .ghost-button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  if (problemas.length) throw new Error("mecânico sem cadastro:\n      - " + problemas.join("\n      - "));
});

await passo("lista de peças: colunas, filtro por grupo e contagem", async () => {
  // A lista era um cartão por peça, com nome e pouco mais: para conferir código,
  // localização ou código de barras era preciso abrir o cadastro de cada uma.
  // Agora é uma linha por peça, com tudo o que o balcão pergunta.
  const problemas = [];
  await ir("Produtos e estoque");
  const colunas = await p.locator(".stock-table thead th").allInnerTexts();
  for (const coluna of ["CÓDIGO", "REFERÊNCIA", "CÓD. BARRAS", "DESCRIÇÃO", "GRUPO", "LOCAL", "PREÇO", "ESTOQUE", "UN."]) {
    if (!colunas.some((texto) => texto.trim().toUpperCase() === coluna)) problemas.push(`falta a coluna ${coluna}: ${JSON.stringify(colunas)}`);
  }
  const total = await p.locator(".stock-table tbody tr").count();
  if (!total) problemas.push("a lista de peças veio vazia");
  if (!/registro/.test(await p.locator(".stock-count").innerText())) problemas.push("não mostra quantos registros");

  // Procurar pelo CÓDIGO, que é como a peça é pedida no balcão.
  await p.locator(".stock-toolbar .mini-search input").fill("PRD-001");
  await p.waitForTimeout(900);
  if ((await p.locator(".stock-table tbody tr").count()) !== 1) problemas.push("procurar pelo código não filtrou");
  const contagem = await p.locator(".stock-count").innerText();
  if (!/1 de/.test(contagem)) problemas.push(`a contagem não acompanha o filtro: ${JSON.stringify(contagem)}`);

  // "Limpar" devolve a lista inteira — sem isso o filtro fica preso e a peça
  // seguinte "some" do sistema para quem não percebeu que havia busca ativa.
  await p.locator(".stock-toolbar .outline-button", { hasText: /Limpar/ }).click();
  await p.waitForTimeout(900);
  if ((await p.locator(".stock-table tbody tr").count()) !== total) problemas.push("Limpar não devolveu a lista inteira");

  // O filtro por grupo: a oficina procura "todos os óleos".
  const grupos = await p.locator(".stock-group-filter select option").allInnerTexts();
  if (grupos.length < 2) problemas.push(`o filtro de grupo veio vazio: ${JSON.stringify(grupos)}`);
  await p.locator(".stock-group-filter select").selectOption({ index: 1 });
  await p.waitForTimeout(900);
  if (!(await p.locator(".stock-table tbody tr").count())) problemas.push("filtrar por grupo não achou nada");
  await p.locator(".stock-toolbar .outline-button", { hasText: /Limpar/ }).click();
  await p.waitForTimeout(700);
  if (problemas.length) throw new Error("lista de peças:\n      - " + problemas.join("\n      - "));
});

await passo("criar categoria e marca sem sair do cadastro, e o preço mostrar a conta certa", async () => {
  // Descobrir no meio do cadastro que a categoria da peça não existe obrigava a
  // fechar o formulário, ir em Configurações, criar, voltar e digitar tudo de
  // novo. Na prática ninguém faz: joga em "Peças" e segue, e o filtro do
  // estoque para de significar alguma coisa.
  const problemas = [];
  const categoriasAntes = (await banco("categories")).length;
  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Adicionar produto/i }).first().click();
  await p.waitForTimeout(2200);

  // O "+" fica do lado do campo, na mesma linha.
  const botoesDeCriar = await p.locator(".dialog-window .quick-add-open").count();
  if (botoesDeCriar < 2) problemas.push(`achei ${botoesDeCriar} botão(ões) de criar, esperado categoria e marca`);

  // Pelo rótulo, e não pela ordem: qual "+" é o primeiro no HTML muda com
  // qualquer campo novo, e o erro sairia como "não achei o input".
  const campoCategoria = p.locator(".dialog-window .field-group", { hasText: "Categoria do Produto" }).first();
  // O campo de digitar é achado pelo placeholder, e não por "o input daqui":
  // quando um passo falha por seletor, a mensagem precisa dizer o que faltou.
  const novaCategoria = campoCategoria.getByPlaceholder("Ex: FILTROS");
  const camadasAntes = await p.evaluate(() => ({
    backdrops: document.querySelectorAll(".dialog-backdrop").length,
    janelas: document.querySelectorAll(".dialog-window").length,
    camadas: document.querySelectorAll(".dialog-layer").length,
  }));
  await campoCategoria.locator(".quick-add-open").click();
  // Instrumentado: o campo abria e sumia antes de dar para digitar, e a
  // mensagem de erro só dizia "não achei o input".
  if (!await novaCategoria.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
    await foto("diag-categoria");
    throw new Error(`o "+" da categoria não abriu o campo.\n      camadas antes: ${JSON.stringify(camadasAntes)}\n      html: ${(await campoCategoria.innerHTML().catch(() => "?")).slice(0, 320)}`);
  }
  // Digitado como quem digita — clicar e teclar —, e não com `fill`: e quando
  // não dá, a mensagem traz o motivo que o Playwright deu, em vez de só
  // "esgotou o tempo".
  const digitar = async (campo, valor) => {
    try {
      await campo.click({ timeout: 10000 });
      await campo.fill("", { timeout: 5000 });
      await campo.pressSequentially(valor, { delay: 15, timeout: 10000 });
    } catch (erro) {
      await foto("diag-digitar");
      throw new Error(`não deu para digitar "${valor}".\n      ${String(erro).split("\n").slice(0, 8).join("\n      ")}\n      html: ${(await campoCategoria.innerHTML().catch(() => "?")).slice(0, 320)}`);
    }
  };
  // Nome repetido não vira item novo: sem isso a lista encheria de "Filtros",
  // "FILTROS" e "filtros " — o problema que a lista veio resolver. "Filtros"
  // é uma das categorias padrão da oficina.
  await digitar(novaCategoria, "filtros");
  await p.waitForTimeout(400);
  await campoCategoria.locator(".quick-add-confirm").click();
  await p.waitForTimeout(900);
  const aviso = await campoCategoria.locator(".quick-add-error").innerText().catch(() => "");
  if (!/já está na lista/i.test(aviso)) problemas.push(`devia recusar a categoria repetida: ${JSON.stringify(aviso)}`);
  if (!(await novaCategoria.count())) problemas.push("recusar o nome repetido fechou o campo em vez de deixar corrigir");

  await digitar(novaCategoria, "filtros de ar");
  await p.waitForTimeout(400);
  await campoCategoria.locator(".quick-add-confirm").click();
  await p.waitForTimeout(3000);
  const categoriasDepois = await banco("categories");
  const criada = categoriasDepois.find((item) => /^FILTROS DE AR$/i.test(item.name || ""));
  if (!criada) problemas.push("a categoria não foi gravada");
  else {
    if (criada.name !== "FILTROS DE AR") problemas.push(`gravou "${criada.name}", esperado em maiúsculo`);
    if (criada.group !== "Produtos") problemas.push(`gravou no grupo "${criada.group}"`);
  }
  // A oficina sem categoria cadastrada vê as nove padrão. Elas não são
  // documentos: gravar só a nova fazia a coleção deixar de estar vazia e as
  // outras NOVE SUMIREM da tela de uma vez.
  if (categoriasAntes === 0) {
    if (!categoriasDepois.some((item) => /^Filtros$/i.test(item.name || ""))) {
      problemas.push(`criar a primeira categoria apagou as padrão da tela: ${JSON.stringify(categoriasDepois.map((item) => item.name))}`);
    }
    if (categoriasDepois.length < 10) problemas.push(`ficaram ${categoriasDepois.length} categorias, esperado as 9 padrão mais a nova`);
  } else if (categoriasDepois.length !== categoriasAntes + 1) {
    problemas.push("criou mais de uma categoria");
  }
  // E já fica escolhida: o cadastro continua de onde estava.
  const escolhida = await campoCategoria.locator("select").inputValue();
  if (escolhida !== "FILTROS DE AR") problemas.push(`a categoria nova não ficou selecionada: ${JSON.stringify(escolhida)}`);

  // A marca é item de uma lista dentro de settings/lists, e não documento.
  const campoMarca = p.locator(".dialog-window .field-group", { hasText: "Marca / Fabricante" }).first();
  const novaMarca = campoMarca.getByPlaceholder("Ex: COBREQ");
  await campoMarca.locator(".quick-add-open").click();
  if (!await novaMarca.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
    await foto("diag-marca");
    throw new Error(`o "+" da marca não abriu o campo. html: ${(await campoMarca.innerHTML().catch(() => "?")).slice(0, 320)}`);
  }
  // "Cobreq" já vem na lista padrão da oficina: tem de ser recusada.
  await digitar(novaMarca, "cobreq");
  await p.waitForTimeout(400);
  await campoMarca.locator(".quick-add-confirm").click();
  await p.waitForTimeout(1000);
  const avisoMarca = await campoMarca.locator(".quick-add-error").innerText().catch(() => "");
  if (!/já está na lista/i.test(avisoMarca)) problemas.push(`devia recusar a marca repetida: ${JSON.stringify(avisoMarca)}`);

  await digitar(novaMarca, "piapetro");
  await p.waitForTimeout(400);
  await campoMarca.locator(".quick-add-confirm").click();
  await p.waitForTimeout(3500);
  const listas = (await banco("settings")).find((item) => item._id === "lists");
  const marcas = (listas?.partBrands || []).map((nome) => String(nome));
  if (!marcas.some((nome) => /^PIAPETRO$/i.test(nome))) {
    problemas.push(`a marca não entrou na lista: ${JSON.stringify(marcas)}`);
  }
  // A lista padrão não pode sumir quando a primeira marca é criada.
  if (!marcas.some((nome) => /^Motul$/i.test(nome))) {
    problemas.push(`criar a marca apagou as padrão: ${JSON.stringify(marcas)}`);
  }

  // --- o preço mostra a conta que decide a venda ---
  await p.locator(".dialog-window .dialog-input").first().fill("FILTRO DE AR TESTE");
  await p.locator(".dialog-window .dialog-tabs button", { hasText: /Preço|Preços/i }).first().click();
  await p.waitForTimeout(900);
  const camposDePreco = p.locator(".pricing-box input");
  await camposDePreco.nth(0).fill("25");
  await p.waitForTimeout(500);
  await camposDePreco.nth(1).fill("60");
  await p.waitForTimeout(900);
  const cartao = await p.locator(".profit-summary-card").innerText();
  // "+60%" é margem sobre o CUSTO. Sobre a VENDA isso é 37,5% — e é essa a
  // porcentagem que se compara com a do cartão e a do concorrente.
  if (!/Margem sobre o custo/i.test(cartao)) problemas.push("o cartão não diz que a margem é sobre o custo");
  if (!/Margem sobre a venda/i.test(cartao)) problemas.push("falta a margem sobre a venda");
  if (!/37,5%/.test(cartao)) problemas.push(`a margem sobre a venda de 25→40 devia ser 37,5%: ${JSON.stringify(cartao)}`);
  if (!/Desconto máximo sem prejuízo/i.test(cartao)) problemas.push("falta o desconto máximo sem prejuízo");

  // Preço abaixo do custo precisa avisar, não só ficar vermelho.
  await camposDePreco.nth(2).fill("20").catch(() => {});
  await p.waitForTimeout(900);
  const alerta = await p.locator(".price-warning").innerText().catch(() => "");
  if (alerta && !/abaixo do custo/i.test(alerta)) problemas.push(`aviso inesperado: ${JSON.stringify(alerta)}`);

  await p.locator(".dialog-window button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  if (problemas.length) throw new Error("criar na hora e preço:\n      - " + problemas.join("\n      - "));
});

await passo("nota do fornecedor: confere, compara o custo e dá entrada com o fator certo", async () => {
  // Cadastrar peça a peça depois de cada compra é o que ninguém faz: a nota
  // chega com trinta itens e o estoque do sistema fica meses atrás do estoque
  // da prateleira. O XML já traz tudo, inclusive o custo real pago.
  const problemas = [];
  const antesDaNota = await banco("products");
  const oleo = antesDaNota.find((produto) => /ÓLEO 20W50 MINERAL/i.test(produto.name || ""));
  if (!oleo) throw new Error("o produto do passo 2 sumiu; sem ele não dá para comparar custo");
  const estoqueAntes = Number(oleo.stock) || 0;

  // O óleo do passo 2 foi cadastrado sem código de barras — como acontece com
  // peça de moto o tempo todo. Então a nota traz a descrição igualzinha à do
  // cadastro, que é o último recurso do casamento, e o fator é digitado à mão:
  // "2 CX" sem dizer quantas unidades vêm na caixa é exatamente o caso em que
  // o balcão precisa corrigir o número.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe35260612345678000199550010000098761000098765" versao="4.00">
  <ide><nNF>9876</nNF><serie>1</serie><dhEmi>2026-06-28T09:00:00-03:00</dhEmi></ide>
  <emit><CNPJ>12345678000199</CNPJ><xNome>DISTRIBUIDORA TESTE LTDA</xNome></emit>
  <det nItem="1"><prod><cProd>OL-2050</cProd><cEAN>SEM GTIN</cEAN>
   <xProd>${oleo.name}</xProd><NCM>27101932</NCM>
   <uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>360.0000</vUnCom><vProd>720.00</vProd></prod></det>
  <det nItem="2"><prod><cProd>REL-428</cProd><cEAN>SEM GTIN</cEAN>
   <xProd>KIT RELACAO 428H</xProd><NCM>87141000</NCM>
   <uCom>UN</uCom><qCom>3.0000</qCom><vUnCom>90.0000</vUnCom><vProd>270.00</vProd></prod></det>
 </infNFe></NFe>
</nfeProc>`;

  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Importar nota/i }).first().click();
  await p.waitForTimeout(1500);
  await p.locator('.dialog input[type="file"]').setInputFiles({ name: "nota-9876.xml", mimeType: "text/xml", buffer: Buffer.from(xml, "utf-8") });
  await p.waitForTimeout(2500);

  const cabecalho = await p.locator(".nfe-head").innerText().catch(() => "");
  if (!/DISTRIBUIDORA TESTE/i.test(cabecalho)) problemas.push(`não leu o fornecedor: ${JSON.stringify(cabecalho)}`);
  if (!/9876/.test(cabecalho)) problemas.push("não leu o número da nota");
  if (!/28\/06\/2026/.test(cabecalho)) problemas.push("não leu a data no formato brasileiro");

  const linhas = await p.locator(".nfe-table tbody tr").count();
  if (linhas !== 2) problemas.push(`a nota apareceu com ${linhas} linha(s), esperado 2`);
  const linhaDoOleo = p.locator(".nfe-table tbody tr").first();
  const primeira = await linhaDoOleo.innerText();
  // Achou o produto já cadastrado, e diz por quê.
  if (!/Já cadastrada/i.test(primeira)) problemas.push(`não reconheceu o produto já cadastrado: ${JSON.stringify(primeira)}`);
  if (!/descrição/i.test(primeira)) problemas.push(`não diz como achou o produto: ${JSON.stringify(primeira)}`);
  // A descrição não diz quantas unidades vêm na caixa: o palpite é 1, e é o
  // balcão que corrige. Errar aqui é o que faz a peça "acabar" no sistema com
  // cinco ainda na caixa e o custo unitário ficar doze vezes maior.
  const fatorSugerido = await linhaDoOleo.locator(".nfe-fator").inputValue();
  if (fatorSugerido !== "1") problemas.push(`sem pista na descrição o fator devia ficar em 1, veio ${JSON.stringify(fatorSugerido)}`);
  await linhaDoOleo.locator(".nfe-fator").fill("12");
  await p.waitForTimeout(900);
  const comFator = await linhaDoOleo.innerText();
  if (!/\b24\b/.test(comFator)) problemas.push(`não recalculou 2 caixas × 12 = 24: ${JSON.stringify(comFator)}`);
  // A nota traz R$ 360 a caixa; o custo da unidade é 30, não 360.
  if (!/30,00/.test(comFator)) problemas.push(`o custo unitário devia ser R$ 30,00: ${JSON.stringify(comFator)}`);
  // E a comparação com o custo que estava no cadastro. O custo vem do banco,
  // e não escrito aqui: a entrada do passo 9 recalcula o custo médio, e fixar
  // o número reprovaria a tela por causa de outro passo.
  const custoAntes = Number(String(oleo.cost ?? "").replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".")) || 0;
  if (custoAntes > 0) {
    if (!comFator.includes(custoAntes.toLocaleString("pt-BR", { minimumFractionDigits: 2 }))) {
      problemas.push(`não mostrou o custo anterior de ${custoAntes}: ${JSON.stringify(comFator)}`);
    }
    const esperada = Math.round(((30 - custoAntes) / custoAntes) * 1000) / 10;
    if (!comFator.includes(`${esperada > 0 ? "+" : ""}${esperada.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`)) {
      problemas.push(`não mostrou a variação de ${esperada}%: ${JSON.stringify(comFator)}`);
    }
  }
  // Fator zero é recusado, em vez de virar 1 em silêncio.
  await linhaDoOleo.locator(".nfe-fator").fill("0");
  await p.waitForTimeout(700);
  if (!/Informe quantas unidades/i.test(await linhaDoOleo.innerText())) problemas.push("fator zero devia ser recusado com aviso");
  await linhaDoOleo.locator(".nfe-fator").fill("12");
  await p.waitForTimeout(700);
  const segunda = await p.locator(".nfe-table tbody tr").nth(1).innerText();
  if (!/Cadastrar esta peça/i.test(segunda)) problemas.push("a peça nova não oferece cadastrar");

  await p.locator(".dialog-footer .primary-button").click();
  await p.waitForTimeout(6000);

  const depois = await banco("products");
  const oleoDepois = depois.find((produto) => produto._id === oleo._id);
  const nova = depois.find((produto) => /KIT RELACAO 428H/i.test(produto.name || ""));
  if (Number(oleoDepois?.stock) !== estoqueAntes + 24) problemas.push(`o estoque foi para ${oleoDepois?.stock}, esperado ${estoqueAntes + 24}`);
  if (!nova) problemas.push("a peça nova da nota não foi cadastrada");
  else {
    if (Number(nova.stock) !== 3) problemas.push(`a peça nova entrou com ${nova.stock}, esperado 3`);
    if (nova.name !== "KIT RELACAO 428H") problemas.push(`a peça nova gravou "${nova.name}", esperado em maiúsculo`);
    // Peça sem GTIN não pode nascer com "SEM GTIN" como código de barras.
    if (nova.barcode) problemas.push(`peça sem GTIN nasceu com código de barras "${nova.barcode}"`);
  }
  const entradas = await banco("stockEntries");
  const daNota = entradas.find((entrada) => /9876/.test(String(entrada.payment || "")));
  if (!daNota) problemas.push("a entrada de estoque da nota não foi gravada");
  else if (Number(daNota.total) !== 990) problemas.push(`a entrada gravou ${daNota.total}, esperado 990 (24×30 + 3×90)`);
  if (problemas.length) throw new Error("nota do fornecedor:\n      - " + problemas.join("\n      - "));
});

await passo("Configurações: menu com o que cada seção resolve, e busca pelas palavras da oficina", async () => {
  // Eram oito abas em pílulas que quebravam a linha: para achar onde se muda a
  // margem padrão era preciso abrir uma por uma, e quem não sabia o nome da
  // aba não achava nunca.
  const problemas = [];
  await p.locator(".nav-item", { hasText: "Configurações" }).first().click();
  await p.waitForTimeout(2500);

  const secoes = await p.locator(".settings-nav-item").allInnerTexts();
  if (secoes.length !== 8) problemas.push(`o menu tem ${secoes.length} seção(ões), esperado 8`);
  // Cada item diz o que resolve, e não só o nome da aba.
  if (!secoes.every((texto) => texto.split("\n").length >= 2)) problemas.push("alguma seção está sem a explicação do que resolve");
  // Seção com item cadastrado mostra quantos: seção vazia é o que a oficina
  // precisa ver de longe (sem forma de pagamento, o PDV não recebe).
  const pagamentos = secoes.find((texto) => /Pagamentos/i.test(texto)) ?? "";
  if (!/\d/.test(pagamentos)) problemas.push(`a seção de pagamentos não mostra a contagem: ${JSON.stringify(pagamentos)}`);

  // A busca é pelas palavras da oficina. Ninguém adivinha que a margem mora em
  // "Estoque e reposição".
  await p.locator(".settings-nav-search input").fill("margem");
  await p.waitForTimeout(900);
  const porMargem = await p.locator(".settings-nav-item").allInnerTexts();
  if (porMargem.length !== 1 || !/Estoque e reposição/i.test(porMargem[0] || "")) {
    problemas.push(`buscar "margem" devia levar ao estoque: ${JSON.stringify(porMargem)}`);
  }
  // E a seção aberta acompanha a busca, senão o conteúdo à direita fica órfão.
  const aberto = await p.locator(".settings-content h2").first().innerText().catch(() => "");
  if (!/margem|estoque/i.test(aberto)) problemas.push(`a busca não abriu a seção achada: ${JSON.stringify(aberto)}`);

  // "de", "do" e "da" são o jeito de falar, não o que se procura.
  await p.locator(".settings-nav-search input").fill("taxa do cartão");
  await p.waitForTimeout(900);
  const porTaxa = await p.locator(".settings-nav-item").allInnerTexts();
  if (!porTaxa.some((texto) => /Pagamentos/i.test(texto))) problemas.push(`buscar "taxa do cartão" devia levar aos pagamentos: ${JSON.stringify(porTaxa)}`);

  // Sem acento também, que é como se digita no meio do atendimento.
  await p.locator(".settings-nav-search input").fill("combustivel");
  await p.waitForTimeout(900);
  const porCombustivel = await p.locator(".settings-nav-item").allInnerTexts();
  if (!porCombustivel.some((texto) => /Listas do sistema/i.test(texto))) problemas.push(`a busca devia ignorar o acento: ${JSON.stringify(porCombustivel)}`);

  await p.locator(".settings-nav-search input").fill("carburador de trator");
  await p.waitForTimeout(900);
  if (!(await p.locator(".settings-nav-empty").count())) problemas.push("busca sem resultado não avisa nada");

  // Limpar volta as oito, e a seção continua aberta.
  await p.locator(".settings-nav-search input").fill("");
  await p.waitForTimeout(900);
  if ((await p.locator(".settings-nav-item").count()) !== 8) problemas.push("limpar a busca não devolveu as seções");
  await p.locator(".settings-nav-item", { hasText: "Impressão" }).click();
  await p.waitForTimeout(1200);
  if (!/impress/i.test(await p.locator(".settings-content h2").first().innerText().catch(() => ""))) {
    problemas.push("clicar na seção não abriu o conteúdo dela");
  }
  if (problemas.length) throw new Error("Configurações:\n      - " + problemas.join("\n      - "));
});

await passo("o botão de ajuda responde de verdade", async () => {
  // Ele abria um aviso e mais nada. Ajuda que não responde é pior do que não
  // ter: a pessoa clica, não acha, e não clica de novo.
  const problemas = [];
  await p.locator(".support-card").click();
  await p.waitForTimeout(1200);
  const assuntos = await p.locator(".help-list > button").allInnerTexts();
  if (assuntos.length < 5) problemas.push(`a ajuda abriu com ${assuntos.length} assunto(s)`);
  for (const esperado of [/OS/i, /preço/i, /estoque/i, /caixa/i]) {
    if (!assuntos.some((texto) => esperado.test(texto))) problemas.push(`falta o assunto ${esperado}`);
  }

  // A busca serve para quem sabe o que quer fazer, não o nome da tela.
  await p.locator(".help-search input").fill("sangria");
  await p.waitForTimeout(900);
  const filtrados = await p.locator(".help-list > button").allInnerTexts();
  if (filtrados.length !== 1 || !/caixa/i.test(filtrados[0] || "")) problemas.push(`buscar "sangria" devia achar o caixa: ${JSON.stringify(filtrados)}`);
  await p.locator(".help-search input").fill("");
  await p.waitForTimeout(700);

  await p.locator(".help-list > button", { hasText: /preço/i }).first().click();
  await p.waitForTimeout(900);
  const detalhe = await p.locator(".help-detail").innerText();
  if ((await p.locator(".help-steps li").count()) < 3) problemas.push("o assunto abriu sem passos");
  // A conta que o cadastro mostra precisa estar explicada aqui.
  if (!/sobre a venda/i.test(detalhe)) problemas.push("a ajuda de preço não explica a margem sobre a venda");
  if (!/desconto/i.test(detalhe)) problemas.push("a ajuda de preço não fala de desconto");

  // E leva para a tela que resolve, em vez de só explicar.
  await p.locator(".help-detail .primary-button").click();
  await p.waitForTimeout(2000);
  if (await p.locator(".help-dialog").count()) problemas.push("o atalho não fechou a ajuda");
  const titulo = await p.locator("h1").first().innerText().catch(() => "");
  if (!/estoque/i.test(titulo)) problemas.push(`o atalho não levou para a tela certa: ${JSON.stringify(titulo)}`);
  if (problemas.length) throw new Error("central de ajuda:\n      - " + problemas.join("\n      - "));
});

await passo("cadastro novo entra em maiúsculo, sem depender de quem digita", async () => {
  // O mesmo produto entrava três vezes escrito de três jeitos — "Óleo 20W50",
  // "oleo 20w50", "ÓLEO 20W50" — e aí a busca do balcão não achava, o
  // relatório contava três produtos e o estoque nunca fechava.
  const problemas = [];
  await ir("Produtos e estoque");
  await p.getByRole("button", { name: /Adicionar produto/i }).first().click();
  await p.waitForTimeout(2200);
  const nomeDaPeca = p.locator('.dialog-window input[placeholder*="Óleo Yamalube"]').first();
  await nomeDaPeca.fill("óleo lubrificante 20w50");
  await p.waitForTimeout(600);
  const naTela = await nomeDaPeca.inputValue();
  if (naTela !== "ÓLEO LUBRIFICANTE 20W50") problemas.push(`a tela mostra ${JSON.stringify(naTela)}, esperado em maiúsculo com os acentos`);
  await p.locator(".dialog-window button", { hasText: /^Cancelar$/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);

  // E o que é gravado no banco também: a tela pode mostrar o que quiser.
  await ir("Clientes");
  await p.getByRole("button", { name: /Cadastrar cliente|Novo cliente|Adicionar cliente/i }).first().click();
  await p.waitForTimeout(2200);
  await p.locator('.dialog-window input[placeholder*="Carlos Eduardo"]').fill("márcia gonçalves de assunção");
  await p.locator(".dialog-tabs button", { hasText: /Contato/ }).click();
  await p.waitForTimeout(600);
  await p.locator(".dialog-window input").first().fill("34955554444");
  const email = p.locator('.dialog-window input[type="email"]');
  if (await email.count()) await email.fill("Marcia@Oficina.com");
  await p.locator(".dialog-tabs button", { hasText: /Dados Pessoais/ }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-moto-block input[placeholder*="ABC-1234"]').fill("MAI-3C33");
  await p.waitForTimeout(400);
  const listas = p.locator(".client-moto-block select");
  await listas.nth(0).selectOption("Honda"); await p.waitForTimeout(600);
  await listas.nth(1).selectOption("Biz"); await p.waitForTimeout(600);
  await p.locator(".dialog-window button", { hasText: /Cadastrar Cliente/ }).first().click();
  await p.waitForTimeout(4000);
  const gravado = (await banco("clients")).find((item) => /MÁRCIA/.test(item.name || ""));
  if (!gravado) problemas.push("o cliente não foi gravado em maiúsculo");
  else {
    if (gravado.name !== "MÁRCIA GONÇALVES DE ASSUNÇÃO") problemas.push(`gravou "${gravado.name}", esperado maiúsculo com cedilha e til`);
    // E-mail é o que a pessoa usa para entrar: maiúsculo ali atrapalha.
    if (gravado.email && gravado.email !== "Marcia@Oficina.com") problemas.push(`o e-mail foi mexido: "${gravado.email}"`);
  }
  if (problemas.length) throw new Error("cadastro em maiúsculo:\n      - " + problemas.join("\n      - "));
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
  const cliente = (await banco("clients")).find((item) => mesmoNome(item.name, "Rayane Souza"));
  const moto = (await banco("motorcycles")).find((item) => item.plate === "RAY-1B22");
  if (!cliente) problemas.push("com a placa, o cliente devia gravar");
  if (!moto) problemas.push("a moto não foi cadastrada junto");
  else {
    if (!/CG 150 Titan/i.test(moto.model || "")) problemas.push(`modelo gravado: "${moto.model}"`);
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
  await p.getByPlaceholder("Ex.: 38.420 km").fill("50.000 km");
  await p.locator(".dialog textarea").first().fill("Chegou de guincho");
  await p.getByPlaceholder("Ex.: Troca do kit relação").fill("Revisão");
  await p.locator(".dialog input[type=number]").first().fill("120");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /Adicionar mão de obra/ }).click();
  await p.waitForTimeout(900);
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
  const novo = (await banco("clients")).find((item) => mesmoNome(item.name, "Dono do Guincho"));
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
      await baixa.locator(".settings-nav-item", { hasText: nomeAba }).first().click();
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

await passo("no celular, o mecânico vê a OS inteira sem rolar e acerta os botões com o dedo", async () => {
  // O mecânico usa o sistema no celular, de pé na bancada, muitas vezes com
  // uma mão só. Este passo entra como ele num aparelho de 390x844 e cobra
  // quatro coisas que só quebram nesse tamanho:
  //   1. a primeira OS cabe na tela — os três cartões do resumo empilhados
  //      empurravam a lista uns 800px para baixo;
  //   2. os botões têm 44px, o mínimo em que o dedo acerta sem ampliar;
  //   3. o relato do cliente aparece na linha, senão ele abre cada OS só para
  //      descobrir qual é a que vai pegar;
  //   4. dentro da OS nenhum cartão fica achatado — .order-info-grid e
  //      .order-section usam overflow:hidden e, num grid de altura definida,
  //      encolhiam para 15px: o cliente e as peças aprovadas sumiam da tela.
  const problemas = [];
  const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
  const FS = "http://127.0.0.1:8080/v1/projects/picapau-teste/databases/(default)/documents";
  const texto = (valor) => ({ stringValue: valor });

  // A conta de login de verdade: o passo 27 deixou o funcionário e o perfil de
  // acesso, mas com um uid inventado. Aqui ela passa a existir no Auth.
  const entrar = async () => {
    for (const rota of ["accounts:signUp", "accounts:signInWithPassword"]) {
      const r = await fetch(`${AUTH}/${rota}?key=fake-api-key`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "erasmo@picapau.test", password: "teste123", returnSecureToken: true }),
      });
      const d = await r.json();
      if (d.localId) return d.localId;
    }
    return "";
  };
  const uid = await entrar();
  if (!uid) throw new Error("não foi possível criar a conta do mecânico no Auth");

  const erasmo = (await banco("employees")).find((f) => /ERASMO/i.test(f.name || ""));
  if (!erasmo) throw new Error("o funcionário ERASMO não existe; o passo 27 deveria tê-lo criado");
  const perfil = { uid: texto(uid), name: texto("ERASMO SOUZA"), email: texto("erasmo@picapau.test"),
    phone: texto("(34) 98888-1111"), role: texto("Mecânico"), employeeId: texto(erasmo._id),
    active: { booleanValue: true }, mustChangePassword: { booleanValue: false },
    permissions: { arrayValue: { values: ["orders.view", "orders.update", "budgets.view", "inventory.view", "customers.view"].map(texto) } } };
  await fetch(`${FS}/userAccess/${uid}`, { method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields: perfil }) });
  await fetch(`${FS}/users/${uid}`, { method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields: perfil }) });

  // Uma OS aberta, sem mecânico e com relato: é o que ele vê em "para pegar".
  const aberta = (await banco("serviceOrders")).find((os) => !os.closed && os.status !== "Entrega" && !(os.mechanicIds || []).length);
  if (!aberta) throw new Error("nenhuma OS aberta e livre para o mecânico pegar");
  const RELATO = "MOTO FALHANDO EM MARCHA LENTA E VAZANDO OLEO PELO RETENTOR";
  await fetch(`${FS}/serviceOrders/${aberta._id}?updateMask.fieldPaths=problem`, {
    method: "PATCH", headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: { problem: texto(RELATO) } }),
  });

  const contexto = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cel = await contexto.newPage();
  const errosCel = [];
  cel.on("pageerror", (e) => errosCel.push(String(e).split("\n")[0]));
  try {
    await cel.goto(process.env.URL_TESTE ?? "http://127.0.0.1:5199/");
    await cel.waitForTimeout(2200);
    await cel.getByPlaceholder(/e-mail|email/i).first().fill("erasmo@picapau.test");
    await cel.locator('input[type="password"]').first().fill("teste123");
    await cel.getByRole("button", { name: /^Entrar$/ }).click();
    await cel.waitForTimeout(6000);

    // No celular o menu vive atrás do botão de sanduíche.
    await cel.locator(".mobile-menu").first().click().catch(() => {});
    await cel.waitForTimeout(900);
    const alvo = cel.locator(".nav-subitem", { hasText: "Ordens de serviço" }).first();
    if (!(await alvo.isVisible().catch(() => false))) {
      await cel.locator(".nav-group-trigger", { hasText: "Oficina" }).first().click().catch(() => {});
      await cel.waitForTimeout(700);
    }
    await alvo.click();
    await cel.waitForTimeout(2600);
    await cel.screenshot({ path: `${OUT}/e2e-celular-mecanico.png` });

    const titulo = await cel.locator("h1").first().innerText().catch(() => "");
    if (!/Minhas ordens/i.test(titulo)) problemas.push(`o mecânico não caiu no quadro dele: ${JSON.stringify(titulo)}`);

    const largura = await cel.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, tela: window.innerWidth }));
    if (largura.rolagem > largura.tela + 1) problemas.push(`a lista rola de lado: ${largura.rolagem}px numa tela de ${largura.tela}px`);

    const linhas = cel.locator(".registry-row");
    if (!(await linhas.count())) problemas.push("nenhuma OS apareceu no quadro do mecânico");
    else {
      // Sem rolar: a primeira OS e os botões dela têm de estar na tela.
      const primeira = await linhas.first().evaluate((el) => ({
        topo: Math.round(el.getBoundingClientRect().top),
        fim: Math.round(el.getBoundingClientRect().bottom),
        tela: window.innerHeight,
      }));
      if (primeira.fim > primeira.tela) problemas.push(`a primeira OS termina em ${primeira.fim}px numa tela de ${primeira.tela}px: o mecânico precisa rolar para ver o que fazer`);

      const relato = await cel.locator(".registry-row .row-problem").first().innerText().catch(() => "");
      if (!relato.trim()) problemas.push("a linha não mostra o relato do cliente");
      const comRelato = await cel.locator(".registry-row").filter({ hasText: /MARCHA LENTA/i }).count();
      if (!comRelato) problemas.push(`o relato da OS ${aberta._id} não chegou à lista`);

      const pequenos = await cel.locator(".registry-row button").evaluateAll((els) => els
        .map((e) => ({ t: (e.innerText || "?").replace(/\s+/g, " ").trim(), a: Math.round(e.getBoundingClientRect().height), l: Math.round(e.getBoundingClientRect().width) }))
        .filter((x) => x.a < 44 || x.l < 44));
      if (pequenos.length) problemas.push(`botão pequeno para o dedo (mínimo 44px): ${JSON.stringify(pequenos.slice(0, 4))}`);
    }

    // Pegar a OS com um toque, e a prova é no banco.
    const pegar = cel.locator(".registry-row").filter({ hasText: /MARCHA LENTA/i }).first().locator("button", { hasText: /^(Pegar|Assumir|Iniciar)$/ }).first();
    if (!(await pegar.count())) problemas.push("a OS livre não trouxe o botão de pegar");
    else {
      await pegar.click();
      await cel.waitForTimeout(3500);
      const depois = (await banco("serviceOrders")).find((os) => os._id === aberta._id);
      if (!(depois?.mechanicIds || []).includes(erasmo._id)) problemas.push(`pegar a OS no celular não gravou o mecânico: ${JSON.stringify(depois?.mechanicIds)}`);
    }

    // Dentro da OS: nenhum cartão achatado e as etapas numa linha só.
    await cel.locator(".registry-row button", { hasText: /^Abrir$/ }).first().click();
    await cel.waitForTimeout(3000);
    await cel.screenshot({ path: `${OUT}/e2e-celular-os.png` });
    const corpo = cel.locator(".dialog-body.order-detail").first();
    if (!(await corpo.count())) problemas.push("a OS não abriu no celular");
    else {
      const achatados = await corpo.evaluate((el) => [...el.children]
        .map((filho) => ({ cls: filho.className.split(" ")[0], alt: Math.round(filho.getBoundingClientRect().height), conteudo: filho.scrollHeight }))
        .filter((x) => x.conteudo - x.alt > 8));
      if (achatados.length) problemas.push(`cartão cortado dentro da OS: ${JSON.stringify(achatados)}`);
      const rolaTudo = await corpo.evaluate((el) => ({ visivel: Math.round(el.getBoundingClientRect().height), total: el.scrollHeight }));
      const soma = await corpo.evaluate((el) => [...el.children].reduce((t, f) => t + f.getBoundingClientRect().height, 0));
      if (rolaTudo.total < soma) problemas.push(`o corpo da OS não rola até o fim: ${rolaTudo.total}px de rolagem para ${Math.round(soma)}px de conteúdo`);

      // A barra de etapas tem seis situações (serviceOrderStatuses); num grid
      // de cinco colunas a última caía para uma segunda linha.
      const etapas = await cel.locator(".order-progress").first().evaluate((el) => ({
        quantas: el.children.length,
        linhas: new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size,
      })).catch(() => null);
      if (!etapas) problemas.push("a barra de etapas não apareceu");
      else if (etapas.linhas > 1) problemas.push(`as ${etapas.quantas} etapas da OS quebraram em ${etapas.linhas} linhas`);

      const larguraOS = await cel.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, tela: window.innerWidth }));
      if (larguraOS.rolagem > larguraOS.tela + 1) problemas.push(`a OS aberta rola de lado: ${larguraOS.rolagem}px numa tela de ${larguraOS.tela}px`);
    }
    if (errosCel.length) problemas.push(`erro de JavaScript no celular: ${errosCel[0]}`);
  } finally {
    await contexto.close();
  }
  if (problemas.length) throw new Error("celular do mecânico:\n      - " + problemas.join("\n      - "));
});

console.log(`\n=== ${falhas} falha(s) ===`);
console.log("erros de navegador:", erros.length ? "\n  " + [...new Set(erros)].join("\n  ") : "nenhum");
await b.close();

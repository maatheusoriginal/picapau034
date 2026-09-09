const { chromium } = await import("playwright-core");
const OUT = "/tmp/claude-0/-home-user-picapau034/e049ee9d-b761-5bc7-b694-e4e4e22cfcaa/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1360, height: 950 } });
p.on("dialog", (a) => { void a.accept().catch(() => {}); });
await p.goto("http://127.0.0.1:5199/"); await p.waitForTimeout(1800);
await p.getByPlaceholder(/e-mail|email/i).first().fill("dono@picapau.test");
await p.locator('input[type="password"]').first().fill("teste123");
await p.getByRole("button", { name: /^Entrar$/ }).click();
await p.waitForTimeout(4500);
await p.locator(".main-nav .nav-item").filter({ hasText: /^Estoque\d*$/ }).first().click();
await p.waitForTimeout(2000);
await p.getByRole("button", { name: /Adicionar produto/i }).first().click();
await p.waitForTimeout(2200);
const d = await p.evaluate(() => {
  const corpo = document.querySelector(".dialog-window .dialog-body");
  const rotulo = document.querySelector(".pdv-row > .pdv-label");
  const campo = document.querySelector(".pdv-row input");
  return {
    visivel: corpo ? Math.round(corpo.getBoundingClientRect().height) : 0,
    conteudo: corpo ? corpo.scrollHeight : 0,
    tamanhoDaLetraDoRotulo: rotulo ? getComputedStyle(rotulo).fontSize : "-",
    tamanhoDaLetraDoCampo: campo ? getComputedStyle(campo).fontSize : "-",
    alturaDoCampo: campo ? Math.round(campo.getBoundingClientRect().height) : 0,
  };
});
console.log(JSON.stringify(d, null, 1));
console.log(d.conteudo <= d.visivel + 12 ? "=> CABE, sem rolar" : `=> ainda passa ${d.conteudo - d.visivel}px`);
await p.screenshot({ path: `${OUT}/peca-depois.png`, fullPage: true });
await b.close();

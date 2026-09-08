import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
let failures = 0;
let total = 0;
for (const name of Object.keys(scripts).filter((name) => name.startsWith("check:"))) {
  total += 1;
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.status === 0) console.log(`OK ${name}`);
  else { failures += 1; console.error(`FALHOU ${name}\n${result.stdout}\n${result.stderr}`); }
}
console.log(`${total - failures}/${total} grupos de verificações aprovados.`);
process.exitCode = failures ? 1 : 0;

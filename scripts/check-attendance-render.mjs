import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Server-side rendering only. No browser, production configuration or database access.
const directory = await mkdtemp(join(process.cwd(), ".attendance-check-"));
try {
  const outfile = join(directory, "render.mjs");
  await build({ entryPoints: ["scripts/fixtures/attendance-render.tsx"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, define: { "import.meta.env": "{}" }, logLevel: "silent" });
  const result = spawnSync(process.execPath, [outfile], { encoding: "utf8" });
  process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
  if (result.status !== 0) process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }

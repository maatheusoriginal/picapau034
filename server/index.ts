import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminUsers, postAdminUsers } from "./admin-users";
import { bootstrapSuperAdmin } from "./bootstrap";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  const adminSecretName = ["FIREBASE", "ADMIN", "SERVICE", "ACCOUNT", "JSON"].join("_");
  response.json({ ok: true, runtime: "vite-react", firebaseAdminConfigured: Boolean(process.env[adminSecretName]) });
});
app.get("/api/admin/users", getAdminUsers);
app.post("/api/admin/users", postAdminUsers);
app.post("/api/setup/bootstrap", bootstrapSuperAdmin);

if (!isProduction) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const dist = resolve(root, "dist");
  if (!existsSync(dist)) throw new Error("Pasta dist não encontrada. Execute npm run build antes de npm start.");
  app.use(express.static(dist));
  app.use((_request, response) => response.sendFile(resolve(dist, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Pica Pau Motos disponível em http://0.0.0.0:${port}`);
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // O SDK do Firebase respondia por quase todo o bundle de ~800 kB que ia
        // junto com o código da oficina em um arquivo só: qualquer ajuste de
        // tela invalidava o cache do navegador inteiro. Separando por
        // dependência, o vendor (que muda a cada atualização de biblioteca,
        // não a cada deploy) fica em cache entre as versões.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/firebase/") || id.includes("/@firebase/")) return "firebase";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "react";
          return "vendor";
        },
      },
    },
  },
});

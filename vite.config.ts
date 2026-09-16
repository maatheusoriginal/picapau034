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
          // O ajudante de import sob demanda do Vite fica junto do vendor.
          //
          // É um trecho minúsculo, mas o sistema inteiro depende dele para
          // qualquer carregamento sob demanda. Deixado solto, o empacotador o
          // colocou dentro do pedaço do PDF — e aí o index.html passou a
          // pré-carregar o pedaço do PDF inteiro na abertura, justamente o que
          // a separação abaixo existe para evitar. Ancorado no vendor, que
          // desce na abertura de qualquer forma, o pedaço do PDF volta a só
          // ser baixado no clique.
          if (id === "\0vite/preload-helper.js") return "vendor";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/firebase/") || id.includes("/@firebase/")) return "firebase";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "react";
          // A biblioteca de PDF fica FORA do vendor.
          //
          // O vendor desce em toda abertura do sistema. Jogar o jsPDF ali
          // somava quase meio mega ao primeiro carregamento de todo mundo —
          // inclusive do celular do mecânico, no 4G da oficina — por causa de
          // um botão que se usa algumas vezes por dia. Em pedaço próprio, ele
          // só desce no clique de "Baixar PDF", que é o que o import dinâmico
          // de app/order-pdf-file.ts já pede.
          if (id.includes("/jspdf/") || id.includes("/fflate/") || id.includes("/canvg/") || id.includes("/dompurify/")) return "pdf";
          return "vendor";
        },
      },
    },
  },
});

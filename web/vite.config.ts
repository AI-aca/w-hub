import { defineConfig } from "vite";

// GitHub Pages 주소: https://ai-aca.github.io/w-hub/
export default defineConfig({
  root: import.meta.dirname,
  base: process.env.WHUB_BASE ?? "/w-hub/",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022", sourcemap: false },
  server: { port: 5173, strictPort: true },
});

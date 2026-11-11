import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";

// Aplicația e complet statică. `base: "./"` o lasă să ruleze din orice subfolder (GitHub Pages),
// iar rezultatul merge în /docs, de unde îl servește GitHub Pages direct din ramura main.
export default defineConfig({
  root: "web",
  base: "./",
  plugins: [react()],
  // sigla se cere doar dacă fișierul există, ca să nu apară o eroare 404 la fiecare încărcare
  define: { __HAS_LOGO__: existsSync("web/public/brand/logo.svg") },
  build: { outDir: "../docs", emptyOutDir: true },
});

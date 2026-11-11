import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Aplicația e complet statică. `base: "./"` o lasă să ruleze din orice subfolder (GitHub Pages),
// iar rezultatul merge în /docs, de unde îl servește GitHub Pages direct din ramura main.
export default defineConfig({
  root: "web",
  base: "./",
  plugins: [react()],
  build: { outDir: "../docs", emptyOutDir: true },
});

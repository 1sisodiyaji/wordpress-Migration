import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 4000,
    strictPort: true,
    allowedHosts: true,
    watch: { usePolling: true },
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
});

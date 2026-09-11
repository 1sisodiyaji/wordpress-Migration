import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
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

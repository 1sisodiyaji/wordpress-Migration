import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteMigrationLogsApi } from "./plugins/vite-migration-logs-api";
import { viteMigratedSitesStatic } from "./plugins/vite-migrated-sites-static";
import { vitePreviewStatic } from "./plugins/vite-preview-static";
import { viteWorkspaceIframe } from "./plugins/vite-workspace-iframe";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(rootDir, "app");

export default defineConfig({
  resolve: {
    alias: {
      "@": appDir,
    },
    // react-resizable-panels must share the same React instance as the app.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react-resizable-panels"],
  },
  ssr: {
    noExternal: ["react-resizable-panels"],
  },
  plugins: [
    viteMigrationLogsApi(),
    viteMigratedSitesStatic(),
    vitePreviewStatic(),
    viteWorkspaceIframe(),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths({
      root: rootDir,
      projects: [path.join(rootDir, "tsconfig.json")],
      ignoreConfigErrors: true,
    }),
  ],
  server: {
    watch: {
      // Migration writes thousands of files under sites/ — ignore so dev UI
      // doesn't full-reload and freeze the log viewer.
      ignored: [
        "**/puck/**",
        "**/sites/**",
        "**/public/sites/**",
        "**/public/sitemap*.xml",
        "**/public/wp-sitemap.xml",
        "**/public/robots.txt",
        "**/public/llms*.txt",
        "**/migration-reports/**",
      ],
    },
  },
});

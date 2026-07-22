import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { registerApi } from "./api";
import { registerAuthRoutes } from "./auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.STUDIO_PORT ?? "5173");

async function main() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  registerAuthRoutes(app);
  registerApi(app);

  const vite = await createViteServer({
    root: STUDIO_ROOT,
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  app.listen(PORT, () => {
    console.log(`\n🎨 Studio running at http://localhost:${PORT}`);
    console.log(`   Scrape → Convert → Open GrapeJS editor in a new tab\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

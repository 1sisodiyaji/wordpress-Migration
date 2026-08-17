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

  // Always JSON for API failures — never fall through to Vite's HTML SPA shell.
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith("/api/")) {
      next(err);
      return;
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api]", req.method, req.path, err);
    res.status(500).json({ error: message || "Internal server error" });
  });

  const vite = await createViteServer({
    root: STUDIO_ROOT,
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  // History-API SPA fallback for /project/:slug refreshes.
  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api/") || req.path.startsWith("/@") || req.path.startsWith("/node_modules") || req.path.startsWith("/src/")) {
      next();
      return;
    }
    if (path.extname(req.path)) {
      next();
      return;
    }
    try {
      const fs = await import("node:fs");
      const indexPath = path.join(STUDIO_ROOT, "index.html");
      let html = fs.readFileSync(indexPath, "utf8");
      html = await vite.transformIndexHtml(req.originalUrl, html);
      res.status(200).setHeader("Content-Type", "text/html").end(html);
    } catch (err) {
      next(err);
    }
  });

  app.listen(PORT, () => {
    console.log(`\n🎨 Studio running at http://localhost:${PORT}`);
    console.log(`   Scrape → Convert → Open GrapeJS editor in a new tab\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

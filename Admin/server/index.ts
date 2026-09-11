import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerApi } from "./api";
import { registerAuthRoutes } from "./auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.STUDIO_PORT ?? "4000");
const isProd = process.env.NODE_ENV === "production";

async function main() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  registerAuthRoutes(app);
  registerApi(app);

  // Always JSON for API failures — never fall through to the SPA shell.
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

  if (isProd) {
    const dist = path.join(STUDIO_ROOT, "dist");
    if (!fs.existsSync(path.join(dist, "index.html"))) {
      throw new Error(`Admin production build missing at ${dist}. Run: pnpm build`);
    }
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: STUDIO_ROOT,
      server: { middlewareMode: true, host: true },
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
        const indexPath = path.join(STUDIO_ROOT, "index.html");
        let html = fs.readFileSync(indexPath, "utf8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).setHeader("Content-Type", "text/html").end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n────────────────────────────────────────────────────────`);
    console.log(`[${new Date().toISOString().replace("T", " ").slice(0, 19)}] 🎨  Admin running at http://0.0.0.0:${PORT} (${isProd ? "prod" : "dev"})`);
    console.log(`   Converter: ${process.env.CONVERTER_URL ?? "http://localhost:5174"}`);
    console.log(`   Project editors use ports ${8000}–${8080} (host-side, not Docker)`);
    console.log(`────────────────────────────────────────────────────────\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

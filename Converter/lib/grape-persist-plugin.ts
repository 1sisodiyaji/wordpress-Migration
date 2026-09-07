/**
 * Vite plugin: load/save GrapeJS page content from the project filesystem.
 *
 * GET  /api/grape/page?pageKey=home
 * POST /api/grape/save  { pageKey, html, css?, grapeBlocks?, headerHtml?, footerHtml? }
 */
import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";

export type GrapeSavePayload = {
  pageKey: string;
  html: string;
  css?: string;
  grapeBlocks?: unknown[] | null;
  headerHtml?: string | null;
  footerHtml?: string | null;
};

type SitePage = {
  key: string;
  contentHtml?: string;
  grapeBlocks?: unknown[] | null;
  contentMode?: string;
  canvasStyles?: string[];
  canvasScripts?: string[];
};

type SiteJson = {
  slug?: string;
  exportFingerprint?: string;
  canvasStyles?: string[];
  canvasScripts?: string[];
  pages: SitePage[];
};

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: Connect.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function parseUrl(reqUrl: string | undefined): URL {
  return new URL(reqUrl ?? "/", "http://localhost");
}

export function grapePersistPlugin(projectRoot: string): Plugin {
  const siteJsonPath = path.join(projectRoot, "src", "data", "site.json");
  const layoutJsonPath = path.join(projectRoot, "src", "data", "layout.json");
  const dataPagesDir = path.join(projectRoot, "data", "pages");

  return {
    name: "grape-persist",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = parseUrl(req.url);
        const pathname = url.pathname;

        if (pathname === "/api/grape/page" && req.method === "GET") {
          try {
            const pageKey = String(url.searchParams.get("pageKey") ?? "").trim();
            if (!pageKey) {
              sendJson(res, 400, { error: "pageKey required" });
              return;
            }
            if (!fs.existsSync(siteJsonPath)) {
              sendJson(res, 404, { error: `Missing ${siteJsonPath}` });
              return;
            }
            const site = readJson<SiteJson>(siteJsonPath);
            const page = site.pages.find((p) => p.key === pageKey);
            if (!page) {
              sendJson(res, 404, { error: `Page not found: ${pageKey}` });
              return;
            }

            let layout: { headerHtml?: string; footerHtml?: string } | null = null;
            if (fs.existsSync(layoutJsonPath)) {
              layout = readJson(layoutJsonPath);
            }

            sendJson(res, 200, {
              ok: true,
              pageKey,
              contentHtml: page.contentHtml ?? "",
              grapeBlocks: page.grapeBlocks ?? null,
              contentMode: page.contentMode ?? "html",
              canvasStyles: page.canvasStyles ?? site.canvasStyles ?? [],
              canvasScripts: page.canvasScripts ?? site.canvasScripts ?? [],
              exportFingerprint: site.exportFingerprint ?? site.slug ?? "",
              headerHtml: layout?.headerHtml ?? "",
              footerHtml: layout?.footerHtml ?? "",
              mtimeMs: fs.statSync(siteJsonPath).mtimeMs,
            });
          } catch (err) {
            console.error("[grape-persist] load", err);
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }

        if (pathname === "/api/grape/save" && req.method === "POST") {
          try {
            const raw = await readBody(req);
            const payload = JSON.parse(raw) as GrapeSavePayload;
            const pageKey = String(payload.pageKey ?? "").trim();
            if (!pageKey) {
              sendJson(res, 400, { error: "pageKey required" });
              return;
            }
            if (typeof payload.html !== "string") {
              sendJson(res, 400, { error: "html string required" });
              return;
            }
            if (!fs.existsSync(siteJsonPath)) {
              sendJson(res, 404, { error: `Missing ${siteJsonPath}` });
              return;
            }

            const site = readJson<SiteJson>(siteJsonPath);
            const page = site.pages.find((p) => p.key === pageKey);
            if (!page) {
              sendJson(res, 404, { error: `Page not found: ${pageKey}` });
              return;
            }

            page.contentHtml = payload.html;
            if (payload.grapeBlocks !== undefined) {
              page.grapeBlocks =
                Array.isArray(payload.grapeBlocks) && payload.grapeBlocks.length > 0
                  ? payload.grapeBlocks
                  : undefined;
              if (page.grapeBlocks) page.contentMode = "blocks";
            }
            writeJson(siteJsonPath, site);

            const pageDir = path.join(dataPagesDir, pageKey);
            if (fs.existsSync(dataPagesDir) || true) {
              fs.mkdirSync(pageDir, { recursive: true });
              fs.writeFileSync(path.join(pageDir, "rendered.html"), payload.html, "utf8");
              if (typeof payload.css === "string" && payload.css.trim()) {
                fs.writeFileSync(path.join(pageDir, "editor.css"), payload.css, "utf8");
              }
              if (Array.isArray(payload.grapeBlocks) && payload.grapeBlocks.length > 0) {
                writeJson(path.join(pageDir, "grape-blocks.json"), payload.grapeBlocks);
              }
            }

            if (fs.existsSync(layoutJsonPath) && (payload.headerHtml != null || payload.footerHtml != null)) {
              const layout = readJson<Record<string, unknown>>(layoutJsonPath);
              if (typeof payload.headerHtml === "string") layout.headerHtml = payload.headerHtml;
              if (typeof payload.footerHtml === "string") layout.footerHtml = payload.footerHtml;
              writeJson(layoutJsonPath, layout);
            }

            const savedAt = new Date().toISOString();
            console.log(`[grape-persist] saved page "${pageKey}" → src/data/site.json (${savedAt})`);
            sendJson(res, 200, { ok: true, pageKey, savedAt, siteJsonPath });
          } catch (err) {
            console.error("[grape-persist] save", err);
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }

        next();
      });
    },
  };
}

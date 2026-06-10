import fs from "node:fs";
import type { Plugin } from "vite";
import { getPreviewStaticDiskPath, syncPreviewDocument } from "../app/api/wp/sync-preview-document";
import { siteHasData } from "../app/api/wp/sites";

const PREVIEW_PATH_RE = /^\/preview-static\/([a-z0-9-]+)\.html(?:\?.*)?$/i;

/** Serve raw preview HTML before React Router (avoids SPA shell in iframes). */
export function vitePreviewStatic(): Plugin {
  return {
    name: "vite-preview-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();

        const url = req.url ?? "";
        const match = url.match(PREVIEW_PATH_RE);
        if (!match) return next();

        const slug = match[1];
        if (!siteHasData(slug)) {
          res.statusCode = 404;
          res.end("Preview not found");
          return;
        }

        try {
          if (!fs.existsSync(getPreviewStaticDiskPath(slug))) {
            syncPreviewDocument(slug);
          }
          const html = fs.readFileSync(getPreviewStaticDiskPath(slug), "utf8");
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          if (req.method === "HEAD") res.end();
          else res.end(html);
        } catch (err) {
          res.statusCode = 500;
          res.end(err instanceof Error ? err.message : "Preview error");
        }
      });
    },
  };
}

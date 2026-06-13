import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const SITES_ASSET_RE = /^\/sites\/([a-z0-9-]+)\/(.+)$/i;

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function contentType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Serve public/sites/{slug}/… before React Router.
 * Without this, /sites/foo/css/bar.css matches :site="sites" → 404 spam in dev.
 */
export function viteMigratedSitesStatic(): Plugin {
  return {
    name: "vite-migrated-sites-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();

        const raw = (req.url ?? "").split("?")[0]!;
        const match = raw.match(SITES_ASSET_RE);
        if (!match) return next();

        const rel = path.join("sites", match[1], match[2]);
        const disk = path.join(server.config.root, "public", rel);
        if (!fs.existsSync(disk) || !fs.statSync(disk).isFile()) {
          return next();
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", contentType(disk));
        res.setHeader("Cache-Control", "public, max-age=3600");
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(disk).pipe(res);
      });
    },
  };
}

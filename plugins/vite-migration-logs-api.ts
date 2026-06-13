import type { Plugin } from "vite";
import { buildMigrationLogsPayload } from "../app/api/migration/logs-payload.server";

const LOGS_API_RE = /^\/api\/migrate\/([a-z0-9-]+)\/logs(?:\?.*)?$/i;

/** JSON log polling — bypasses React Router (raw fetch would get the SPA shell). */
export function viteMigrationLogsApi(): Plugin {
  return {
    name: "vite-migration-logs-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();

        const match = (req.url ?? "").match(LOGS_API_RE);
        if (!match) return next();

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(JSON.stringify(buildMigrationLogsPayload(match[1])));
      });
    },
  };
}

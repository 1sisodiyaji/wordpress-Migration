import type { MigrationLogsPayload } from "@/lib/migration-logs-poll";
import { readMigrationLog } from "../wp/migration-log";
import { readMigrationStatus } from "../wp/migration-status";
import { getSite, siteHasData } from "../wp/sites";

export type { MigrationLogsPayload };

export function buildMigrationLogsPayload(slug: string): MigrationLogsPayload {
  const entry = getSite(slug);
  const status = readMigrationStatus(slug);
  return {
    logs: readMigrationLog(slug),
    entry: entry ?? null,
    phase: status?.phase ?? null,
    progress: status?.progress ?? null,
    hasData: siteHasData(slug),
  };
}

export function migrationLogsJsonResponse(slug: string): Response {
  return Response.json(buildMigrationLogsPayload(slug), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

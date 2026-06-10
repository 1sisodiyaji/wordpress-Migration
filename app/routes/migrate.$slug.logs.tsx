import type { Route } from "./+types/migrate.$slug.logs";
import { readMigrationLog } from "@/api/wp/migration-log";
import { readMigrationStatus } from "@/api/wp/migration-status";
import { getSite, siteHasData } from "@/api/wp/sites";

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug!;
  const entry = getSite(slug);

  const status = readMigrationStatus(slug);
  return Response.json(
    {
      logs: readMigrationLog(slug),
      entry: entry ?? null,
      phase: status?.phase ?? null,
      progress: status?.progress ?? null,
      hasData: siteHasData(slug),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

export default function MigrateLogsResource() {
  return null;
}

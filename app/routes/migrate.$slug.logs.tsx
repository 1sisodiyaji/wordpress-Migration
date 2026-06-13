import type { Route } from "./+types/migrate.$slug.logs";
import { migrationLogsJsonResponse } from "@/api/migration/logs-payload.server";

export async function loader({ params }: Route.LoaderArgs) {
  return migrationLogsJsonResponse(params.slug!);
}

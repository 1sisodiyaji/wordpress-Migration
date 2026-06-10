import type { Route } from "./+types/workspace.$slug.metrics";
import type { WorkspaceBrowserMetrics } from "@/lib/reports/browser-metrics";
import { measureUrl } from "@/api/reports/measure-url";
import { getSite } from "@/api/wp/sites";

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug!;
  const entry = getSite(slug);
  if (!entry) {
    throw new Response("Not found", { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const migratedDocUrl = `${origin}/preview-static/${slug}.html`;

  const [live, migrated] = await Promise.all([
    measureUrl(entry.url),
    measureUrl(migratedDocUrl),
  ]);

  const result: WorkspaceBrowserMetrics = {
    measuredAt: new Date().toISOString(),
    live: {
      loadTimeMs: live.loadTimeMs,
      ttfbMs: live.ttfbMs,
      pageSizeBytes: live.pageSizeBytes,
      source: "server",
      error: live.error,
    },
    migrated: {
      loadTimeMs: migrated.loadTimeMs,
      ttfbMs: migrated.ttfbMs,
      pageSizeBytes: migrated.pageSizeBytes,
      source: "server",
      error: migrated.error,
    },
  };

  return Response.json(result);
}

export default function WorkspaceMetricsResource() {
  return null;
}

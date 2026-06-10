import type { Route } from "./+types/preview.$site.sync";
import { syncPreviewDocument } from "@/api/wp/sync-preview-document";
import { siteHasData } from "@/api/wp/sites";

/** Regenerate static preview HTML (used by workspace reload). */
export async function loader({ params }: Route.LoaderArgs) {
  const site = params.site!;
  if (!siteHasData(site)) {
    throw new Response("Preview not ready", { status: 404 });
  }

  const publicPath = syncPreviewDocument(site);
  return Response.json({ ok: true, path: publicPath });
}

export default function PreviewSyncResource() {
  return null;
}

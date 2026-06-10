import type { Route } from "./+types/preview.$site.document";
import {
  previewDocumentPublicPath,
  syncPreviewDocument,
} from "@/api/wp/sync-preview-document";
import { siteHasData } from "@/api/wp/sites";

/** Redirect to static preview file (RR SPA cannot serve raw HTML in iframes). */
export async function loader({ params }: Route.LoaderArgs) {
  const site = params.site!;
  if (!siteHasData(site)) {
    throw new Response("Preview not ready", { status: 404 });
  }

  syncPreviewDocument(site);
  throw new Response(null, {
    status: 302,
    headers: { Location: previewDocumentPublicPath(site) },
  });
}

export default function PreviewDocumentResource() {
  return null;
}

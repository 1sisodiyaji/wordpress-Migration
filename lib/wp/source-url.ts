import { getManifest } from "./load-migrated";
import { getSite } from "./sites";
import { getWpUrl } from "./config";

/** Per-site WordPress origin (manifest → registry → env fallback). */
export function getWordPressSourceUrl(siteSlug?: string): string {
  if (siteSlug) {
    const manifest = getManifest(siteSlug);
    const fromManifest =
      manifest?.wordpressUrl ?? manifest?.site?.url ?? manifest?.styles?.sourceUrl;
    if (fromManifest) return fromManifest.replace(/\/$/, "");

    const entry = getSite(siteSlug);
    if (entry?.url) return entry.url.replace(/\/$/, "");
  }

  return getWpUrl().replace(/\/$/, "");
}

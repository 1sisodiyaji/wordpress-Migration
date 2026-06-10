import fs from "node:fs";
import path from "node:path";
import { getElementorAssets } from "./elementor-assets";
import { getMigratedPublicDir, getMigratedPublicUrlPrefix } from "./config";
import { loadCssRegistry } from "./css-registry";
import { getStyles } from "./load-migrated";
import { getWordPressSourceUrl } from "./source-url";

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url.split("?")[0]!;
  }
}

/** Match downloaded CSS filename from WP path (post-474, frontend.min, etc.). */
function findLocalCssByUrl(siteSlug: string, absoluteUrl: string): string | null {
  const registry = loadCssRegistry(siteSlug);
  const normalized = normalizeUrl(absoluteUrl);
  if (registry[normalized]) return registry[normalized];
  if (registry[absoluteUrl]) return registry[absoluteUrl];

  const pathname = new URL(absoluteUrl.split("?")[0]!).pathname;
  const pathKey = pathname.split("/").filter(Boolean).join("-");
  const cssDir = path.join(getMigratedPublicDir(siteSlug), "css");
  if (!fs.existsSync(cssDir)) return null;

  const files = fs.readdirSync(cssDir);
  const hit =
    files.find((f) => f.includes(pathKey)) ??
    files.find((f) => {
      const post = pathname.match(/post-(\d+)\.css/);
      return post ? f.includes(`post-${post[1]}`) : false;
    });

  return hit ? `${getMigratedPublicUrlPrefix(siteSlug)}/css/${hit}` : null;
}

/**
 * Resolve CSS for raw preview — prefers local mirrored files from builder crawl.
 * Order: elementor/assets.json → styles.json → live URL fallback.
 */
export function resolvePreviewStylesheets(siteSlug: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const sourceUrl = getWordPressSourceUrl(siteSlug);

  const add = (href: string | null | undefined, liveFallback?: string) => {
    if (!href && liveFallback) {
      const local = findLocalCssByUrl(siteSlug, liveFallback);
      href = local ?? liveFallback;
    }
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push(href);
  };

  const elementor = getElementorAssets(siteSlug);
  if (elementor?.stylesheets?.length) {
    for (const sheet of elementor.stylesheets) {
      add(findLocalCssByUrl(siteSlug, sheet), sheet);
    }
  }

  const styles = getStyles(siteSlug);
  for (const sheet of styles?.stylesheets ?? []) {
    add(sheet.startsWith("/") ? sheet : findLocalCssByUrl(siteSlug, sheet));
  }
  for (const sheet of styles?.inlineStyles ?? []) {
    add(sheet);
  }

  // Mirror any plugin/theme CSS on disk that crawl lists missed.
  const cssDir = path.join(getMigratedPublicDir(siteSlug), "css");
  if (fs.existsSync(cssDir)) {
    for (const file of fs.readdirSync(cssDir).sort()) {
      add(`${getMigratedPublicUrlPrefix(siteSlug)}/css/${file}`);
    }
  }

  const override = path.join(getMigratedPublicDir(siteSlug), "overrides.css");
  if (fs.existsSync(override)) {
    add(`${getMigratedPublicUrlPrefix(siteSlug)}/overrides.css`);
  }

  void sourceUrl;
  return out;
}

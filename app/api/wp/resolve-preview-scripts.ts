import fs from "node:fs";
import path from "node:path";
import { getMigratedPublicDir, getMigratedPublicUrlPrefix } from "./config";
import { loadJsRegistry } from "./js-registry";
import { getSitePluginAssets } from "./plugin-assets";
import type { PageShellAssets } from "./types";

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url.split("?")[0]!;
  }
}

function findLocalJsByUrl(siteSlug: string, absoluteUrl: string): string | null {
  if (absoluteUrl.startsWith("/sites/")) return absoluteUrl;

  const registry = loadJsRegistry(siteSlug);
  const normalized = normalizeUrl(absoluteUrl);
  if (registry[normalized]) return registry[normalized];
  if (registry[absoluteUrl]) return registry[absoluteUrl];

  const pathname = new URL(absoluteUrl.split("?")[0]!).pathname;
  const pathKey = pathname.split("/").filter(Boolean).join("-");
  const jsDir = path.join(getMigratedPublicDir(siteSlug), "js");
  if (!fs.existsSync(jsDir)) return null;

  const files = fs.readdirSync(jsDir);
  const hit = files.find((f) => f.includes(pathKey));
  return hit ? `${getMigratedPublicUrlPrefix(siteSlug)}/js/${hit}` : null;
}

function mapScriptToLocal(
  siteSlug: string,
  script: PageShellAssets["scripts"][0],
): PageShellAssets["scripts"][0] {
  if (!script.src || script.src.startsWith("/sites/")) return script;
  if (!script.src.startsWith("http")) return script;
  const local = findLocalJsByUrl(siteSlug, script.src);
  return local ? { ...script, src: local } : script;
}

function scriptDedupeKey(script: PageShellAssets["scripts"][0]): string {
  return script.src ?? `inline:${script.id ?? script.inline?.slice(0, 48) ?? ""}`;
}

/**
 * Full document script stack from plugin-assets.json (head + footer, all plugins).
 * Body-only crawl misses head-enqueued plugin JS — this fills the gap.
 */
export function resolveSitePluginScripts(siteSlug: string): PageShellAssets["scripts"] {
  const manifest = getSitePluginAssets(siteSlug);
  if (!manifest?.scripts.all.length) return [];
  return manifest.scripts.all.map((s) => mapScriptToLocal(siteSlug, s));
}

/** Merge site plugin stack + per-page body scripts; preserve enqueue order. */
export function resolvePreviewScripts(
  siteSlug: string,
  scripts: PageShellAssets["scripts"],
): PageShellAssets["scripts"] {
  const siteScripts = resolveSitePluginScripts(siteSlug);
  const seen = new Set<string>();
  const out: PageShellAssets["scripts"] = [];

  const push = (script: PageShellAssets["scripts"][0]) => {
    const mapped = mapScriptToLocal(siteSlug, script);
    const key = scriptDedupeKey(mapped);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(mapped);
  };

  for (const script of siteScripts) push(script);
  for (const script of scripts) push(script);

  return out;
}

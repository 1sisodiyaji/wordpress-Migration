import fs from "node:fs";
import path from "node:path";
import { getMigratedPublicDir, getMigratedPublicUrlPrefix } from "./config";
import { loadJsRegistry } from "./js-registry";
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

/** Map crawled script stack to local mirrored paths when available. */
export function resolvePreviewScripts(
  siteSlug: string,
  scripts: PageShellAssets["scripts"],
): PageShellAssets["scripts"] {
  return scripts.map((script) => {
    if (!script.src || script.src.startsWith("/sites/")) return script;
    if (!script.src.startsWith("http")) return script;
    const local = findLocalJsByUrl(siteSlug, script.src);
    return local ? { ...script, src: local } : script;
  });
}

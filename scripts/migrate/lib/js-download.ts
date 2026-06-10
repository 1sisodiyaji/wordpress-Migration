import fs from "node:fs/promises";
import path from "node:path";
import {
  getActiveSiteSlug,
  getMigratedPublicDir,
  getMigratedPublicUrlPrefix,
} from "../../../app/api/wp/config";
import { mergeJsRegistry } from "../../../app/api/wp/js-registry";
import { wpHttpFetch } from "../../../app/api/wp/http";
import { mapPool } from "./pool";
import { resolveUrl } from "./css-download";

let globalJsRegistry: Map<string, string> | null = null;

export function getJsRegistry(): Map<string, string> {
  if (!globalJsRegistry) globalJsRegistry = new Map();
  return globalJsRegistry;
}

export function resetJsRegistry(): void {
  globalJsRegistry = new Map();
}

export function persistJsRegistry(siteSlug?: string): void {
  const slug = siteSlug ?? getActiveSiteSlug();
  if (!slug || !globalJsRegistry?.size) return;
  mergeJsRegistry(slug, globalJsRegistry);
}

function jsDir(siteSlug?: string): string {
  return path.join(getMigratedPublicDir(siteSlug), "js");
}

function sanitizeJsFilename(url: string, index: number): string {
  const parsed = new URL(url.split("?")[0]!);
  const base = parsed.pathname.split("/").filter(Boolean).join("-") || "script";
  const hash = Buffer.from(url).toString("base64url").slice(0, 8);
  return `${index}-${base}-${hash}.js`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface DownloadScriptResult {
  path: string;
  cached: boolean;
}

export async function downloadScript(
  absoluteUrl: string,
  registry = getJsRegistry(),
  siteSlug?: string,
): Promise<DownloadScriptResult | null> {
  const normalized = absoluteUrl.split("?")[0]!;
  const lookup = registry.has(absoluteUrl)
    ? absoluteUrl
    : registry.has(normalized)
      ? normalized
      : null;
  if (lookup) {
    return { path: registry.get(lookup)!, cached: true };
  }

  const dir = jsDir(siteSlug);
  await fs.mkdir(dir, { recursive: true });
  const index = registry.size;
  const filename = sanitizeJsFilename(absoluteUrl, index);
  const prefix = getMigratedPublicUrlPrefix(siteSlug);
  const publicPath = `${prefix}/js/${filename}`;
  const diskPath = path.join(dir, filename);

  try {
    const res = await wpHttpFetch(absoluteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    await fs.writeFile(diskPath, body, "utf8");
    registry.set(absoluteUrl, publicPath);
    if (normalized !== absoluteUrl) registry.set(normalized, publicPath);
    return { path: publicPath, cached: false };
  } catch {
    return null;
  }
}

export async function downloadScripts(
  urls: string[],
  registry = getJsRegistry(),
  siteSlug?: string,
): Promise<void> {
  const unique = [...new Set(urls.filter((u) => u.startsWith("http")))];
  const concurrency = Number(process.env.MIGRATE_JS_CONCURRENCY ?? "8");
  await mapPool(unique, concurrency, (url) =>
    downloadScript(url, registry, siteSlug),
  );
}

export { resolveUrl };

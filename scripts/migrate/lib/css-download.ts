import fs from "node:fs/promises";
import path from "node:path";
import {
  getActiveSiteSlug,
  getMigratedPublicDir,
  getMigratedPublicUrlPrefix,
} from "../../../app/api/wp/config";
import { mergeCssRegistry } from "../../../app/api/wp/css-registry";
import { wpHttpFetch } from "../../../app/api/wp/http";
import { mapPool } from "./pool";

function cssDir(): string {
  return path.join(getMigratedPublicDir(), "css");
}

/** Shared across one migrate run so CSS is downloaded once, not per phase/page. */
let globalRegistry: Map<string, string> | null = null;

export function getCssRegistry(): Map<string, string> {
  if (!globalRegistry) globalRegistry = new Map();
  return globalRegistry;
}

export function resetCssRegistry(): void {
  globalRegistry = new Map();
}

/** Persist in-memory registry to sites/{slug}/data/css-registry.json */
export function persistCssRegistry(siteSlug?: string): void {
  const slug = siteSlug ?? getActiveSiteSlug();
  if (!slug || !globalRegistry?.size) return;
  mergeCssRegistry(slug, globalRegistry);
}

export function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function sanitizeFilename(url: string, index: number): string {
  const parsed = new URL(url);
  const base = parsed.pathname.split("/").filter(Boolean).join("-") || "style";
  const hash = Buffer.from(url).toString("base64url").slice(0, 8);
  return `${index}-${base}-${hash}.css`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function downloadCss(url: string, dest: string): Promise<void> {
  const res = await wpHttpFetch(url);
  if (!res.ok) throw new Error(`Failed to download CSS ${url}: ${res.status}`);
  let css = await res.text();
  css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, assetUrl) => {
    if (assetUrl.startsWith("data:")) return match;
    const absolute = resolveUrl(assetUrl, url);
    if (absolute.startsWith("http")) {
      return `url(${quote}${absolute}${quote})`;
    }
    return match;
  });
  await fs.writeFile(dest, css, "utf8");
}

export interface DownloadStylesheetResult {
  path: string;
  cached: boolean;
}

/** Downloads a stylesheet URL once; returns public path or null if skipped. */
export async function downloadStylesheet(
  absoluteUrl: string,
  registry = getCssRegistry(),
): Promise<DownloadStylesheetResult | null> {
  if (registry.has(absoluteUrl)) {
    return { path: registry.get(absoluteUrl)!, cached: true };
  }

  const dir = cssDir();
  await fs.mkdir(dir, { recursive: true });
  const index = registry.size;
  const filename = sanitizeFilename(absoluteUrl, index);
  const publicPath = `${getMigratedPublicUrlPrefix()}/css/${filename}`;
  const diskPath = path.join(dir, filename);

  try {
    await downloadCss(absoluteUrl, diskPath);
    registry.set(absoluteUrl, publicPath);
    return { path: publicPath, cached: false };
  } catch {
    return null;
  }
}

export async function downloadStylesheets(
  urls: string[],
  registry = getCssRegistry(),
): Promise<void> {
  const unique = [...new Set(urls)];
  const concurrency = Number(process.env.MIGRATE_CSS_CONCURRENCY ?? "8");
  await mapPool(unique, concurrency, (url) => downloadStylesheet(url, registry));
}

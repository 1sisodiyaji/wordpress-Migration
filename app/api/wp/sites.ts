import fs from "node:fs";
import path from "node:path";

export type SiteStage = "landing" | "converted" | "full";

export interface SiteEntry {
  slug: string;
  url: string;
  name: string;
  migratedAt?: string;
  status: "ready" | "migrating" | "failed";
  /** landing = homepage preview only; full = entire site crawled */
  stage?: SiteStage;
  routes?: number;
  pageBuilder?: string;
  error?: string;
}

export const SITES_ROOT = path.join(process.cwd(), "sites");
export const REGISTRY_PATH = path.join(SITES_ROOT, "registry.json");

export function urlToSlug(url: string): string {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host.toLowerCase().replace(/\./g, "-");
  } catch {
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
}

export function normalizeWordPressUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

export function getSiteDataDir(slug: string): string {
  return path.join(SITES_ROOT, slug, "data");
}

export function getSitePublicDir(slug: string): string {
  return path.join(process.cwd(), "public", "sites", slug);
}

export function getSitePublicUrlPrefix(slug: string): string {
  return `/sites/${slug}`;
}

export function readRegistry(): SiteEntry[] {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) as {
      sites?: SiteEntry[];
    };
    return raw.sites ?? [];
  } catch {
    return [];
  }
}

export function writeRegistry(sites: SiteEntry[]): void {
  fs.mkdirSync(SITES_ROOT, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify({ sites }, null, 2), "utf8");
}

export function upsertSite(entry: SiteEntry): void {
  const sites = readRegistry().filter((s) => s.slug !== entry.slug);
  sites.unshift(entry);
  writeRegistry(sites);
}

export function getSite(slug: string): SiteEntry | undefined {
  return readRegistry().find((s) => s.slug === slug);
}

export function siteHasData(slug: string): boolean {
  return fs.existsSync(path.join(getSiteDataDir(slug), "manifest.json"));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Removes registry entry, site data, logs, and public assets. */
export function deleteSite(slug: string): boolean {
  if (!getSite(slug)) return false;

  removeDir(path.join(SITES_ROOT, slug));
  removeDir(getSitePublicDir(slug));

  writeRegistry(readRegistry().filter((s) => s.slug !== slug));
  return true;
}

import fs from "node:fs";
import path from "node:path";
import { getProjectsRoot } from "../paths";

export { getProjectsRoot, getTmpDir } from "../paths";

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

export function getSitesRoot(): string {
  return getProjectsRoot();
}

export function getRegistryPath(): string {
  return path.join(getProjectsRoot(), "registry.json");
}

/** Prefer getProjectsRoot(); kept for existing imports. */
export const SITES_ROOT = getProjectsRoot();
export const REGISTRY_PATH = getRegistryPath();

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
  const url = new URL(withProtocol);

  // Subdirectory WordPress installs (e.g. /smartco) need a trailing slash —
  // without it Apache often 301s and some fetch stacks fail intermittently.
  if (url.pathname.length > 1 && !url.pathname.endsWith("/")) {
    url.pathname += "/";
  }

  if (url.pathname === "/" || url.pathname === "") {
    return url.origin;
  }

  return `${url.origin}${url.pathname}${url.search}`;
}

export function getSiteDataDir(slug: string): string {
  return path.join(getProjectsRoot(), slug, "data");
}

export function getSitePublicDir(slug: string): string {
  return path.join(getProjectsRoot(), slug, "public");
}

export function getSitePublicUrlPrefix(slug: string): string {
  return `/Projects/${slug}`;
}

export function readRegistry(): SiteEntry[] {
  const file = getRegistryPath();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      sites?: SiteEntry[];
    };
    return raw.sites ?? [];
  } catch {
    return [];
  }
}

export function writeRegistry(sites: SiteEntry[]): void {
  fs.mkdirSync(getProjectsRoot(), { recursive: true });
  fs.writeFileSync(getRegistryPath(), JSON.stringify({ sites }, null, 2), "utf8");
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
  const hadRegistry = Boolean(getSite(slug));
  const hadSiteDir = fs.existsSync(path.join(getProjectsRoot(), slug));
  const hadPublic = fs.existsSync(getSitePublicDir(slug));

  removeDir(path.join(getProjectsRoot(), slug));
  removeDir(getSitePublicDir(slug));

  if (hadRegistry) {
    writeRegistry(readRegistry().filter((s) => s.slug !== slug));
  }

  return hadRegistry || hadSiteDir || hadPublic;
}

/** Whether a site folder or registry entry exists for slug. */
export function siteExists(slug: string): boolean {
  return Boolean(getSite(slug)) || fs.existsSync(path.join(getProjectsRoot(), slug));
}

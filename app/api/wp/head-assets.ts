import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";
import { loadFontRegistry } from "./font-registry";

export interface FontPreload {
  href: string;
  as: string;
  type?: string;
  crossorigin?: string;
}

export interface SiteHeadAssets {
  fontStylesheets: string[];
  fontPreloads: FontPreload[];
  preconnect: string[];
  dnsPrefetch: string[];
  animationLibs: string[];
}

export function loadHeadAssets(siteSlug: string): SiteHeadAssets | null {
  const file = path.join(getMigratedDataDir(siteSlug), "head-assets.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as SiteHeadAssets;
}

function resolveFontHref(siteSlug: string, href: string): string {
  const registry = loadFontRegistry(siteSlug);
  return registry[href] ?? registry[href.split("?")[0]!] ?? href;
}

/** Build <link> tags for fonts, preconnect, and font preloads. */
export function buildPreviewHeadLinks(siteSlug: string): string {
  const head = loadHeadAssets(siteSlug);
  if (!head) return "";

  const lines: string[] = [];
  const seen = new Set<string>();

  const push = (tag: string) => {
    if (seen.has(tag)) return;
    seen.add(tag);
    lines.push(tag);
  };

  for (const href of head.preconnect) {
    push(`<link rel="preconnect" href="${escapeAttr(href)}" crossorigin>`);
  }
  for (const href of head.dnsPrefetch) {
    push(`<link rel="dns-prefetch" href="${escapeAttr(href)}">`);
  }
  for (const href of head.fontStylesheets) {
    push(`<link rel="stylesheet" href="${escapeAttr(href)}">`);
  }
  for (const preload of head.fontPreloads) {
    const local = resolveFontHref(siteSlug, preload.href);
    const type = preload.type ? ` type="${escapeAttr(preload.type)}"` : "";
    const cross =
      preload.crossorigin !== undefined
        ? ` crossorigin="${escapeAttr(preload.crossorigin)}"`
        : ' crossorigin="anonymous"';
    push(
      `<link rel="preload" href="${escapeAttr(local)}" as="font"${type}${cross}>`,
    );
  }

  return lines.join("\n");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

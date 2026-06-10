import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";
import { sanitizePageShellAssets } from "./sanitize-assets";
import type { ElementorSystemManifest, PageShellAssets } from "./types";

export function routeToPageKey(routePath: string): string {
  if (routePath === "/") return "home";
  return routePath.replace(/^\//, "").replace(/\//g, "__");
}

function shellPaths(routePath: string, siteSlug?: string) {
  const key = routeToPageKey(routePath);
  const base = path.join(getMigratedDataDir(siteSlug), "pages");
  return {
    key,
    html: path.join(base, `${key}.html`),
    assets: path.join(base, `${key}.assets.json`),
  };
}

export function getPageShellHtml(
  routePath: string,
  siteSlug?: string,
): string | null {
  const { html, key } = shellPaths(routePath, siteSlug);
  if (fs.existsSync(html)) return fs.readFileSync(html, "utf8");

  if (key === "home") {
    const legacy = path.join(getMigratedDataDir(siteSlug), "home-shell.html");
    if (fs.existsSync(legacy)) return fs.readFileSync(legacy, "utf8");
  }
  return null;
}

/** Strip document wrapper crawled pages include (`<html><head>…</head><body>…</body></html>`). */
export function extractPageShellBody(html: string): string {
  const trimmed = html.trim();
  if (!/^<html[\s>]/i.test(trimmed)) return trimmed;

  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) return bodyMatch[1]!.trim();

  return trimmed
    .replace(/^<html[^>]*>/i, "")
    .replace(/<\/html>$/i, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/i, "")
    .replace(/^<body[^>]*>/i, "")
    .replace(/<\/body>$/i, "")
    .trim();
}

export function getPageShellAssets(
  routePath: string,
  siteSlug?: string,
): PageShellAssets | null {
  const { assets } = shellPaths(routePath, siteSlug);
  if (!fs.existsSync(assets)) return null;
  const raw = JSON.parse(fs.readFileSync(assets, "utf8")) as PageShellAssets;
  return sanitizePageShellAssets(raw);
}

export function hasPageShell(routePath: string, siteSlug?: string): boolean {
  const { html } = shellPaths(routePath, siteSlug);
  return fs.existsSync(html);
}

export function getElementorSystem(
  siteSlug?: string,
): ElementorSystemManifest | null {
  const file = path.join(
    getMigratedDataDir(siteSlug),
    "elementor",
    "system.json",
  );
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ElementorSystemManifest;
}

export function getElementorGlobalCss(siteSlug?: string): string | null {
  const file = path.join(
    getMigratedDataDir(siteSlug),
    "elementor",
    "global-styles.css",
  );
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

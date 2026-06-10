import * as cheerio from "cheerio";
import type { PageBuilder } from "../../../app/api/wp/types";
import { detectBuilderFromHtml } from "./html-extract";
import { inferConditionalAssets } from "./conditional-assets";
import { discoverAssetsInHtml } from "./html-asset-scan";
import { normalizeAssetUrl } from "./normalize-asset-url";

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export interface FontPreload {
  href: string;
  as: string;
  type?: string;
  crossorigin?: string;
}

export interface PageAssetGraph {
  pageUrl: string;
  builder: PageBuilder;
  stylesheets: string[];
  scripts: Array<{ src?: string; inline?: string; id?: string; type?: string }>;
  fontStylesheets: string[];
  fontPreloads: FontPreload[];
  preconnect: string[];
  dnsPrefetch: string[];
  inlineStyles: Array<{ id?: string; content: string }>;
  conditionalStylesheets: string[];
  conditionalScripts: string[];
  animationLibs: string[];
  themeSlugs: string[];
  pluginSlugs: string[];
  elementorDocumentIds: number[];
  discoveredStylesheets: string[];
  discoveredScripts: string[];
  notes: string[];
}

function collectThemePluginSlugs(urls: string[]): {
  themes: Set<string>;
  plugins: Set<string>;
} {
  const themes = new Set<string>();
  const plugins = new Set<string>();
  for (const u of urls) {
    const theme = u.match(/\/wp-content\/themes\/([^/]+)/i);
    if (theme?.[1]) themes.add(theme[1]);
    const plugin = u.match(/\/wp-content\/plugins\/([^/]+)/i);
    if (plugin?.[1]) plugins.add(plugin[1]);
  }
  return { themes, plugins };
}

/**
 * Single source of truth for per-page assets from rendered HTML.
 * Works for any editor — Elementor, Gutenberg, Divi, unknown, etc.
 */
function norm(url: string, pageUrl: string): string {
  return normalizeAssetUrl(resolveUrl(url, pageUrl), pageUrl);
}

export function buildPageAssetGraph(html: string, pageUrl: string): PageAssetGraph {
  const $ = cheerio.load(html);
  const builder = detectBuilderFromHtml(html) as PageBuilder;
  const discovered = discoverAssetsInHtml(html, pageUrl);

  const stylesheets: string[] = [];
  const fontStylesheets: string[] = [];
  const fontPreloads: FontPreload[] = [];
  const preconnect: string[] = [];
  const dnsPrefetch: string[] = [];

  $(
    'link[rel="stylesheet"], link[rel="alternate stylesheet"], link[rel="preload"][as="style"]',
  ).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = norm(href, pageUrl);
    stylesheets.push(absolute);
    if (
      absolute.includes("fonts.googleapis.com") ||
      absolute.includes("fonts.bunny.net") ||
      absolute.includes("use.typekit.net") ||
      absolute.includes("use.fontawesome.com")
    ) {
      fontStylesheets.push(absolute);
    }
  });

  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = resolveUrl(href, pageUrl);
    if ($(el).attr("rel") === "preconnect") preconnect.push(absolute);
    else dnsPrefetch.push(absolute);
  });

  $('link[rel="preload"][as="font"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    fontPreloads.push({
      href: resolveUrl(href, pageUrl),
      as: "font",
      type: $(el).attr("type") ?? undefined,
      crossorigin: $(el).attr("crossorigin") ?? undefined,
    });
  });

  const inlineStyles: Array<{ id?: string; content: string }> = [];
  $("style").each((_, el) => {
    const content = $(el).html()?.trim();
    if (!content) return;
    inlineStyles.push({
      id: $(el).attr("id") ?? undefined,
      content,
    });
  });

  const scripts: PageAssetGraph["scripts"] = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      scripts.push({
        src: norm(src, pageUrl),
        id: $(el).attr("id") ?? undefined,
        type: $(el).attr("type") ?? "text/javascript",
      });
      return;
    }
    const inline = $(el).html()?.trim();
    if (!inline) return;
    scripts.push({
      inline,
      id: $(el).attr("id") ?? undefined,
      type: $(el).attr("type") ?? undefined,
    });
  });

  const elementorDocumentIds: number[] = [];
  $("[data-elementor-id]").each((_, el) => {
    const id = parseInt($(el).attr("data-elementor-id") ?? "", 10);
    if (id) elementorDocumentIds.push(id);
  });

  const conditional = inferConditionalAssets(html, pageUrl, builder);
  const discoveredStylesheets = discovered.stylesheets.map((u) => norm(u, pageUrl));
  const discoveredScripts = discovered.scripts.map((u) => norm(u, pageUrl));

  const allUrls = [
    ...stylesheets,
    ...discoveredStylesheets,
    ...conditional.extraStylesheets,
    ...scripts.map((s) => s.src).filter(Boolean) as string[],
    ...conditional.extraScripts,
    ...discoveredScripts,
  ];
  const { themes, plugins } = collectThemePluginSlugs(allUrls);

  return {
    pageUrl,
    builder,
    stylesheets: [...new Set(stylesheets)],
    scripts,
    fontStylesheets: [...new Set(fontStylesheets)],
    fontPreloads,
    preconnect: [...new Set(preconnect)],
    dnsPrefetch: [...new Set(dnsPrefetch)],
    inlineStyles,
    conditionalStylesheets: conditional.extraStylesheets,
    conditionalScripts: conditional.extraScripts,
    animationLibs: conditional.animationLibs,
    themeSlugs: [...themes],
    pluginSlugs: [...plugins],
    elementorDocumentIds: [...new Set(elementorDocumentIds)],
    discoveredStylesheets: [...new Set(discoveredStylesheets)],
    discoveredScripts: [...new Set(discoveredScripts)],
    notes: conditional.notes,
  };
}

export interface SiteHeadAssets {
  fontStylesheets: string[];
  fontPreloads: FontPreload[];
  preconnect: string[];
  dnsPrefetch: string[];
  animationLibs: string[];
}

/** Merge head metadata across pages (fonts, preconnect). */
export function mergeHeadAssets(
  existing: SiteHeadAssets | null,
  graph: PageAssetGraph,
): SiteHeadAssets {
  const fontSet = new Set(existing?.fontStylesheets ?? []);
  for (const u of graph.fontStylesheets) fontSet.add(u);

  const preconnectSet = new Set(existing?.preconnect ?? []);
  for (const u of graph.preconnect) preconnectSet.add(u);

  const dnsSet = new Set(existing?.dnsPrefetch ?? []);
  for (const u of graph.dnsPrefetch) dnsSet.add(u);

  const animSet = new Set(existing?.animationLibs ?? []);
  for (const a of graph.animationLibs) animSet.add(a);

  const preloadMap = new Map<string, FontPreload>();
  for (const p of existing?.fontPreloads ?? []) preloadMap.set(p.href, p);
  for (const p of graph.fontPreloads) preloadMap.set(p.href, p);

  return {
    fontStylesheets: [...fontSet],
    fontPreloads: [...preloadMap.values()],
    preconnect: [...preconnectSet],
    dnsPrefetch: [...dnsSet],
    animationLibs: [...animSet],
  };
}

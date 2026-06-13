import * as cheerio from "cheerio";
import { wpHttpFetch } from "../../../app/api/wp/http";
import { normalizeAssetUrl } from "./normalize-asset-url";

const PLUGIN_SLUG_RE = /\/wp-content\/plugins\/([a-z0-9_-]+)\//gi;
const MU_PLUGIN_RE = /\/wp-content\/mu-plugins\/([^\s"'<>)/]+\.(?:php|js|css))/gi;
const ASSET_EXT_RE = /\.(?:css|js)(?:\?|$)/i;

export interface PluginTreeNode {
  slug: string;
  source: "html" | "directory-listing" | "mu-plugin";
  css: string[];
  js: string[];
  scannedUrls: string[];
  listingAvailable: boolean;
}

export interface WpContentTreeManifest {
  fetchedAt: string;
  siteBaseUrl: string;
  plugins: PluginTreeNode[];
  muPlugins: string[];
  muPluginAssets: { css: string[]; js: string[] };
  external: { css: string[]; js: string[] };
  notes: string[];
}

function absUrl(raw: string, base: string): string | null {
  try {
    const href = raw.startsWith("//") ? `https:${raw}` : raw;
    return normalizeAssetUrl(new URL(href, base).href, base);
  } catch {
    return null;
  }
}

function collectPluginSlugs(html: string): string[] {
  const slugs = new Set<string>();
  for (const m of html.matchAll(PLUGIN_SLUG_RE)) {
    if (m[1]) slugs.add(m[1].toLowerCase());
  }
  return [...slugs].sort();
}

function collectMuPlugins(html: string, base: string): string[] {
  const files = new Set<string>();
  for (const m of html.matchAll(MU_PLUGIN_RE)) {
    const url = absUrl(`/wp-content/mu-plugins/${m[1]}`, base);
    if (url) files.add(url);
  }
  return [...files].sort();
}

/** All plugin + mu-plugin CSS/JS URLs embedded anywhere in HTML. */
export function collectPluginAssetUrlsFromHtml(
  html: string,
  pageUrl: string,
): { css: string[]; js: string[]; plugins: string[] } {
  const css = new Set<string>();
  const js = new Set<string>();

  const patterns = [
    /(?:https?:)?\/\/[^\s"'<>)]+\.(?:css)(?:\?[^\s"'<>)]*)?/gi,
    /\/wp-content\/(?:plugins|mu-plugins)\/[^\s"'<>)]+\.(?:css)(?:\?[^\s"'<>)]*)?/gi,
  ];
  const jsPatterns = [
    /(?:https?:)?\/\/[^\s"'<>)]+\.(?:js)(?:\?[^\s"'<>)]*)?/gi,
    /\/wp-content\/(?:plugins|mu-plugins)\/[^\s"'<>)]+\.(?:js)(?:\?[^\s"'<>)]*)?/gi,
  ];

  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const url = absUrl(m[0], pageUrl);
      if (url && (url.includes("/wp-content/plugins/") || url.includes("/wp-content/mu-plugins/"))) {
        css.add(url);
      }
    }
  }
  for (const re of jsPatterns) {
    for (const m of html.matchAll(re)) {
      const url = absUrl(m[0], pageUrl);
      if (url && (url.includes("/wp-content/plugins/") || url.includes("/wp-content/mu-plugins/"))) {
        js.add(url);
      }
    }
  }

  return {
    css: [...css],
    js: [...js],
    plugins: collectPluginSlugs(html),
  };
}

/** CDN / third-party CSS+JS from link, script, and inline url() — kept as-is unless mirrored separately. */
export function collectCdnAssetUrlsFromHtml(
  html: string,
  pageUrl: string,
): { css: string[]; js: string[] } {
  const css = new Set<string>();
  const js = new Set<string>();
  const $ = cheerio.load(html);

  $('link[rel="stylesheet"], link[rel="preload"][as="style"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const url = absUrl(href, pageUrl);
    if (url && !url.includes("/wp-content/") && !url.includes("/wp-includes/")) css.add(url);
  });

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const url = absUrl(src, pageUrl);
    if (url && !url.includes("/wp-content/") && !url.includes("/wp-includes/")) js.add(url);
  });

  const inlineCssUrl = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  for (const m of html.matchAll(inlineCssUrl)) {
    const raw = m[1];
    if (!raw || raw.startsWith("data:")) continue;
    const url = absUrl(raw, pageUrl);
    if (url && !url.includes("/wp-content/") && !url.includes("/wp-includes/") && ASSET_EXT_RE.test(url)) {
      css.add(url);
    }
  }

  return { css: [...css], js: [...js] };
}

function parseDirectoryListing(html: string, listingUrl: string): string[] {
  if (!/index of|directory listing|parent directory/i.test(html)) return [];
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href === "../" || href.startsWith("?")) return;
    try {
      out.push(new URL(href, listingUrl).href);
    } catch {
      /* skip */
    }
  });
  return out;
}

async function crawlPluginDirectory(
  dirUrl: string,
  depth: number,
  maxDepth: number,
): Promise<{ css: string[]; js: string[]; scanned: string[] }> {
  const css: string[] = [];
  const js: string[] = [];
  const scanned: string[] = [];
  if (depth > maxDepth) return { css, js, scanned };

  scanned.push(dirUrl);
  let res: Response;
  try {
    res = await wpHttpFetch(dirUrl.endsWith("/") ? dirUrl : `${dirUrl}/`);
  } catch {
    return { css, js, scanned };
  }
  if (!res.ok) return { css, js, scanned };

  const body = await res.text();
  const links = parseDirectoryListing(body, dirUrl);
  if (!links.length) return { css, js, scanned };

  for (const link of links) {
    const lower = link.toLowerCase();
    if (lower.endsWith(".css")) css.push(link);
    else if (lower.endsWith(".js")) js.push(link);
    else if (link.endsWith("/") && depth < maxDepth) {
      const nested = await crawlPluginDirectory(link, depth + 1, maxDepth);
      css.push(...nested.css);
      js.push(...nested.js);
      scanned.push(...nested.scanned);
    }
  }

  return { css, js, scanned };
}

/**
 * Build wp-content plugin tree: HTML refs first, then optional directory listings
 * under /wp-content/plugins/{slug}/ when the server exposes them.
 */
export async function buildWpContentTree(
  html: string,
  siteBaseUrl: string,
  pageUrl: string,
  options?: { maxListingDepth?: number; probeListings?: boolean },
): Promise<WpContentTreeManifest> {
  const base = siteBaseUrl.replace(/\/$/, "");
  const maxDepth = options?.maxListingDepth ?? 2;
  const probeListings = options?.probeListings ?? true;
  const notes: string[] = [];

  const fromHtml = collectPluginAssetUrlsFromHtml(html, pageUrl);
  const cdn = collectCdnAssetUrlsFromHtml(html, pageUrl);
  const muPlugins = collectMuPlugins(html, base);

  const pluginMap = new Map<string, PluginTreeNode>();
  const muAssetCss: string[] = [];
  const muAssetJs: string[] = [];

  const ensurePlugin = (slug: string, source: PluginTreeNode["source"]): PluginTreeNode => {
    const key = slug.toLowerCase();
    let node = pluginMap.get(key);
    if (!node) {
      node = {
        slug: key,
        source,
        css: [],
        js: [],
        scannedUrls: [],
        listingAvailable: false,
      };
      pluginMap.set(key, node);
    }
    return node;
  };

  for (const slug of fromHtml.plugins) {
    ensurePlugin(slug, "html");
  }

  for (const url of fromHtml.css) {
    const m = url.match(/\/wp-content\/plugins\/([^/]+)\//i);
    if (m?.[1]) ensurePlugin(m[1], "html").css.push(url);
  }
  for (const url of fromHtml.js) {
    const m = url.match(/\/wp-content\/plugins\/([^/]+)\//i);
    if (m?.[1]) ensurePlugin(m[1], "html").js.push(url);
  }

  if (probeListings) {
    for (const slug of fromHtml.plugins) {
      const node = ensurePlugin(slug, "html");
      const listingUrl = `${base}/wp-content/plugins/${slug}/`;
      const crawled = await crawlPluginDirectory(listingUrl, 0, maxDepth);
      if (crawled.css.length || crawled.js.length) {
        node.listingAvailable = true;
        node.css.push(...crawled.css);
        node.js.push(...crawled.js);
        node.scannedUrls.push(...crawled.scanned);
        notes.push(`Directory listing: ${slug} (+${crawled.css.length} CSS, +${crawled.js.length} JS)`);
      }
    }

    const muListing = await crawlPluginDirectory(`${base}/wp-content/mu-plugins/`, 0, 1);
    if (muListing.css.length || muListing.js.length) {
      muAssetCss.push(...muListing.css);
      muAssetJs.push(...muListing.js);
      notes.push(`mu-plugins listing: +${muListing.css.length} CSS, +${muListing.js.length} JS`);
    }
  }

  for (const url of muPlugins) {
    if (url.toLowerCase().endsWith(".css")) muAssetCss.push(url);
    if (url.toLowerCase().endsWith(".js")) muAssetJs.push(url);
  }

  for (const node of pluginMap.values()) {
    node.css = [...new Set(node.css)];
    node.js = [...new Set(node.js)];
    node.scannedUrls = [...new Set(node.scannedUrls)];
  }

  return {
    fetchedAt: new Date().toISOString(),
    siteBaseUrl: base,
    plugins: [...pluginMap.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    muPlugins,
    muPluginAssets: {
      css: [...new Set(muAssetCss)],
      js: [...new Set(muAssetJs)],
    },
    external: cdn,
    notes,
  };
}

export function allPluginAssetUrls(tree: WpContentTreeManifest): {
  css: string[];
  js: string[];
} {
  const css = new Set<string>(tree.muPluginAssets.css);
  const js = new Set<string>(tree.muPluginAssets.js);
  for (const p of tree.plugins) {
    for (const u of p.css) css.add(u);
    for (const u of p.js) js.add(u);
  }
  return { css: [...css], js: [...js] };
}

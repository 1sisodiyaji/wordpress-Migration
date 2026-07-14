import * as cheerio from "cheerio";
import { resolveUrl } from "./css-download";

export interface LivePageAssets {
  stylesheetUrls: string[];
  scriptUrls: Array<{ src: string; id?: string }>;
  inlineScripts: Array<{ id?: string; content: string; type?: string }>;
  themeSlugs: string[];
  pluginSlugs: string[];
}

/** Parse enqueue order from rendered HTML — no hardcoded theme/plugin paths. */
export function extractLivePageAssets(
  html: string,
  pageUrl: string,
): LivePageAssets {
  const $ = cheerio.load(html);
  const stylesheetUrls: string[] = [];
  const seenCss = new Set<string>();

  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = resolveUrl(href, pageUrl);
    if (!seenCss.has(abs)) {
      seenCss.add(abs);
      stylesheetUrls.push(abs);
    }
  });

  const scriptUrls: LivePageAssets["scriptUrls"] = [];
  const seenJs = new Set<string>();
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const abs = resolveUrl(src, pageUrl);
    if (seenJs.has(abs)) return;
    seenJs.add(abs);
    scriptUrls.push({ src: abs, id: $(el).attr("id") ?? undefined });
  });

  const inlineScripts: LivePageAssets["inlineScripts"] = [];
  $("script:not([src])").each((_, el) => {
    const content = $(el).html()?.trim();
    if (!content) return;
    inlineScripts.push({
      id: $(el).attr("id") ?? undefined,
      content,
      type: $(el).attr("type") ?? undefined,
    });
  });

  const themeSlugs = new Set<string>();
  const pluginSlugs = new Set<string>();
  for (const url of [...stylesheetUrls, ...scriptUrls.map((s) => s.src)]) {
    const theme = url.match(/\/wp-content\/themes\/([^/]+)\//i);
    if (theme) themeSlugs.add(theme[1]!);
    const plugin = url.match(/\/wp-content\/plugins\/([^/]+)\//i);
    if (plugin) pluginSlugs.add(plugin[1]!);
  }

  return {
    stylesheetUrls,
    scriptUrls,
    inlineScripts,
    themeSlugs: [...themeSlugs],
    pluginSlugs: [...pluginSlugs],
  };
}

export function wpCoreStylesheetUrls(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, "");
  return [
    `${base}/wp-includes/css/dist/block-library/style.min.css`,
    `${base}/wp-includes/css/dist/block-library/theme.min.css`,
  ];
}

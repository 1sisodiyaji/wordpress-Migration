import * as cheerio from "cheerio";
import { WIDGET_TO_CONDITIONAL } from "./constants";

export interface ParsedElementorHtml {
  documentIds: number[];
  widgets: string[];
  conditionalKeys: Set<string>;
  hasSticky: boolean;
  hasPopup: boolean;
  hasMotionFx: boolean;
  stylesheetUrls: string[];
  scriptUrls: Array<{ src: string; id?: string }>;
  inlineScripts: Array<{ id?: string; content: string; type?: string }>;
  kitId?: number;
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

/** Parse rendered HTML the way Elementor frontend assembles it. */
export function parseElementorHtml(html: string, pageUrl: string): ParsedElementorHtml {
  const $ = cheerio.load(html);
  const documentIds = new Set<number>();
  const widgets = new Set<string>();
  const conditionalKeys = new Set<string>();

  $("[data-elementor-id]").each((_, el) => {
    const id = parseInt($(el).attr("data-elementor-id") ?? "", 10);
    if (id) documentIds.add(id);
  });

  for (const m of html.matchAll(/elementor-widget-([a-z0-9_-]+)/gi)) {
    widgets.add(m[1].toLowerCase());
  }

  if (html.includes("ekit-nav-menu") || html.includes("elementskit")) {
    widgets.add("ekit-nav-menu");
  }

  let hasSticky = false;
  let hasPopup = false;
  let hasMotionFx = false;

  $("[data-settings]").each((_, el) => {
    const raw = ($(el).attr("data-settings") ?? "").replace(/&quot;/g, '"');
    if (raw.includes('"sticky"') || raw.includes("sticky_offset")) hasSticky = true;
    if (raw.includes("motion_fx") || raw.includes("motion-fx")) hasMotionFx = true;
  });

  if (html.includes("elementor-popup") || html.includes("dialog-widget")) {
    hasPopup = true;
  }

  if (hasSticky) conditionalKeys.add("sticky");
  if (hasPopup) conditionalKeys.add("popup");
  if (hasMotionFx) conditionalKeys.add("motion-fx");
  if (html.includes("off-canvas") || html.includes("off_canvas")) {
    conditionalKeys.add("off-canvas");
  }

  for (const w of widgets) {
    for (const key of WIDGET_TO_CONDITIONAL[w] ?? []) {
      conditionalKeys.add(key);
    }
  }

  const stylesheetUrls: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) stylesheetUrls.push(resolveUrl(href, pageUrl));
  });

  let kitId: number | undefined;
  for (const sheet of stylesheetUrls) {
    const m = sheet.match(/post-(\d+)\.css/);
    if (m && sheet.includes("/uploads/elementor/css/")) {
      const id = parseInt(m[1], 10);
      if (kitId === undefined || id < kitId) kitId = id;
    }
  }

  const scriptUrls: Array<{ src: string; id?: string }> = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) scriptUrls.push({ src: resolveUrl(src, pageUrl), id: $(el).attr("id") ?? undefined });
  });

  const inlineScripts: Array<{ id?: string; content: string; type?: string }> = [];
  $("script:not([src])").each((_, el) => {
    const content = $(el).html()?.trim();
    if (!content) return;
    inlineScripts.push({
      id: $(el).attr("id") ?? undefined,
      content,
      type: $(el).attr("type") ?? undefined,
    });
  });

  return {
    documentIds: [...documentIds],
    widgets: [...widgets],
    conditionalKeys,
    hasSticky,
    hasPopup,
    hasMotionFx,
    stylesheetUrls,
    scriptUrls,
    inlineScripts,
    kitId,
  };
}

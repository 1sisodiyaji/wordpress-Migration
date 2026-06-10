import * as cheerio from "cheerio";
import { resolveUrl } from "./css-download";

type CheerioRoot = ReturnType<typeof cheerio.load>;

export type PageBuilder = "elementor" | "gutenberg" | "classic" | "unknown";

export interface ExtractedPage {
  builder: PageBuilder;
  bodyClasses: string[];
  htmlClasses: string[];
  bodyHtml: string;
  /** Main content region when identifiable (Elementor / entry-content). */
  contentHtml: string;
  stylesheetUrls: string[];
  inlineStyleBlocks: string[];
  isElementor: boolean;
}

export function detectBuilderFromHtml(html: string): PageBuilder {
  if (
    html.includes("elementor-frontend") ||
    html.includes("/plugins/elementor/") ||
    html.includes("class=\"elementor ") ||
    html.includes("class='elementor ") ||
    html.includes("elementor-page")
  ) {
    return "elementor";
  }
  if (html.includes("wp-block-") || html.includes("wp-site-blocks")) {
    return "gutenberg";
  }
  if (html.includes("entry-content") || html.includes("post-content")) {
    return "classic";
  }
  return "unknown";
}

function extractContentHtml($: CheerioRoot): string {
  const elementor = $(".elementor").first();
  if (elementor.length) {
    return $.html(elementor);
  }

  const entry = $(
    ".entry-content, .post-content, #content, main .content, article .content",
  ).first();
  if (entry.length) {
    return $.html(entry);
  }

  return $("body").html() ?? "";
}

export function extractPageFromHtml(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const builder = detectBuilderFromHtml(html);
  const isElementor = builder === "elementor";

  const stylesheetUrls = $('link[rel="stylesheet"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .filter(Boolean)
    .map((href) => resolveUrl(href!, pageUrl));

  const inlineStyleBlocks: string[] = [];
  $("style").each((_, el) => {
    const content = $(el).html()?.trim();
    if (content) inlineStyleBlocks.push(content);
  });

  const bodyClasses = ($("body").attr("class") ?? "").split(/\s+/).filter(Boolean);
  const htmlClasses = ($("html").attr("class") ?? "").split(/\s+/).filter(Boolean);
  const bodyHtml = $("body").html() ?? "";
  const contentHtml = extractContentHtml($);

  return {
    builder,
    bodyClasses,
    htmlClasses,
    bodyHtml,
    contentHtml,
    stylesheetUrls,
    inlineStyleBlocks,
    isElementor,
  };
}

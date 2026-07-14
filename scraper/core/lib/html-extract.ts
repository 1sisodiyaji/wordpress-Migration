import * as cheerio from "cheerio";
import { resolveUrl } from "./css-download";

type CheerioRoot = ReturnType<typeof cheerio.load>;

export type PageBuilder =
  | "elementor"
  | "gutenberg"
  | "classic"
  | "divi"
  | "wpbakery"
  | "beaver"
  | "brizy"
  | "oxygen"
  | "unknown";

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
  const lower = html.toLowerCase();

  if (
    lower.includes("elementor-frontend") ||
    lower.includes("/plugins/elementor/") ||
    lower.includes("class=\"elementor ") ||
    lower.includes("class='elementor ") ||
    lower.includes("elementor-page") ||
    lower.includes("data-elementor-type")
  ) {
    return "elementor";
  }
  if (
    lower.includes("et_pb_") ||
    lower.includes("/plugins/divi/") ||
    lower.includes("divi-theme") ||
    lower.includes("et-core-unified")
  ) {
    return "divi";
  }
  if (
    lower.includes("vc_row") ||
    lower.includes("wpb_wrapper") ||
    lower.includes("/js_composer/") ||
    lower.includes("js_composer_front")
  ) {
    return "wpbakery";
  }
  if (
    lower.includes("fl-builder") ||
    lower.includes("/plugins/bb-plugin/") ||
    lower.includes("fl-theme")
  ) {
    return "beaver";
  }
  if (lower.includes("brz-") || lower.includes("/plugins/brizy/")) {
    return "brizy";
  }
  if (lower.includes("oxygen-") || lower.includes("/plugins/oxygen/")) {
    return "oxygen";
  }
  if (
    lower.includes("wp-block-") ||
    lower.includes("wp-site-blocks") ||
    lower.includes("block-editor")
  ) {
    return "gutenberg";
  }
  if (
    lower.includes("entry-content") ||
    lower.includes("post-content") ||
    lower.includes("class=\"post ")
  ) {
    return "classic";
  }
  return "unknown";
}

function extractContentHtml($: CheerioRoot): string {
  const elementor = $(".elementor").first();
  if (elementor.length) {
    return $.html(elementor);
  }

  const divi = $("#et-boc, .et_pb_section").first();
  if (divi.length) {
    return $.html(divi.closest("#page, body").length ? divi.closest("#page, body") : divi);
  }

  const wpb = $(".wpb-content-wrapper, .vc_row").first();
  if (wpb.length) {
    return $.html(wpb.closest(".entry-content, #content, main").length
      ? wpb.closest(".entry-content, #content, main")
      : wpb);
  }

  const entry = $(
    ".entry-content, .post-content, #content, main .content, article .content, .wp-site-blocks",
  ).first();
  if (entry.length) {
    return $.html(entry);
  }

  return $("body").html() ?? "";
}

export function extractPageFromHtml(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const builder = detectBuilderFromHtml(html);
  const isElementor =
    builder === "elementor" ||
    builder === "divi" ||
    builder === "wpbakery" ||
    builder === "beaver" ||
    builder === "brizy" ||
    builder === "oxygen";

  const stylesheetUrls = $(
    'link[rel="stylesheet"], link[rel="alternate stylesheet"], link[rel="preload"][as="style"]',
  )
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

import * as cheerio from "cheerio";
import type { PageShellAssets } from "../../../app/api/wp/types";
import { shouldDropShellScript } from "../../../app/api/wp/sanitize-assets";
import { sanitizeMigratedUrls } from "./sanitize-urls";

/**
 * Prepares crawled Elementor HTML for Next.js:
 * - Extracts inline <script>/<style> (Elementor custom code) into sidecar assets
 * - Strips WP-specific attrs that break React
 * - Marks images/links for WpMigratedHtml parser
 */
export function transformHtmlForNext(html: string): {
  html: string;
  assets: PageShellAssets;
} {
  const $ = cheerio.load(html, { decodeEntities: false });
  const assets: PageShellAssets = { scripts: [], styles: [] };

  $("script").each((i, el) => {
    const src = $(el).attr("src");
    const inline = $(el).html()?.trim();
    const id = $(el).attr("id");
    if (src || inline) {
      const entry = { src, inline, id: id ?? `script-${i}` };
      if (!shouldDropShellScript(entry)) {
        assets.scripts.push(entry);
      }
    }
    $(el).remove();
  });

  $("style").each((i, el) => {
    const inline = $(el).html()?.trim();
    const id = $(el).attr("id");
    if (inline) {
      assets.styles.push({ inline, id: id ?? `style-${i}` });
    }
    $(el).remove();
  });

  $("img").each((_, el) => {
    const $img = $(el);
    const lazy =
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      $img.attr("data-original");
    if (lazy && !$img.attr("src")) {
      $img.attr("src", lazy);
    }
    const src = $img.attr("src");
    if (src) $img.attr("src", src);
  });

  // Elementor background images on containers
  $(".elementor-element[data-settings]").each((_, el) => {
    const $el = $(el);
    try {
      const raw = $el.attr("data-settings")?.replace(/&quot;/g, '"');
      if (!raw) return;
      const settings = JSON.parse(raw) as {
        background_background?: string;
        background_image?: { url?: string };
      };
      if (
        settings.background_background === "classic" &&
        settings.background_image?.url
      ) {
        $el.attr("data-wp-bg", settings.background_image.url);
      }
    } catch {
      /* ignore invalid JSON */
    }
  });

  $("[data-bg]").each((_, el) => {
    const bg = $(el).attr("data-bg");
    if (bg) $(el).attr("data-wp-bg", bg);
  });

  $("a").each((_, el) => {
    const $a = $(el);
    if (!$a.attr("data-wp-migrated")) {
      $a.attr("data-wp-migrated", "link");
    }
  });

  // Elementor lazy backgrounds → keep as data attribute for CSS
  $("[data-bg]").each((_, el) => {
    $(el).attr("data-wp-bg", $(el).attr("data-bg") ?? "");
  });

  const wpUrl = process.env.WORDPRESS_URL ?? "https://radius-ois.ai";
  const sanitizedHtml = sanitizeMigratedUrls($.html(), wpUrl);

  return { html: sanitizedHtml, assets };
}

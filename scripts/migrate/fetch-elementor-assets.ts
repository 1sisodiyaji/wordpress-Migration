import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { getMigratedDataDir, WP_URL } from "../../app/api/wp/config";
import { wpHttpFetch } from "../../app/api/wp/http";
import {
  downloadStylesheets,
  getCssRegistry,
  persistCssRegistry,
  resolveUrl,
} from "./lib/css-download";
import {
  downloadScripts,
  getJsRegistry,
  persistJsRegistry,
} from "./lib/js-download";

export interface ElementorAssetsManifest {
  fetchedAt: string;
  sourceUrl: string;
  stylesheets: string[];
  scripts: Array<{ src: string; id?: string }>;
  inlineScripts: Array<{ id?: string; content: string; type?: string }>;
  documentIds: number[];
  kitCssPaths: string[];
}

/**
 * Live homepage CSS/JS enqueue order + download to sites/{slug}/public.
 * Called from full migration and repair script.
 */
export async function fetchElementorAssets(
  pageUrl = WP_URL,
): Promise<ElementorAssetsManifest> {
  console.log("  ⚡ Elementor live assets (CSS + JS load order)…");

  const res = await wpHttpFetch(pageUrl);
  if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const stylesheets: string[] = [];
  const seenCss = new Set<string>();

  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = resolveUrl(href, pageUrl);
    if (!seenCss.has(abs)) {
      seenCss.add(abs);
      stylesheets.push(abs);
    }
  });

  const scripts: ElementorAssetsManifest["scripts"] = [];
  const seenJs = new Set<string>();

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const abs = resolveUrl(src, pageUrl);
    if (!seenJs.has(abs)) {
      seenJs.add(abs);
      scripts.push({ src: abs, id: $(el).attr("id") ?? undefined });
    }
  });

  const inlineScripts: ElementorAssetsManifest["inlineScripts"] = [];

  $("script:not([src])").each((_, el) => {
    const content = $(el).html()?.trim();
    if (!content) return;
    const id = $(el).attr("id") ?? undefined;
    const type = $(el).attr("type") ?? undefined;
    if (
      id?.includes("elementor") ||
      content.includes("elementorFrontendConfig") ||
      content.includes("ElementorProFrontendConfig") ||
      content.includes("elementskit") ||
      content.includes("ekit") ||
      content.length < 50_000
    ) {
      inlineScripts.push({ id, content, type });
    }
  });

  const documentIds = new Set<number>();
  $("[data-elementor-id]").each((_, el) => {
    const id = parseInt($(el).attr("data-elementor-id") ?? "", 10);
    if (id) documentIds.add(id);
  });

  const kitCssPaths: string[] = [];
  for (const sheet of stylesheets) {
    if (sheet.includes("/uploads/elementor/css/post-")) {
      kitCssPaths.push(sheet);
    }
  }

  const registry = getCssRegistry();
  await downloadStylesheets(stylesheets, registry);

  const docUrls: string[] = [];
  for (const docId of documentIds) {
    for (const suffix of ["", ".min"]) {
      docUrls.push(
        `${WP_URL.replace(/\/$/, "")}/wp-content/uploads/elementor/css/post-${docId}${suffix}.css`,
      );
    }
  }
  await downloadStylesheets(docUrls, registry);

  const jsUrls = scripts.map((s) => s.src);
  await downloadScripts(jsUrls, getJsRegistry());

  persistCssRegistry();
  persistJsRegistry();

  const manifest: ElementorAssetsManifest = {
    fetchedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets,
    scripts,
    inlineScripts,
    documentIds: [...documentIds].sort((a, b) => a - b),
    kitCssPaths,
  };

  const dir = path.join(getMigratedDataDir(), "elementor");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "assets.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(
    `   ${stylesheets.length} CSS, ${scripts.length} JS, ${documentIds.size} elementor documents, ${inlineScripts.length} inline configs`,
  );

  return manifest;
}

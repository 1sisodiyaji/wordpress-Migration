#!/usr/bin/env npx tsx
/**
 * Repair migration CSS/JS — downloads missing assets, rebuilds registries,
 * fixes styles.json + page *.assets.json, regenerates preview.
 *
 * Usage:
 *   SITE_SLUG=radius-ois-ai WORDPRESS_URL=https://radius-ois.ai npx tsx scripts/fetch-missing-assets.ts
 *   npx tsx scripts/fetch-missing-assets.ts radius-ois-ai
 */
import "dotenv/config";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import {
  getMigratedDataDir,
  getMigratedPublicDir,
  getMigratedPublicUrlPrefix,
  getWpUrl,
} from "../app/api/wp/config";
import { getElementorAssets } from "../app/api/wp/elementor-assets";
import { loadCssRegistry, mergeCssRegistry } from "../app/api/wp/css-registry";
import { loadJsRegistry, mergeJsRegistry } from "../app/api/wp/js-registry";
import { getStyles } from "../app/api/wp/load-migrated";
import { getWordPressSourceUrl } from "../app/api/wp/source-url";
import type { PageShellAssets, StylesManifest } from "../app/api/wp/types";
import { readRegistry, urlToSlug } from "../app/api/wp/sites";
import { bootstrapMigrateEnv } from "./migrate/bootstrap";
import {
  downloadStylesheet,
  downloadStylesheets,
  getCssRegistry,
  persistCssRegistry,
  resetCssRegistry,
  resolveUrl,
} from "./migrate/lib/css-download";
import {
  downloadScript,
  downloadScripts,
  getJsRegistry,
  persistJsRegistry,
  resetJsRegistry,
} from "./migrate/lib/js-download";
import { buildPageAssetGraph } from "./migrate/lib/asset-graph";
import {
  persistFontRegistry,
  resetFontRegistry,
} from "./migrate/lib/font-download";
import { mirrorPageAssetGraph } from "./migrate/lib/mirror-page-assets";
import { routeToPageKey } from "./migrate/lib/page-key";

function hostKey(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return url.toLowerCase();
  }
}

function resolveRepairSlug(argvSlug?: string): string {
  if (argvSlug) {
    return /^https?:\/\//i.test(argvSlug) ? urlToSlug(argvSlug) : argvSlug;
  }

  const wpUrl = process.env.WORDPRESS_URL?.trim();
  if (wpUrl) {
    const key = hostKey(wpUrl);
    const fromRegistry = readRegistry().find((s) => hostKey(s.url) === key);
    if (fromRegistry) return fromRegistry.slug;
  }

  const envSlug = process.env.SITE_SLUG?.trim();
  if (envSlug) {
    return /^https?:\/\//i.test(envSlug) ? urlToSlug(envSlug) : envSlug;
  }

  return "radius-ois-ai";
}

function sameSiteUrl(url: string, siteOrigin: string): boolean {
  try {
    return new URL(url).hostname === new URL(siteOrigin).hostname;
  } catch {
    return url.startsWith("/sites/");
  }
}

const slug = resolveRepairSlug(process.argv[2]);
process.env.SITE_SLUG = slug;
bootstrapMigrateEnv([]);

const sourceUrl = getWordPressSourceUrl(slug) || getWpUrl();
const pageUrl = `${sourceUrl.replace(/\/$/, "")}/`;

interface GapReport {
  cssOnDisk: number;
  jsOnDisk: number;
  cssRegistry: number;
  jsRegistry: number;
  stylesJsonCss: number;
  elementorCss: number;
  elementorJs: number;
  pageScriptUrls: number;
  missingCss: string[];
  missingJs: string[];
}

function collectPageAssetUrls(): { css: string[]; js: string[] } {
  const pagesDir = path.join(getMigratedDataDir(slug), "pages");
  const css: string[] = [];
  const js: string[] = [];
  if (!fs.existsSync(pagesDir)) return { css, js };

  for (const file of fs.readdirSync(pagesDir)) {
    if (!file.endsWith(".assets.json")) continue;
    const raw = JSON.parse(
      fs.readFileSync(path.join(pagesDir, file), "utf8"),
    ) as PageShellAssets;
    for (const s of raw.scripts ?? []) {
      if (s.src?.startsWith("http")) js.push(s.src);
    }
  }
  return { css, js };
}

async function fetchLiveAssetOrder(): Promise<{
  stylesheets: string[];
  scripts: string[];
  html: string;
}> {
  const { wpHttpFetch } = await import("../app/api/wp/http");
  const res = await wpHttpFetch(pageUrl);
  if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
  const html = await res.text();
  const graph = buildPageAssetGraph(html, pageUrl);
  await mirrorPageAssetGraph(graph, slug);

  const stylesheets = [
    ...new Set([
      ...graph.stylesheets,
      ...graph.conditionalStylesheets,
      ...graph.fontStylesheets,
    ]),
  ];
  const scripts = [
    ...new Set([
      ...(graph.scripts.map((s) => s.src).filter(Boolean) as string[]),
      ...graph.conditionalScripts,
    ]),
  ];

  return { stylesheets, scripts, html };
}

function auditGaps(
  cssUrls: string[],
  jsUrls: string[],
  cssReg: Record<string, string>,
  jsReg: Record<string, string>,
): GapReport {
  const cssDir = path.join(getMigratedPublicDir(slug), "css");
  const jsDir = path.join(getMigratedPublicDir(slug), "js");
  const styles = getStyles(slug);
  const elementor = getElementorAssets(slug);

  const missingCss = cssUrls.filter((u) => !cssReg[u] && !cssReg[u.split("?")[0]!]);
  const missingJs = jsUrls.filter((u) => !jsReg[u] && !jsReg[u.split("?")[0]!]);

  return {
    cssOnDisk: fs.existsSync(cssDir) ? fs.readdirSync(cssDir).length : 0,
    jsOnDisk: fs.existsSync(jsDir) ? fs.readdirSync(jsDir).length : 0,
    cssRegistry: Object.keys(cssReg).length,
    jsRegistry: Object.keys(jsReg).length,
    stylesJsonCss: styles?.stylesheets?.length ?? 0,
    elementorCss: elementor?.stylesheets?.length ?? 0,
    elementorJs: elementor?.scripts?.length ?? 0,
    pageScriptUrls: jsUrls.length,
    missingCss,
    missingJs,
  };
}

function printGapReport(label: string, report: GapReport): void {
  console.log(`\n── ${label} ──`);
  console.log(`CSS files on disk:     ${report.cssOnDisk}`);
  console.log(`JS files on disk:      ${report.jsOnDisk}`);
  console.log(`css-registry entries:  ${report.cssRegistry}`);
  console.log(`js-registry entries:   ${report.jsRegistry}`);
  console.log(`styles.json CSS:       ${report.stylesJsonCss}`);
  console.log(`elementor CSS URLs:    ${report.elementorCss}`);
  console.log(`elementor JS URLs:     ${report.elementorJs}`);
  console.log(`Unique script URLs:    ${report.pageScriptUrls}`);
  console.log(`Missing CSS downloads: ${report.missingCss.length}`);
  console.log(`Missing JS downloads:  ${report.missingJs.length}`);
  if (report.missingCss.length) {
    report.missingCss.slice(0, 5).forEach((u) => console.log(`  CSS  ${u}`));
    if (report.missingCss.length > 5) {
      console.log(`  ... +${report.missingCss.length - 5} more`);
    }
  }
  if (report.missingJs.length) {
    report.missingJs.slice(0, 5).forEach((u) => console.log(`  JS   ${u}`));
    if (report.missingJs.length > 5) {
      console.log(`  ... +${report.missingJs.length - 5} more`);
    }
  }
}

function rewritePageAssetsWithLocalJs(): number {
  const pagesDir = path.join(getMigratedDataDir(slug), "pages");
  const jsReg = loadJsRegistry(slug);
  let rewritten = 0;

  if (!fs.existsSync(pagesDir)) return 0;

  for (const file of fs.readdirSync(pagesDir)) {
    if (!file.endsWith(".assets.json")) continue;
    const filePath = path.join(pagesDir, file);
    const assets = JSON.parse(fs.readFileSync(filePath, "utf8")) as PageShellAssets;
    let changed = false;

    for (const script of assets.scripts ?? []) {
      if (!script.src?.startsWith("http")) continue;
      const local =
        jsReg[script.src] ??
        jsReg[script.src.split("?")[0]!] ??
        null;
      if (local && script.src !== local) {
        script.src = local;
        changed = true;
        rewritten++;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(assets, null, 2), "utf8");
    }
  }
  return rewritten;
}

async function main(): Promise<void> {
  console.log(`\n🔧 Fetch missing assets: ${slug}`);
  console.log(`   Source: ${pageUrl}\n`);

  const elementor = getElementorAssets(slug);
  const pageAssets = collectPageAssetUrls();
  const live = await fetchLiveAssetOrder();

  const allCssUrls = [
    ...new Set(
      [
        ...live.stylesheets,
        ...(elementor?.stylesheets ?? []),
        ...pageAssets.css,
        ...(getStyles(slug)?.stylesheets?.filter((s) => s.startsWith("http")) ?? []),
      ].filter((u) => sameSiteUrl(u, sourceUrl)),
    ),
  ];

  const allJsUrls = [
    ...new Set(
      [
        ...live.scripts,
        ...(elementor?.scripts?.map((s) => s.src) ?? []),
        ...pageAssets.js,
      ].filter((u) => sameSiteUrl(u, sourceUrl)),
    ),
  ];

  const before = auditGaps(
    allCssUrls,
    allJsUrls,
    loadCssRegistry(slug),
    loadJsRegistry(slug),
  );
  printGapReport("BEFORE repair", before);

  resetCssRegistry();
  resetJsRegistry();
  resetFontRegistry();

  // Seed registry from existing mappings
  const existingCss = loadCssRegistry(slug);
  const existingJs = loadJsRegistry(slug);
  for (const [url, local] of Object.entries(existingCss)) {
    getCssRegistry().set(url, local);
  }
  for (const [url, local] of Object.entries(existingJs)) {
    getJsRegistry().set(url, local);
  }

  console.log("\n📥 Downloading CSS…");
  let cssOk = 0;
  let cssFail = 0;
  for (const url of allCssUrls) {
    const result = await downloadStylesheet(url, getCssRegistry());
    if (result) cssOk++;
    else cssFail++;
  }
  console.log(`   ${cssOk} CSS OK, ${cssFail} skipped/failed`);

  console.log("📥 Downloading JS…");
  await downloadScripts(allJsUrls, getJsRegistry(), slug);
  const jsOk = getJsRegistry().size;
  console.log(`   ${jsOk} JS in registry`);

  persistCssRegistry(slug);
  persistJsRegistry(slug);
  persistFontRegistry(slug);

  // Rebuild styles.json — live order + local paths
  const localStylesheets: string[] = [];
  const seenLocal = new Set<string>();
  for (const url of live.stylesheets.length ? live.stylesheets : allCssUrls) {
    const local =
      getCssRegistry().get(url) ??
      getCssRegistry().get(url.split("?")[0]!) ??
      existingCss[url] ??
      existingCss[url.split("?")[0]!];
    if (local && !seenLocal.has(local)) {
      seenLocal.add(local);
      localStylesheets.push(local);
    }
  }
  for (const local of getCssRegistry().values()) {
    if (!seenLocal.has(local)) {
      seenLocal.add(local);
      localStylesheets.push(local);
    }
  }

  const stylesPath = path.join(getMigratedDataDir(slug), "styles.json");
  let styles: StylesManifest = getStyles(slug) ?? {
    fetchedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    pageBuilder: "elementor",
    stylesheets: [],
    inlineStyles: [],
    bodyClasses: [],
    htmlClasses: [],
  };
  styles = {
    ...styles,
    fetchedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets: localStylesheets,
  };
  await fsPromises.writeFile(stylesPath, JSON.stringify(styles, null, 2), "utf8");

  const rewritten = rewritePageAssetsWithLocalJs();
  console.log(`\n📝 Rewrote ${rewritten} script src URLs in page *.assets.json`);

  // Refresh elementor/assets.json from live crawl (correct enqueue order)
  const elementorDir = path.join(getMigratedDataDir(slug), "elementor");
  await fsPromises.mkdir(elementorDir, { recursive: true });

  const inlineScripts: Array<{ id?: string; content: string; type?: string }> = [];
  const html = live.html;
  const $ = cheerio.load(html);
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
      content.length < 80_000
    ) {
      inlineScripts.push({ id, content, type });
    }
  });

  const documentIds = new Set<number>();
  $("[data-elementor-id]").each((_, el) => {
    const id = parseInt($(el).attr("data-elementor-id") ?? "", 10);
    if (id) documentIds.add(id);
  });

  const mergedStylesheets = [
    ...new Set([...live.stylesheets, ...(elementor?.stylesheets ?? []), ...allCssUrls]),
  ];
  const mergedScripts = [
    ...new Set([
      ...live.scripts,
      ...(elementor?.scripts?.map((s) => s.src) ?? []),
      ...allJsUrls,
    ]),
  ];

  const assetsManifest = {
    fetchedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets: mergedStylesheets,
    scripts: mergedScripts.map((src) => ({ src })),
    inlineScripts,
    documentIds: [...documentIds].sort((a, b) => a - b),
    kitCssPaths: mergedStylesheets.filter((s) =>
      s.includes("/uploads/elementor/css/post-"),
    ),
  };
  await fsPromises.writeFile(
    path.join(elementorDir, "assets.json"),
    JSON.stringify(assetsManifest, null, 2),
    "utf8",
  );

  const { syncPreviewDocument } = await import("../app/api/wp/sync-preview-document");
  syncPreviewDocument(slug);
  console.log(`✅ Preview regenerated → public/preview-static/${slug}.html`);

  const after = auditGaps(
    allCssUrls,
    allJsUrls,
    loadCssRegistry(slug),
    loadJsRegistry(slug),
  );
  printGapReport("AFTER repair", after);
  console.log("\n✅ Asset repair complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

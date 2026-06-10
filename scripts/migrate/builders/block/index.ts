import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir, getWpUrl } from "../../../../app/api/wp/config";
import { wpHttpFetch } from "../../../../app/api/wp/http";
import {
  downloadStylesheets,
  getCssRegistry,
  persistCssRegistry,
} from "../../lib/css-download";
import {
  downloadScripts,
  getJsRegistry,
  persistJsRegistry,
} from "../../lib/js-download";
import { buildPageAssetGraph } from "../../lib/asset-graph";
import { wpCoreStylesheetUrls } from "../../lib/live-assets";
import { mirrorPageAssetGraph } from "../../lib/mirror-page-assets";
import { getActiveSiteSlug } from "../../../../app/api/wp/config";
import { persistFontRegistry } from "../../lib/font-download";
import type { BuilderAssetPlan } from "../types";

/** Gutenberg / classic: live enqueue order + core block library CSS. */
export async function resolveBlockPlan(pageUrl = getWpUrl()): Promise<BuilderAssetPlan> {
  const res = await wpHttpFetch(pageUrl);
  if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
  const html = await res.text();
  const graph = buildPageAssetGraph(html, pageUrl);
  const base = getWpUrl().replace(/\/$/, "");

  const stylesheets = [
    ...new Set([
      ...wpCoreStylesheetUrls(base),
      ...graph.stylesheets,
      ...graph.conditionalStylesheets,
      ...graph.fontStylesheets,
    ]),
  ];

  const scriptUrls = [
    ...new Set([
      ...graph.scripts.map((s) => s.src).filter(Boolean) as string[],
      ...graph.conditionalScripts,
    ]),
  ];

  return {
    builder: graph.builder === "classic" ? "classic" : "gutenberg",
    detectedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets,
    scripts: scriptUrls.map((src) => ({ src, handle: src })),
    inlineScripts: graph.scripts
      .filter((s) => s.inline)
      .map((s) => ({ id: s.id, content: s.inline!, type: s.type }))
      .filter((s) => s.content.length < 80_000),
    documentIds: graph.elementorDocumentIds,
    templateIds: [],
    widgets: [],
    snippetIds: [],
    themes: graph.themeSlugs,
    notes: [
      "Block/classic plan from asset graph + wp-block-library",
      `Themes: ${graph.themeSlugs.join(", ") || "none"}`,
    ],
  };
}

export async function fetchBlockPlan(
  plan: BuilderAssetPlan,
  pageHtml?: string,
): Promise<BuilderAssetPlan> {
  const siteSlug = getActiveSiteSlug();
  if (siteSlug && pageHtml) {
    await mirrorPageAssetGraph(buildPageAssetGraph(pageHtml, plan.sourceUrl), siteSlug);
  }

  const registry = getCssRegistry();
  await downloadStylesheets(plan.stylesheets, registry);
  await downloadScripts(plan.scripts.map((s) => s.src), getJsRegistry());
  const cssOk = plan.stylesheets.filter((url) => registry.has(url)).length;

  const dir = path.join(getMigratedDataDir(), "block");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "asset-plan.json"),
    JSON.stringify({ ...plan, downloadedCss: cssOk }, null, 2),
    "utf8",
  );

  console.log(`   Block plan: ${plan.stylesheets.length} CSS, ${plan.scripts.length} JS, downloaded ${cssOk}`);
  persistCssRegistry();
  persistJsRegistry();
  persistFontRegistry();
  return plan;
}

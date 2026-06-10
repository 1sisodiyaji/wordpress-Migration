import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir, getWpUrl } from "../../../../app/api/wp/config";
import { wpHttpFetch } from "../../../../app/api/wp/http";
import {
  downloadStylesheets,
  getCssRegistry,
  persistCssRegistry,
} from "../../lib/css-download";
import { persistFontRegistry } from "../../lib/font-download";
import {
  downloadScripts,
  getJsRegistry,
  persistJsRegistry,
} from "../../lib/js-download";
import { buildPageAssetGraph } from "../../lib/asset-graph";
import { wpCoreStylesheetUrls } from "../../lib/live-assets";
import { mirrorPageAssetGraph } from "../../lib/mirror-page-assets";
import { getActiveSiteSlug } from "../../../../app/api/wp/config";
import type { BuilderAssetPlan } from "../types";

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Live HTML enqueue order — works for any WP theme/builder combo. */
export async function resolveGenericPlan(
  pageUrl = getWpUrl(),
  html?: string,
): Promise<BuilderAssetPlan> {
  let pageHtml = html;
  if (!pageHtml) {
    const res = await wpHttpFetch(pageUrl);
    if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
    pageHtml = await res.text();
  }

  const graph = buildPageAssetGraph(pageHtml, pageUrl);
  const base = getWpUrl().replace(/\/$/, "");

  const stylesheets = unique([
    ...(graph.builder === "gutenberg" ? wpCoreStylesheetUrls(base) : []),
    ...graph.stylesheets,
    ...graph.conditionalStylesheets,
    ...graph.fontStylesheets,
  ]);

  const inlineScripts = graph.scripts
    .filter((s) => s.inline)
    .map((s) => ({
      id: s.id,
      content: s.inline!,
      type: s.type,
    }))
    .filter(
      (s) =>
        s.content.length < 80_000 &&
        !s.content.includes("challenge-platform") &&
        !s.content.includes("__CF$cv"),
    );

  const scriptUrls = unique([
    ...graph.scripts.map((s) => s.src).filter(Boolean) as string[],
    ...graph.conditionalScripts,
  ]);

  return {
    builder: graph.builder,
    detectedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets,
    scripts: scriptUrls.map((src) => ({ src, handle: src })),
    inlineScripts,
    documentIds: graph.elementorDocumentIds,
    templateIds: [],
    widgets: [],
    snippetIds: [],
    themes: graph.themeSlugs,
    notes: [
      `Asset graph from live HTML (${graph.builder})`,
      `Themes: ${graph.themeSlugs.join(", ") || "none"}`,
      `Plugins: ${graph.pluginSlugs.slice(0, 12).join(", ") || "none"}`,
      ...(graph.animationLibs.length
        ? [`Animation libs: ${graph.animationLibs.join(", ")}`]
        : []),
    ],
  };
}

export async function fetchGenericPlan(
  plan: BuilderAssetPlan,
  pageHtml?: string,
): Promise<BuilderAssetPlan> {
  const siteSlug = getActiveSiteSlug();
  if (siteSlug && pageHtml) {
    const graph = buildPageAssetGraph(pageHtml, plan.sourceUrl);
    await mirrorPageAssetGraph(graph, siteSlug);
  }

  const cssRegistry = getCssRegistry();
  await downloadStylesheets(plan.stylesheets, cssRegistry);
  await downloadScripts(plan.scripts.map((s) => s.src), getJsRegistry());

  const cssOk = plan.stylesheets.filter((url) => cssRegistry.has(url)).length;
  const dir = path.join(
    getMigratedDataDir(),
    plan.builder === "unknown" ? "generic" : plan.builder,
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "asset-plan.json"),
    JSON.stringify({ ...plan, downloadedCss: cssOk }, null, 2),
    "utf8",
  );

  console.log(
    `   ${plan.builder} plan: ${plan.stylesheets.length} CSS, ${plan.scripts.length} JS, downloaded ${cssOk} CSS`,
  );
  persistCssRegistry();
  persistJsRegistry();
  persistFontRegistry();

  return plan;
}

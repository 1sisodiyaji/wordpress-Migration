import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir, getWpUrl } from "../../../../app/api/wp/config";
import { wpHttpFetch } from "../../../../app/api/wp/http";
import {
  downloadStylesheets,
  getCssRegistry,
  persistCssRegistry,
} from "../../lib/css-download";
import type { BuilderAssetPlan } from "../types";
import {
  ELEMENTOR_PLUGIN_CSS,
  ELEMENTOR_PLUGIN_JS,
  ELEMENTOR_PRO_CONDITIONAL_CSS,
  ELEMENTOR_UPLOADS_CSS,
  absUrl,
  postCssPath,
} from "./constants";
import { buildPageAssetGraph } from "../../lib/asset-graph";
import { extractLivePageAssets } from "../../lib/live-assets";
import { mirrorPageAssetGraph } from "../../lib/mirror-page-assets";
import { getActiveSiteSlug } from "../../../../app/api/wp/config";
import { persistFontRegistry } from "../../lib/font-download";
import { parseElementorHtml } from "./parse-html";
import { fetchElementorMetaFromApi } from "./resolve-api";
import {
  downloadScripts,
  getJsRegistry,
  persistJsRegistry,
} from "../../lib/js-download";

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Build full asset plan from HTML + API (mirrors Elementor Frontend::enqueue_styles). */
export async function resolveElementorPlan(pageUrl = getWpUrl()): Promise<BuilderAssetPlan> {
  const res = await wpHttpFetch(pageUrl);
  if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
  const html = await res.text();
  const parsed = parseElementorHtml(html, pageUrl);
  const live = extractLivePageAssets(html, pageUrl);
  const api = await fetchElementorMetaFromApi();

  const base = getWpUrl().replace(/\/$/, "");
  const stylesheets: string[] = [];
  const scripts: BuilderAssetPlan["scripts"] = [];
  const notes: string[] = [
    "Plan mirrors Elementor core/files/css/post.php + frontend.php enqueue order",
  ];

  // 1. Plugin base CSS (always)
  for (const p of ELEMENTOR_PLUGIN_CSS) stylesheets.push(absUrl(base, p));
  for (const p of ELEMENTOR_UPLOADS_CSS) stylesheets.push(absUrl(base, p));

  // 2. Conditional Pro / widget CSS from widgets on page
  for (const key of parsed.conditionalKeys) {
    for (const p of ELEMENTOR_PRO_CONDITIONAL_CSS[key] ?? []) {
      stylesheets.push(absUrl(base, p));
    }
  }

  // 3. Live page CSS — every plugin/theme/core/upload URL in DOM order
  stylesheets.push(...live.stylesheetUrls);

  // 4. Per-document CSS: kit + page + embedded templates
  const allDocIds = unique([
    ...parsed.documentIds,
    ...api.templateIds,
    ...(api.kitId ? [api.kitId] : []),
    ...(parsed.kitId ? [parsed.kitId] : []),
  ]);

  for (const id of allDocIds) {
    stylesheets.push(absUrl(base, postCssPath(id)));
  }

  // 5. Parsed HTML stylesheets (dedupe with live)
  stylesheets.push(...parsed.stylesheetUrls);

  // JS: Elementor core stack + every live script (plugins, theme, core) in DOM order
  for (const p of ELEMENTOR_PLUGIN_JS) {
    scripts.push({ src: absUrl(base, p), handle: p.split("/").pop() });
  }
  for (const s of live.scriptUrls) {
    scripts.push({ src: s.src, id: s.id, handle: s.id });
  }
  for (const s of parsed.scriptUrls) {
    scripts.push({ src: s.src, id: s.id });
  }

  const pluginSlugs = live.pluginSlugs.filter(
    (p) => p !== "elementor" && p !== "elementor-pro",
  );
  if (pluginSlugs.length) {
    notes.push(`Third-party plugins: ${pluginSlugs.join(", ")}`);
  }

  const inlineScripts = parsed.inlineScripts.filter(
    (s) =>
      s.content.includes("elementorFrontendConfig") ||
      s.content.includes("ElementorProFrontendConfig") ||
      s.content.includes("elementskit") ||
      s.id?.includes("elementor") ||
      s.content.length < 80_000,
  );

  return {
    builder: "elementor",
    detectedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets: unique(stylesheets),
    scripts: unique(scripts.map((s) => JSON.stringify(s))).map((s) => JSON.parse(s) as BuilderAssetPlan["scripts"][0]),
    inlineScripts,
    documentIds: allDocIds,
    kitId: parsed.kitId ?? api.kitId,
    templateIds: api.templateIds,
    widgets: parsed.widgets,
    snippetIds: api.snippetIds,
    themes: live.themeSlugs,
    notes,
  };
}

/** Download all planned assets to public/wp-migrated */
export async function fetchElementorPlan(
  plan: BuilderAssetPlan,
  pageHtml?: string,
): Promise<BuilderAssetPlan> {
  const siteSlug = getActiveSiteSlug();
  if (siteSlug) {
    let html = pageHtml;
    if (!html) {
      const res = await wpHttpFetch(plan.sourceUrl);
      html = res.ok ? await res.text() : "";
    }
    if (html) {
      await mirrorPageAssetGraph(buildPageAssetGraph(html, plan.sourceUrl), siteSlug, {
        html,
        pageUrl: plan.sourceUrl,
      });
    }
  }

  const registry = getCssRegistry();

  await downloadStylesheets(plan.stylesheets, registry);
  await downloadStylesheets(
    plan.documentIds.map((id) => absUrl(getWpUrl(), postCssPath(id))),
    registry,
  );
  await downloadScripts(
    plan.scripts.map((s) => s.src),
    getJsRegistry(),
  );

  const cssOk = plan.stylesheets.filter((url) => registry.has(url)).length;
  const cssSkip = plan.stylesheets.length - cssOk;

  const dir = path.join(getMigratedDataDir(), "elementor");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "asset-plan.json"),
    JSON.stringify({ ...plan, downloadedCss: cssOk, skippedCss: cssSkip }, null, 2),
    "utf8",
  );

  // Back-compat assets.json for ElementorFrontendLoader
  await fs.writeFile(
    path.join(dir, "assets.json"),
    JSON.stringify(
      {
        fetchedAt: plan.detectedAt,
        sourceUrl: plan.sourceUrl,
        stylesheets: plan.stylesheets,
        scripts: plan.scripts,
        inlineScripts: plan.inlineScripts,
        documentIds: plan.documentIds,
        kitCssPaths: plan.kitId ? [postCssPath(plan.kitId)] : [],
        widgets: plan.widgets,
        templateIds: plan.templateIds,
        snippetIds: plan.snippetIds,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `   Elementor plan: ${plan.stylesheets.length} CSS URLs, ${plan.scripts.length} JS, ${plan.documentIds.length} documents, ${plan.widgets.length} widget types`,
  );
  console.log(`   Downloaded ${cssOk} CSS files (${cssSkip} skipped)`);
  persistCssRegistry();
  persistJsRegistry();
  persistFontRegistry();

  return plan;
}

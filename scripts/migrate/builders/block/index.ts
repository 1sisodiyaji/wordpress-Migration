import fs from "node:fs/promises";
import path from "node:path";
import { MIGRATED_DATA_DIR, WP_URL } from "../../../../app/api/wp/config";
import { wpHttpFetch } from "../../../../app/api/wp/http";
import { downloadStylesheets, getCssRegistry } from "../../lib/css-download";
import type { BuilderAssetPlan } from "../types";

/** Gutenberg / block theme: theme styles + block library + live page CSS. */
export async function resolveBlockPlan(pageUrl = WP_URL): Promise<BuilderAssetPlan> {
  const res = await wpHttpFetch(pageUrl);
  if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
  const html = await res.text();

  const base = WP_URL.replace(/\/$/, "");
  const stylesheets: string[] = [
    `${base}/wp-includes/css/dist/block-library/style.min.css`,
    `${base}/wp-includes/css/dist/block-library/theme.min.css`,
    `${base}/wp-content/themes/astra/assets/css/minified/main.min.css`,
    `${base}/wp-content/themes/astra-child-theme/style.css`,
  ];

  const scriptMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
  const scripts = scriptMatches.map((m) => ({ src: new URL(m[1], pageUrl).href }));

  const linkMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)];
  for (const m of linkMatches) {
    stylesheets.push(new URL(m[1], pageUrl).href);
  }

  return {
    builder: "gutenberg",
    detectedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    stylesheets: [...new Set(stylesheets)],
    scripts: [...new Set(scripts.map((s) => JSON.stringify(s)))].map(
      (s) => JSON.parse(s) as BuilderAssetPlan["scripts"][0],
    ),
    inlineScripts: [],
    documentIds: [],
    templateIds: [],
    widgets: [],
    snippetIds: [],
    themes: ["astra", "astra-child-theme"],
    notes: ["Block theme path: wp-block-* styles + theme enqueue order"],
  };
}

export async function fetchBlockPlan(plan: BuilderAssetPlan): Promise<BuilderAssetPlan> {
  const registry = getCssRegistry();
  await downloadStylesheets(plan.stylesheets, registry);
  const cssOk = plan.stylesheets.filter((url) => registry.has(url)).length;

  const dir = path.join(MIGRATED_DATA_DIR, "block");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "asset-plan.json"),
    JSON.stringify({ ...plan, downloadedCss: cssOk }, null, 2),
    "utf8",
  );

  console.log(`   Block plan: ${plan.stylesheets.length} CSS, downloaded ${cssOk}`);
  return plan;
}

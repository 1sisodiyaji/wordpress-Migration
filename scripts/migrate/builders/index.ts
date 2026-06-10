import { WP_URL } from "../../../app/api/wp/config";
import { wpHttpFetch } from "../../../app/api/wp/http";
import type { PageBuilder } from "../../../app/api/wp/types";
import { detectSitePageBuilder } from "../detect-builder";
import { detectBuilderFromHtml } from "../lib/html-extract";
import { fetchBlockPlan, resolveBlockPlan } from "./block";
import type { BuilderAssetPlan, BuilderStrategy } from "./types";
import { fetchElementorPlan, resolveElementorPlan } from "./elementor";

const elementorStrategy: BuilderStrategy = {
  id: "elementor",
  detect: (html) => detectBuilderFromHtml(html) === "elementor",
  resolve: (pageUrl) => resolveElementorPlan(pageUrl),
  fetch: fetchElementorPlan,
};

const gutenbergStrategy: BuilderStrategy = {
  id: "gutenberg",
  detect: (html) => detectBuilderFromHtml(html) === "gutenberg",
  resolve: (pageUrl) => resolveBlockPlan(pageUrl),
  fetch: fetchBlockPlan,
};

const classicStrategy: BuilderStrategy = {
  id: "classic",
  detect: (html) => detectBuilderFromHtml(html) === "classic",
  resolve: (pageUrl) => resolveBlockPlan(pageUrl),
  fetch: fetchBlockPlan,
};

const STRATEGIES: BuilderStrategy[] = [
  elementorStrategy,
  gutenbergStrategy,
  classicStrategy,
];

export function strategyForBuilder(builder: PageBuilder): BuilderStrategy | undefined {
  return STRATEGIES.find((s) => s.id === builder);
}

/** Detect builder from homepage, resolve full asset plan, download assets. */
export async function runBuilderPipeline(
  pageUrl = WP_URL,
): Promise<{ builder: PageBuilder; plan: BuilderAssetPlan }> {
  console.log("🔍 Detecting page builder…");
  const builder = await detectSitePageBuilder(pageUrl);
  console.log(`   Builder: ${builder}`);

  const strategy = strategyForBuilder(builder) ?? elementorStrategy;
  const res = await wpHttpFetch(pageUrl);
  const html = res.ok ? await res.text() : "";

  if (strategy.detect(html) || builder === "unknown") {
    console.log(`📋 Resolving ${strategy.id} asset plan (CSS/JS/templates)…`);
    const plan = await strategy.resolve(pageUrl, html);
    await strategy.fetch(plan);
    return { builder: strategy.id, plan };
  }

  const fallback = await elementorStrategy.resolve(pageUrl, html);
  await elementorStrategy.fetch(fallback);
  return { builder: "elementor", plan: fallback };
}

export { type BuilderAssetPlan } from "./types";

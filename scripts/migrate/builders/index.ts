import { getWpUrl } from "../../../app/api/wp/config";
import { wpHttpFetch } from "../../../app/api/wp/http";
import type { PageBuilder } from "../../../app/api/wp/types";
import { detectSitePageBuilder } from "../detect-builder";
import { detectBuilderFromHtml } from "../lib/html-extract";
import { isVisualPageBuilder } from "../lib/shell-crawl";
import { fetchBlockPlan, resolveBlockPlan } from "./block";
import { fetchGenericPlan, resolveGenericPlan } from "./generic";
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

const visualBuilders: PageBuilder[] = [
  "divi",
  "wpbakery",
  "beaver",
  "brizy",
  "oxygen",
];

function visualStrategy(id: PageBuilder): BuilderStrategy {
  return {
    id,
    detect: (html) => detectBuilderFromHtml(html) === id,
    resolve: (pageUrl, html) => resolveGenericPlan(pageUrl, html),
    fetch: fetchGenericPlan,
  };
}

const STRATEGIES: BuilderStrategy[] = [
  elementorStrategy,
  ...visualBuilders.map(visualStrategy),
  gutenbergStrategy,
  classicStrategy,
];

const genericStrategy: BuilderStrategy = {
  id: "unknown",
  detect: () => true,
  resolve: (pageUrl, html) => resolveGenericPlan(pageUrl, html),
  fetch: fetchGenericPlan,
};

export function strategyForBuilder(builder: PageBuilder): BuilderStrategy {
  return STRATEGIES.find((s) => s.id === builder) ?? genericStrategy;
}

export function pickStrategy(html: string, builder: PageBuilder): BuilderStrategy {
  const match = STRATEGIES.find((s) => s.detect(html));
  if (match) return match;
  if (isVisualPageBuilder(builder)) {
    return visualStrategy(builder);
  }
  return strategyForBuilder(builder);
}

/** Detect builder from homepage, resolve asset plan, download assets. */
export async function runBuilderPipeline(
  pageUrl = getWpUrl(),
): Promise<{ builder: PageBuilder; plan: BuilderAssetPlan }> {
  console.log("🔍 Detecting page builder…");
  const res = await wpHttpFetch(pageUrl);
  const html = res.ok ? await res.text() : "";
  const detected = html ? detectBuilderFromHtml(html) : await detectSitePageBuilder(pageUrl);
  console.log(`   Builder: ${detected}`);

  const strategy = pickStrategy(html, detected);
  console.log(`📋 Resolving ${strategy.id} asset plan (CSS/JS from live HTML)…`);
  const plan = await strategy.resolve(pageUrl, html);
  await strategy.fetch(plan, html);
  return { builder: plan.builder, plan };
}

export { type BuilderAssetPlan } from "./types";

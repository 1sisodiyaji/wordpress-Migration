import type { PageBuilder } from "../../../app/api/wp/types";

/** Full asset plan produced by a builder-specific resolver. */
export interface BuilderAssetPlan {
  builder: PageBuilder;
  detectedAt: string;
  sourceUrl: string;
  /** CSS URLs in WordPress enqueue order */
  stylesheets: string[];
  /** JS URLs in WordPress enqueue order */
  scripts: Array<{ src: string; id?: string; handle?: string }>;
  /** Inline scripts (elementorFrontendConfig, JSON-LD, etc.) */
  inlineScripts: Array<{ id?: string; content: string; type?: string }>;
  /** Elementor document IDs → post-{id}.css */
  documentIds: number[];
  kitId?: number;
  /** elementor_library / theme builder template IDs */
  templateIds: number[];
  /** Widget types found (elementor-widget-*) → drives conditional assets */
  widgets: string[];
  /** Custom code snippet post IDs */
  snippetIds: number[];
  /** Theme slugs detected */
  themes: string[];
  notes: string[];
}

export interface BuilderStrategy {
  id: PageBuilder;
  detect(html: string): boolean;
  resolve(pageUrl: string, html: string): Promise<BuilderAssetPlan>;
  fetch(plan: BuilderAssetPlan): Promise<BuilderAssetPlan>;
}

import type { PageBuilder } from "../../../app/api/wp/types";
import { migrateFullDesign, migrateFullSite } from "./migrate-flags";

const VISUAL_BUILDERS: PageBuilder[] = [
  "elementor",
  "divi",
  "wpbakery",
  "beaver",
  "brizy",
  "oxygen",
];

export function isVisualPageBuilder(builder: PageBuilder): boolean {
  return VISUAL_BUILDERS.includes(builder);
}

export function defaultRenderMode(
  siteBuilder: PageBuilder,
  pageHtml?: string,
): "shell" | "api" {
  if (migrateFullSite()) return "shell";
  if (isVisualPageBuilder(siteBuilder)) return "shell";
  if (siteBuilder === "gutenberg") return "shell";
  if (pageHtml && isLikelyElementorPost(pageHtml)) return "shell";
  return "api";
}

export function isLikelyElementorPost(html: string): boolean {
  return (
    html.includes("[elementor") ||
    html.includes("elementor-widget") ||
    html.includes("data-elementor-id") ||
    html.includes("elementor-element")
  );
}

export function useFullBodyForCrawl(
  builder: PageBuilder,
  route: {
    path: string;
    pageBuilder?: PageBuilder;
    isElementor?: boolean;
    renderMode?: string;
  },
): boolean {
  if (migrateFullDesign()) return true;
  if (route.path === "/") return true;
  const pageBuilder = route.pageBuilder ?? builder;
  if (isVisualPageBuilder(pageBuilder)) return true;
  if (route.isElementor || pageBuilder === "elementor") return true;
  if (pageBuilder === "gutenberg") return true;
  if (route.renderMode === "shell") return true;
  return false;
}

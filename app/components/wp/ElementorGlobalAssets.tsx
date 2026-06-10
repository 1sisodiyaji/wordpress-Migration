import { getElementorGlobalCss } from "@/api/wp/page-shell";
import { useSiteSlug } from "@/lib/wp/site-context";
import { ElementorRuntime } from "./ElementorRuntime";

/** Injects Elementor Custom Code snippets (global CSS/JS) site-wide. */
export function ElementorGlobalAssets() {
  const site = useSiteSlug();
  const globalCss = getElementorGlobalCss(site);
  if (!globalCss) return null;
  return <ElementorRuntime globalCss={globalCss} />;
}

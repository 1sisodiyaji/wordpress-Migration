import {
  getPageShellAssets,
  getPageShellHtml,
} from "@/api/wp/page-shell";
import { getManifest } from "@/api/wp/load-migrated";
import { useSiteSlug } from "@/lib/wp/site-context";
import { ElementorRuntime } from "./ElementorRuntime";
import { WpMigratedHtml } from "./WpMigratedHtml";

interface WpPageShellProps {
  routePath: string;
  className?: string;
}

/** Renders crawled page HTML + runs custom code scripts when needed. */
export function WpPageShell({ routePath, className }: WpPageShellProps) {
  const site = useSiteSlug();
  const html = getPageShellHtml(routePath, site);
  if (!html) return null;

  const assets = getPageShellAssets(routePath, site);
  const manifest = getManifest(site);
  const isElementor =
    manifest?.pageBuilder === "elementor" ||
    manifest?.routes.find((r) => r.path === routePath)?.pageBuilder ===
      "elementor";
  return (
    <div data-route={routePath} data-builder="shell">
      <WpMigratedHtml
        html={html}
        className={className ?? "wp-migrated-page-shell"}
      />
      {isElementor && assets ? <ElementorRuntime assets={assets} /> : null}
    </div>
  );
}

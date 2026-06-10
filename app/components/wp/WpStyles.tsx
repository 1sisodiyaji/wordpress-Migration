import { getStyles } from "@/api/wp/load-migrated";
import { criticalStylesheetUrls } from "@/lib/wp/elementor-critical-css";
import { useLiveCss } from "@/lib/wp/env";
import { useSiteSlug } from "@/lib/wp/site-context";
import { getMigratedPublicUrlPrefix } from "@/api/wp/config";
import { useSiteSourceUrl } from "@/lib/wp/site-context";

export function WpStyles() {
  const site = useSiteSlug();
  const sourceUrl = useSiteSourceUrl();
  const styles = getStyles(site);
  const assetPrefix = getMigratedPublicUrlPrefix(site);
  const isElementor = styles?.pageBuilder === "elementor";
  const liveCss = useLiveCss();

  /** Plugin + theme base CSS from source WP (not always in migrated bundle). */
  const pluginBase =
    isElementor ? criticalStylesheetUrls(sourceUrl) : [];

  const localSheets = styles?.stylesheets ?? [];
  const inlineStyles = styles?.inlineStyles ?? [];

  const localOnly = liveCss
    ? localSheets.filter((href) => {
        const name = href.toLowerCase();
        const isCriticalDuplicate = [
          "frontend.min",
          "custom-frontend",
          "widget-styles",
          "swiper.min",
          "nav-menu",
        ].some((k) => name.includes(k));
        return !isCriticalDuplicate;
      })
    : localSheets;

  return (
    <>
      {pluginBase.map((href) => (
        <link key={`plugin-${href}`} rel="stylesheet" href={href} />
      ))}
      {localOnly.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {inlineStyles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <link rel="stylesheet" href={`${assetPrefix}/overrides.css`} />
    </>
  );
}

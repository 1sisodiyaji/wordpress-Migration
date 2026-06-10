import { normalizeAssetUrl } from "./normalize-asset-url";

const CSS_IN_HTML =
  /(?:https?:)?\/\/[^\s"'<>)]+\.(?:css)(?:\?[^\s"'<>)]*)?|\/wp-content\/[^\s"'<>)]+\.(?:css)(?:\?[^\s"'<>)]*)?/gi;

const JS_IN_HTML =
  /(?:https?:)?\/\/[^\s"'<>)]+\.(?:js)(?:\?[^\s"'<>)]*)?|\/wp-content\/[^\s"'<>)]+\.(?:js)(?:\?[^\s"'<>)]*)?/gi;

function toAbsolute(raw: string, pageUrl: string): string | null {
  try {
    const href = raw.startsWith("//") ? `https:${raw}` : raw;
    return normalizeAssetUrl(new URL(href, pageUrl).href, pageUrl);
  } catch {
    return null;
  }
}

function isWpAsset(url: string): boolean {
  return (
    url.includes("/wp-content/") ||
    url.includes("/wp-includes/") ||
    url.includes("/wp-content/cache/") ||
    url.includes("/wp-content/litespeed/") ||
    url.includes("/wp-content/autoptimize/")
  );
}

/**
 * Find plugin/theme/cache CSS+JS referenced in HTML but not always in <link>/<script>.
 * WP Rocket, Autoptimize, LiteSpeed embed paths in inline JSON or bundled refs.
 */
export function discoverAssetsInHtml(
  html: string,
  pageUrl: string,
): { stylesheets: string[]; scripts: string[] } {
  const css = new Set<string>();
  const js = new Set<string>();

  for (const match of html.matchAll(CSS_IN_HTML)) {
    const abs = toAbsolute(match[0], pageUrl);
    if (abs && isWpAsset(abs)) css.add(abs);
  }
  for (const match of html.matchAll(JS_IN_HTML)) {
    const abs = toAbsolute(match[0], pageUrl);
    if (abs && isWpAsset(abs)) js.add(abs);
  }

  return { stylesheets: [...css], scripts: [...js] };
}

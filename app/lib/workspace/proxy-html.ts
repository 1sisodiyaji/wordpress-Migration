import * as cheerio from "cheerio";

function isSafeHttpUrl(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

/** Rewrite same-origin anchors to stay inside the live browse proxy. */
export function rewriteLiveBrowseLinks(
  html: string,
  siteOrigin: string,
  siteBaseUrl: string,
  browsePath: string,
): string {
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    if (href.startsWith("javascript:")) {
      $(el).removeAttr("href");
      return;
    }
    try {
      const abs = new URL(href, siteBaseUrl);
      if (abs.origin !== siteOrigin) return;
      const proxy = `${browsePath}?url=${encodeURIComponent(abs.href)}`;
      $(el).attr("href", proxy);
    } catch {
      /* skip malformed */
    }
  });
  return $.html();
}

/** Rewrite same-origin anchors to migrated preview proxy routes. */
export function rewriteMigratedPreviewLinks(
  html: string,
  siteOrigin: string,
  siteBaseUrl: string,
  previewPath: string,
): string {
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    if (href.startsWith("javascript:")) {
      $(el).removeAttr("href");
      return;
    }
    try {
      const abs = new URL(href, siteBaseUrl);
      if (abs.origin !== siteOrigin) return;
      const route = abs.pathname + abs.search + abs.hash;
      $(el).attr(
        "href",
        `${previewPath}?route=${encodeURIComponent(route)}`,
      );
    } catch {
      /* skip */
    }
  });
  return $.html();
}

export function resolveAllowedSiteUrl(
  raw: string | null,
  fallback: string,
  allowedOrigin: string,
): string {
  const target = raw?.trim() || fallback;
  try {
    const url = new URL(target, fallback);
    if (url.origin !== allowedOrigin) {
      throw new Error("origin mismatch");
    }
    if (!isSafeHttpUrl(url.href)) {
      throw new Error("invalid protocol");
    }
    return url.href;
  } catch {
    return new URL(fallback).href;
  }
}

export function displayUrlForSitePath(siteBaseUrl: string, route: string): string {
  try {
    return new URL(route, siteBaseUrl).href;
  } catch {
    return siteBaseUrl;
  }
}

/** Workspace preview path shown in the migrated pane URL bar (not the live WP URL). */
export function workspacePreviewPath(slug: string, route = "/"): string {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  return `/workspace/${slug}/preview?route=${encodeURIComponent(normalized)}`;
}

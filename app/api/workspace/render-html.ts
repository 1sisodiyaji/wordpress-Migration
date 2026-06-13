import { buildRawPreviewDocument } from "@/api/wp/build-raw-document";
import { wpHttpFetch } from "@/api/wp/http";
import { hasPageShell } from "@/api/wp/page-shell";
import { getSite } from "@/api/wp/sites";
import {
  injectNavigationBeacon,
  setDisplayUrlMeta,
} from "@/lib/workspace/nav-beacon";
import {
  resolveAllowedSiteUrl,
  rewriteLiveBrowseLinks,
  rewriteMigratedPreviewLinks,
  workspacePreviewPath,
} from "@/lib/workspace/proxy-html";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

/** Live WP page HTML for workspace iframe (proxied + link rewrite). */
export async function renderWorkspaceBrowseHtml(
  slug: string,
  requestUrl: URL,
): Promise<Response> {
  const entry = getSite(slug);
  if (!entry) {
    return new Response("Not found", { status: 404 });
  }

  const siteOrigin = new URL(entry.url).origin;
  const targetUrl = resolveAllowedSiteUrl(
    requestUrl.searchParams.get("url"),
    entry.url,
    siteOrigin,
  );

  const browsePath = `/workspace/${slug}/browse`;
  const res = await wpHttpFetch(targetUrl);
  if (!res.ok) {
    return new Response(`Upstream ${res.status}`, { status: res.status });
  }

  let html = await res.text();
  html = rewriteLiveBrowseLinks(html, siteOrigin, entry.url, browsePath);
  html = setDisplayUrlMeta(html, targetUrl);
  html = injectNavigationBeacon(html, "live");

  return new Response(html, { headers: HTML_HEADERS });
}

/** Migrated page HTML for workspace iframe. */
export function renderWorkspacePreviewHtml(
  slug: string,
  requestUrl: URL,
): Response {
  const entry = getSite(slug);
  if (!entry) {
    return new Response("Not found", { status: 404 });
  }

  const route = requestUrl.searchParams.get("route")?.trim() || "/";
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const previewPath = `/workspace/${slug}/preview`;
  const displayUrl = workspacePreviewPath(slug, normalizedRoute);

  if (!hasPageShell(normalizedRoute, slug)) {
    const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not migrated</title></head><body style="font-family:system-ui;padding:2rem"><h1>Page not migrated</h1><p>No shell for <code>${normalizedRoute}</code></p><p><a href="${displayUrl}">Home</a></p></body></html>`;
    return new Response(body, { status: 404, headers: HTML_HEADERS });
  }

  const siteOrigin = new URL(entry.url).origin;
  let html = buildRawPreviewDocument(slug, normalizedRoute);
  html = rewriteMigratedPreviewLinks(html, siteOrigin, entry.url, previewPath);
  html = setDisplayUrlMeta(html, displayUrl);
  html = injectNavigationBeacon(html, "migrated");

  return new Response(html, { headers: HTML_HEADERS });
}

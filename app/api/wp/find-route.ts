import type { MigrationManifest, WpPost, WpRoute } from "./types";
import { getManifest } from "./load-migrated";

export function findRouteByPath(
  path: string,
  siteSlug?: string,
): WpRoute | undefined {
  const manifest = getManifest(siteSlug);
  if (!manifest) return undefined;
  const normalized = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return manifest.routes.find((r) => r.path === normalized);
}

export function findPostForRoute(
  route: WpRoute,
  siteSlug?: string,
): WpPost | undefined {
  const manifest = getManifest(siteSlug);
  if (!manifest) return undefined;

  if (route.postId) {
    const list = route.type === "page" ? manifest.pages : manifest.posts;
    const byId = list.find((p) => p.id === route.postId);
    if (byId) return byId;
  }

  if (!route.slug) return undefined;
  if (route.type === "page") {
    return manifest.pages.find((p) => p.slug === route.slug);
  }
  if (route.type === "post") {
    return manifest.posts.find((p) => p.slug === route.slug);
  }
  return undefined;
}

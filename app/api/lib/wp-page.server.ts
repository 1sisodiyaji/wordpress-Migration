import { findPostForRoute, findRouteByPath } from "@/api/wp/find-route";
import { getManifest } from "@/api/wp/load-migrated";
import { hasPageShell } from "@/api/wp/page-shell";

export type WpPageResult =
  | { kind: "not-found" }
  | {
      kind: "shell";
      path: string;
      title?: string;
    }
  | {
      kind: "content";
      path: string;
      html: string;
      classList?: string[];
      title?: string;
    };

function stripTitle(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

export function resolveWpPage(
  path: string,
  siteSlug?: string,
): WpPageResult {
  const manifest = getManifest(siteSlug);
  if (!manifest) return { kind: "not-found" };

  const route = findRouteByPath(path, siteSlug);
  if (!route || route.type === "home") return { kind: "not-found" };

  const post = findPostForRoute(route, siteSlug);
  const title = post ? stripTitle(post.title.rendered) : undefined;

  const useShell =
    route.renderMode === "shell" ||
    route.pageBuilder === "elementor" ||
    route.isElementor ||
    manifest.pageBuilder === "elementor" ||
    hasPageShell(path, siteSlug);

  if (useShell && hasPageShell(path, siteSlug)) {
    return { kind: "shell", path, title };
  }

  if (post?.content.rendered) {
    return {
      kind: "content",
      path,
      html: post.content.rendered,
      classList: post.class_list,
      title,
    };
  }

  return { kind: "not-found" };
}
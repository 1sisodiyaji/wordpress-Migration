import fs from "node:fs/promises";
import path from "node:path";
import {
  fetchSiteMeta,
  getRestBase,
  wpFetchAll,
  wpFetchAllLight,
} from "../../app/api/wp/client";
import { fetchContentViaGraphQL, isGraphQLAvailable } from "../../app/api/wp/graphql";
import { getMigratedDataDir, getWpUrl } from "../../app/api/wp/config";
import type { MigrationManifest, WpMedia, WpPost, WpRoute } from "../../app/api/wp/types";
import type { PageBuilder, StylesManifest } from "../../app/api/wp/types";
import { detectSitePageBuilder } from "./detect-builder";
import { migrateUseSitemap } from "./lib/migrate-flags";
import { capRoutes } from "./lib/route-cap";
import {
  defaultRenderMode,
  isLikelyElementorPost,
} from "./lib/shell-crawl";
import { discoverSitemapUrls } from "./lib/sitemap";
import { linkToPath } from "./lib/url-path";

function rewriteContentHtml(html: string): string {
  const origin = process.env.NEXT_PUBLIC_WP_MEDIA_ORIGIN;
  if (!origin) return html;
  return html.replaceAll(getWpUrl(), origin);
}

function buildRoutes(
  pages: WpPost[],
  posts: WpPost[],
  home: string,
  siteBuilder: PageBuilder,
): WpRoute[] {
  const routes: WpRoute[] = [
    {
      path: "/",
      wpLink: home,
      type: "home",
      renderMode: "shell",
      pageBuilder: siteBuilder,
    },
  ];

  for (const page of pages) {
    const rendered = page.content.rendered;
    const renderMode = defaultRenderMode(siteBuilder, rendered);

    const path = linkToPath(page.link, home);
    if (path === "/") continue;

    routes.push({
      path,
      wpLink: page.link,
      type: "page",
      postId: page.id,
      slug: page.slug,
      renderMode,
      source: "rest",
      isElementor:
        renderMode === "shell" &&
        (siteBuilder === "elementor" || isLikelyElementorPost(rendered)),
      pageBuilder: isLikelyElementorPost(rendered) ? "elementor" : siteBuilder,
    });
  }

  for (const post of posts) {
    const rendered = post.content.rendered;
    const renderMode = defaultRenderMode(siteBuilder, rendered);

    const path = linkToPath(post.link, home);

    routes.push({
      path,
      wpLink: post.link,
      type: "post",
      postId: post.id,
      slug: post.slug,
      renderMode,
      source: "rest",
      isElementor:
        renderMode === "shell" &&
        (siteBuilder === "elementor" || isLikelyElementorPost(rendered)),
      pageBuilder: isLikelyElementorPost(rendered) ? "elementor" : siteBuilder,
    });
  }

  const seen = new Set<string>();
  return routes.filter((r) => {
    if (seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  });
}

function mergeSitemapRoutes(
  routes: WpRoute[],
  sitemapPageUrls: string[],
  home: string,
  siteBuilder: PageBuilder,
): WpRoute[] {
  const byPath = new Map(routes.map((r) => [r.path, { ...r }]));
  let added = 0;

  for (const url of sitemapPageUrls) {
    const path = linkToPath(url, home);
    if (!path || path === "/") continue;

    const existing = byPath.get(path);
    if (existing) {
      existing.source = existing.source === "sitemap" ? "sitemap" : "both";
      existing.renderMode = defaultRenderMode(siteBuilder);
      continue;
    }

    byPath.set(path, {
      path,
      wpLink: url,
      type: "page",
      renderMode: defaultRenderMode(siteBuilder),
      source: "sitemap",
      pageBuilder: siteBuilder,
    });
    added += 1;
  }

  if (added > 0) {
    console.log(`  + ${added} route(s) from sitemap.xml (not in REST)`);
  }

  return [...byPath.values()];
}

export async function fetchContent(styles: StylesManifest): Promise<MigrationManifest> {
  const restBase = await getRestBase();
  const sitePartial = await fetchSiteMeta();
  const graphqlOk = await isGraphQLAvailable();

  let posts: WpPost[] = [];
  let pages: WpPost[] = [];

  if (graphqlOk) {
    console.log("  Using WPGraphQL for content…");
    const gql = await fetchContentViaGraphQL();
    if (gql) {
      posts = gql.posts;
      pages = gql.pages;
    }
  }

  if (!posts.length && !pages.length) {
    const pageBuilderHint = styles.pageBuilder ?? (await detectSitePageBuilder());
    const useLightRest =
      pageBuilderHint === "elementor" &&
      process.env.MIGRATE_REST_LIGHTWEIGHT !== "false";

    if (useLightRest) {
      console.log(
        "  Using WordPress REST API (lightweight, no rendered HTML)…",
      );
      console.log("  (Elementor pages use live HTML crawl for layout.)");
    } else {
      console.log(
        "  Using WordPress REST API (full content.rendered for all routes)…",
      );
    }

    const fetchPosts = useLightRest
      ? wpFetchAllLight<WpPost>("/wp/v2/posts", { status: "publish" })
      : wpFetchAll<WpPost>("/wp/v2/posts", { status: "publish" });
    const fetchPages = useLightRest
      ? wpFetchAllLight<WpPost>("/wp/v2/pages", { status: "publish" })
      : wpFetchAll<WpPost>("/wp/v2/pages", { status: "publish" });

    const [rawPosts, rawPages] = await Promise.all([fetchPosts, fetchPages]);
    const emptyContent = { rendered: "", protected: false };
    const emptyExcerpt = { rendered: "", protected: false };
    posts = rawPosts.map((p) => ({
      ...p,
      content: p.content ?? emptyContent,
      excerpt: p.excerpt ?? emptyExcerpt,
      title: p.title ?? { rendered: "" },
    }));
    pages = rawPages.map((p) => ({
      ...p,
      content: p.content ?? emptyContent,
      excerpt: p.excerpt ?? emptyExcerpt,
      title: p.title ?? { rendered: "" },
    }));
  }

  posts = posts.map((p) => ({
    ...p,
    content: {
      ...p.content,
      rendered: rewriteContentHtml(p.content.rendered),
    },
  }));

  pages = pages.map((p) => ({
    ...p,
    content: {
      ...p.content,
      rendered: rewriteContentHtml(p.content.rendered),
    },
  }));

  let media: WpMedia[] = [];
  try {
    media = await wpFetchAll<WpMedia>("/wp/v2/media");
  } catch {
    console.warn("  ⚠ Could not fetch media library");
  }

  const pageBuilder = styles.pageBuilder ?? (await detectSitePageBuilder());

  console.log("  Discovering URLs from sitemap.xml + robots.txt…");
  const sitemap = migrateUseSitemap()
    ? await discoverSitemapUrls(sitePartial.home)
    : { pageUrls: [], sitemapUrls: [], robotsSitemaps: [] };
  if (migrateUseSitemap()) {
    console.log(
      `   ${sitemap.pageUrls.length} URL(s) in sitemap, ${sitemap.sitemapUrls.length} sitemap file(s)`,
    );
  }

  let routes = buildRoutes(pages, posts, sitePartial.home, pageBuilder);
  routes = mergeSitemapRoutes(
    routes,
    sitemap.pageUrls,
    sitePartial.home,
    pageBuilder,
  );
  routes = capRoutes(routes);

  const manifest: MigrationManifest = {
    version: 1,
    migratedAt: new Date().toISOString(),
    wordpressUrl: getWpUrl(),
    restBase,
    pageBuilder,
    site: {
      ...sitePartial,
      gmt_offset: 0,
      timezone_string: "",
    },
    routes,
    posts,
    pages,
    media,
    styles,
    sitemap: {
      fetchedAt: new Date().toISOString(),
      pageUrlCount: sitemap.pageUrls.length,
      sitemapSources: [...sitemap.sitemapUrls, ...sitemap.robotsSitemaps],
      paths: sitemap.pageUrls.map((u) => linkToPath(u, sitePartial.home)),
    },
  };

  const dataDir = getMigratedDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return manifest;
}

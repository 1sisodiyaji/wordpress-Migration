import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir } from "../../app/api/wp/config";
import { setMigrationProgress } from "../../app/api/wp/migration-status";
import { wpHttpFetch } from "../../app/api/wp/http";
import type {
  MigrationManifest,
  PageBuilder,
  StylesManifest,
  WpRoute,
} from "../../app/api/wp/types";
import { detectSitePageBuilder } from "./detect-builder";
import { buildPageAssetGraph } from "./lib/asset-graph";
import {
  getCssRegistry,
  persistCssRegistry,
} from "./lib/css-download";
import { persistFontRegistry } from "./lib/font-download";
import { mirrorPageAssetGraph } from "./lib/mirror-page-assets";
import type { PageBuilder as HtmlPageBuilder } from "./lib/html-extract";
import { extractPageFromHtml } from "./lib/html-extract";
import { persistJsRegistry } from "./lib/js-download";
import { isVisualPageBuilder, useFullBodyForCrawl } from "./lib/shell-crawl";
import { migrateFullSite } from "./lib/migrate-flags";
import { routeToPageKey } from "./lib/page-key";
import { transformHtmlForNext } from "./lib/html-transform";
import { mapPool } from "./lib/pool";
import { rewriteMigratedHtml } from "./lib/url-path";

function pagesDir(): string {
  return path.join(getMigratedDataDir(), "pages");
}

function crawlDelayMs(): number {
  const configured = process.env.MIGRATE_CRAWL_DELAY_MS;
  if (configured !== undefined) return Number(configured);
  try {
    const host = new URL(process.env.WORDPRESS_URL ?? "http://localhost:8080").hostname;
    if (host === "localhost" || host === "127.0.0.1") return 0;
  } catch {
    /* use default */
  }
  return 150;
}

async function crawlRoute(
  route: WpRoute,
  registry: Map<string, string>,
  useFullBody: boolean,
): Promise<{ key: string; pageBuilder: HtmlPageBuilder; isElementor: boolean }> {
  const url = route.wpLink;
  const res = await wpHttpFetch(url);
  if (!res.ok) throw new Error(`Cannot fetch ${url}: ${res.status}`);

  const html = await res.text();
  const extracted = extractPageFromHtml(html, url);
  const graph = buildPageAssetGraph(html, url);

  const { getActiveSiteSlug } = await import("../../app/api/wp/config");
  const siteSlug = getActiveSiteSlug();
  if (siteSlug) {
    if (route.postId && !graph.elementorDocumentIds.includes(route.postId)) {
      graph.elementorDocumentIds.push(route.postId);
    }
    await mirrorPageAssetGraph(graph, siteSlug);
  }

  const rawHtml =
    useFullBody || extracted.isElementor
      ? extracted.bodyHtml
      : extracted.contentHtml;

  const { getWpUrl } = await import("../../app/api/wp/config");
  const rewritten = rewriteMigratedHtml(rawHtml, getWpUrl());
  const { html: shellHtml, assets } = transformHtmlForNext(rewritten);

  const key = routeToPageKey(route.path);
  await fs.writeFile(path.join(pagesDir(), `${key}.html`), shellHtml, "utf8");
  if (assets.scripts.length || assets.styles.length) {
    await fs.writeFile(
      path.join(pagesDir(), `${key}.assets.json`),
      JSON.stringify(assets, null, 2),
      "utf8",
    );
  }

  return {
    key,
    pageBuilder: extracted.builder,
    isElementor: extracted.isElementor,
  };
}

/** Crawl homepage only — used for fast landing preview. */
export async function crawlHomePage(
  homeRoute: WpRoute,
  styles: StylesManifest,
): Promise<{ styles: StylesManifest }> {
  await fs.mkdir(pagesDir(), { recursive: true });
  const registry = getCssRegistry();
  const result = await crawlRoute(homeRoute, registry, true);
  console.log(
    `  ✓ shell ${homeRoute.path} [${result.pageBuilder}] → pages/${result.key}.html`,
  );
  const updatedStyles: StylesManifest = {
    ...styles,
    pageBuilder: result.isElementor ? "elementor" : styles.pageBuilder,
    elementorPageCount: result.isElementor ? 1 : 0,
    stylesheets: [...new Set([...styles.stylesheets, ...registry.values()])],
  };
  await fs.writeFile(
    path.join(getMigratedDataDir(), "styles.json"),
    JSON.stringify(updatedStyles, null, 2),
    "utf8",
  );
  persistCssRegistry();
  persistFontRegistry();
  return { styles: updatedStyles };
}

export async function fetchElementorPages(
  manifest: MigrationManifest,
  styles: StylesManifest,
): Promise<{ styles: StylesManifest; routes: WpRoute[] }> {
  const builder = manifest.pageBuilder ?? (await detectSitePageBuilder());
  const fullSite = migrateFullSite();

  const routesToCrawl = manifest.routes.filter((r) => {
    if (fullSite) return true;
    if (r.renderMode === "shell") return true;
    if (isVisualPageBuilder(builder)) return true;
    if (builder === "gutenberg") return true;
    return r.isElementor === true;
  });

  if (!routesToCrawl.length) {
    console.log("  (No shell routes — skipping rendered HTML crawl)");
    return { styles, routes: manifest.routes };
  }

  console.log(
    fullSite
      ? `  Full-site crawl: ${routesToCrawl.length} URL(s)…`
      : builder === "elementor"
        ? "  Elementor site — crawling rendered HTML + post CSS…"
        : `  Crawling ${routesToCrawl.length} shell route(s)…`,
  );

  await fs.mkdir(pagesDir(), { recursive: true });

  const registry = getCssRegistry();
  let elementorCount = 0;
  const routeByPath = new Map(manifest.routes.map((r) => [r.path, { ...r }]));
  const slug = process.env.SITE_SLUG;
  const total = routesToCrawl.length;
  let completed = 0;

  if (slug && total > 0) {
    setMigrationProgress(slug, `Crawling ${total} page(s)`, {
      done: 0,
      total,
    });
  }

  const crawlOne = async (route: WpRoute): Promise<boolean> => {
    const useFullBody = useFullBodyForCrawl(builder, route);
    const result = await crawlRoute(route, registry, useFullBody);
    const updated = routeByPath.get(route.path);
    if (updated) {
      updated.pageBuilder = result.pageBuilder as PageBuilder;
      updated.renderMode = "shell";
      updated.isElementor = result.isElementor;
    }
    completed += 1;
    if (slug) {
      setMigrationProgress(slug, `Crawling pages (${completed}/${total})`, {
        done: completed,
        total,
      });
    }
    console.log(`  ✓ shell ${route.path} [${result.pageBuilder}] → pages/${result.key}.html (${completed}/${total})`);
    return result.isElementor;
  };

  const delayMs = crawlDelayMs();
  const concurrency = Number(process.env.MIGRATE_CRAWL_CONCURRENCY ?? "6");

  if (concurrency <= 1) {
    for (let index = 0; index < routesToCrawl.length; index++) {
      const route = routesToCrawl[index];
      if (index > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      try {
        if (await crawlOne(route)) elementorCount += 1;
      } catch (err) {
        console.warn(`  ⚠ crawl failed ${route.path}:`, err);
      }
    }
  } else {
    const results = await mapPool(routesToCrawl, concurrency, async (route) => {
      try {
        return await crawlOne(route);
      } catch (err) {
        console.warn(`  ⚠ crawl failed ${route.path}:`, err);
        return false;
      }
    });
    elementorCount = results.filter(Boolean).length;
  }

  const updatedStyles: StylesManifest = {
    ...styles,
    pageBuilder: builder === "elementor" ? "elementor" : styles.pageBuilder,
    elementorPageCount: elementorCount,
    stylesheets: [...new Set([...styles.stylesheets, ...registry.values()])],
  };

  await fs.writeFile(
    path.join(getMigratedDataDir(), "styles.json"),
    JSON.stringify(updatedStyles, null, 2),
    "utf8",
  );
  persistCssRegistry();
  persistJsRegistry();
  persistFontRegistry();

  return { styles: updatedStyles, routes: [...routeByPath.values()] };
}

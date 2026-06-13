import fs from "node:fs";
import path from "node:path";
import type {
  PuckConversionMeta,
  PuckPageData,
  PuckSiteDatabase,
} from "../../../app/puck/wp-migration-types";
import { getMigratedDataDir } from "../../../app/api/wp/config";
import { extractPageShellBody } from "../../../app/api/wp/page-shell";
import type { MigrationManifest } from "../../../app/api/wp/types";
import { pageKeyToRoute, routeToPageKey } from "./page-key";

function puckDir(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "puck");
}

function pagesDir(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "pages");
}

function resolveTitle(
  routePath: string,
  manifest: MigrationManifest | null,
): string {
  const route = manifest?.routes.find((r) => r.path === routePath);
  if (route?.type === "home") {
    return manifest?.site?.name ?? "Home";
  }

  const slug = routePath.replace(/^\//, "").split("/").pop() ?? "";
  const page = manifest?.pages.find((p) => p.slug === slug);
  if (page?.title?.rendered) {
    return page.title.rendered.replace(/<[^>]+>/g, "").trim();
  }

  if (slug) {
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return routePath === "/" ? "Home" : routePath;
}

/** One migrated HTML shell → one Puck page (WpHtmlShell component). */
export function pageShellToPuckData(
  siteSlug: string,
  routePath: string,
  title: string,
): PuckPageData {
  const pageKey = routeToPageKey(routePath);
  return {
    root: {
      props: {
        id: `root-${pageKey}`,
        title,
      },
    },
    content: [
      {
        type: "WpHtmlShell",
        props: {
          id: `WpHtmlShell-${pageKey}`,
          siteSlug,
          pageKey,
          routePath,
        },
      },
    ],
  };
}

function listMigratedPageKeys(siteSlug: string): string[] {
  const dir = pagesDir(siteSlug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/, ""));
}

function loadManifest(siteSlug: string): MigrationManifest | null {
  const file = path.join(getMigratedDataDir(siteSlug), "manifest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as MigrationManifest;
}

/**
 * Convert all sites/{slug}/data/pages/*.html → sites/{slug}/data/puck/database.json
 */
export function convertSiteToPuck(siteSlug: string): {
  database: PuckSiteDatabase;
  meta: PuckConversionMeta;
} {
  const manifest = loadManifest(siteSlug);
  const pageKeys = listMigratedPageKeys(siteSlug);

  if (!pageKeys.length) {
    throw new Error(`No pages/*.html found for site "${siteSlug}"`);
  }

  const database: PuckSiteDatabase = {};
  const routes: string[] = [];

  for (const pageKey of pageKeys.sort()) {
    const routePath = pageKeyToRoute(pageKey);
    const htmlPath = path.join(pagesDir(siteSlug), `${pageKey}.html`);
    const raw = fs.readFileSync(htmlPath, "utf8");
    const body = extractPageShellBody(raw);
    if (!body.trim()) {
      console.warn(`  ⚠ skip empty page: ${pageKey}`);
      continue;
    }

    const title = resolveTitle(routePath, manifest);
    database[routePath] = pageShellToPuckData(siteSlug, routePath, title);
    routes.push(routePath);
  }

  const meta: PuckConversionMeta = {
    convertedAt: new Date().toISOString(),
    siteSlug,
    wordpressUrl: manifest?.wordpressUrl ?? "",
    pageBuilder: manifest?.pageBuilder,
    pageCount: routes.length,
    routes,
    strategy: "wp-html-shell",
    notes: [
      "Phase 1: each route is a single WpHtmlShell Puck component pointing at pages/{key}.html",
      "Phase 2: map Elementor widgets → native Puck components (Heading, Image, Grid, …)",
      "Assets (CSS/JS) stay in public/sites/{slug}/ and plugin-assets.json",
    ],
  };

  return { database, meta };
}

export function savePuckDatabase(
  siteSlug: string,
  database: PuckSiteDatabase,
  meta: PuckConversionMeta,
): void {
  const dir = puckDir(siteSlug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "database.json"),
    JSON.stringify(database, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

export function loadPuckDatabase(siteSlug: string): PuckSiteDatabase | null {
  const file = path.join(puckDir(siteSlug), "database.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PuckSiteDatabase;
}

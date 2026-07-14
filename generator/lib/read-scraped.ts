import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir, getMigratedPublicDir } from "../../lib/wp/config";
import { extractPageShellBody } from "../../lib/wp/page-shell";
import type { MigrationManifest } from "../../lib/wp/types";

export interface ScrapedPage {
  key: string;
  route: string;
  title: string;
  html: string;
  bodyHtml: string;
  postId?: number;
  pageBuilder?: string;
}

export interface ScrapedSite {
  slug: string;
  manifest: MigrationManifest | null;
  pages: ScrapedPage[];
  assetsSourceDir: string;
}

export function readScrapedSite(slug: string): ScrapedSite {
  const dataDir = getMigratedDataDir(slug);
  const pagesDir = path.join(dataDir, "pages");

  if (!fs.existsSync(pagesDir)) {
    throw new Error(`No scraped data for "${slug}". Run: pnpm scrape -- --url <url> --site ${slug}`);
  }

  let manifest: MigrationManifest | null = null;
  const manifestPath = path.join(dataDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MigrationManifest;
  }

  const routeByKey = new Map<string, string>();
  if (manifest?.routes) {
    for (const route of manifest.routes) {
      const key = route.path === "/" ? "home" : route.path.replace(/^\//, "").replace(/\//g, "__");
      routeByKey.set(key, route.path);
    }
  }

  const pages: ScrapedPage[] = [];
  for (const file of fs.readdirSync(pagesDir)) {
    if (!file.endsWith(".html")) continue;
    const key = file.replace(/\.html$/, "");
    const html = fs.readFileSync(path.join(pagesDir, file), "utf8");
    const route = routeByKey.get(key) ?? (key === "home" ? "/" : `/${key.replace(/__/g, "/")}`);

    let postId: number | undefined;
    let pageBuilder: string | undefined;
    const metaPath = path.join(pagesDir, `${key}.meta.json`);
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
        postId?: number;
        pageBuilder?: string;
      };
      postId = meta.postId;
      pageBuilder = meta.pageBuilder;
    }

    pages.push({
      key,
      route,
      title: key === "home" ? "Home" : key.replace(/__/g, " / "),
      html,
      bodyHtml: extractPageShellBody(html),
      postId,
      pageBuilder,
    });
  }

  pages.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));

  const deduped = dedupePages(pages);

  return {
    slug,
    manifest,
    pages: deduped,
    assetsSourceDir: getMigratedPublicDir(slug),
  };
}

/** Skip alias files (e.g. homepage.html) when they duplicate home.html content. */
function dedupePages(pages: ScrapedPage[]): ScrapedPage[] {
  const byRoute = new Map<string, ScrapedPage>();
  for (const page of pages) {
    const existing = byRoute.get(page.route);
    if (!existing) {
      byRoute.set(page.route, page);
      continue;
    }
    if (page.key === "home" || (existing.key !== "home" && page.key.length < existing.key.length)) {
      byRoute.set(page.route, page);
    }
  }

  const home = byRoute.get("/");
  if (home) {
    for (const [route, page] of [...byRoute.entries()]) {
      if (route === "/") continue;
      if (page.bodyHtml === home.bodyHtml) byRoute.delete(route);
    }
  }

  return [...byRoute.values()].sort((a, b) =>
    a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route),
  );
}

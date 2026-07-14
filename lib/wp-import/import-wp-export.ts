import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir, getMigratedPublicDir } from "../wp/config";
import { upsertSite } from "../wp/sites";
import type { WpRoute } from "../wp/types";
import { detectWpLayout, type WpImportLayout } from "./unpack-zip";
import { parseWpConfig } from "./parse-wp-config";
import { extractPagesFromSql, extractSiteUrlFromSql } from "./parse-wp-sql";
import {
  extractPostMetaFromSql,
  resolveElementorHtml,
} from "./elementor-sql-html";

export interface WpExportImportResult {
  pageCount: number;
  siteUrl: string;
  hasSql: boolean;
  hasWpContent: boolean;
  hasWpConfig: boolean;
}

function routeForPageSlug(slug: string): string {
  if (slug === "home" || slug === "index" || slug === "homepage" || slug === "front-page") {
    return "/";
  }
  return `/${slug}`;
}

function routeToPageKey(routePath: string): string {
  if (routePath === "/") return "home";
  return routePath.replace(/^\//, "").replace(/\//g, "__");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function collectHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "wp-content") {
      out.push(...collectHtmlFiles(full));
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

/** Import WordPress export: SQL dump + wp-content + wp-config.php */
export async function importWpExport(opts: {
  importDir: string;
  siteSlug: string;
  name?: string;
}): Promise<WpExportImportResult> {
  const layout = detectWpLayout(opts.importDir);

  if (!layout.sqlFile && !layout.wpContent && !layout.wpConfig) {
    throw new Error(
      "ZIP must contain at least one of: .sql database dump, wp-content/ folder, wp-config.php",
    );
  }

  const dataDir = getMigratedDataDir(opts.siteSlug);
  const pagesDir = path.join(dataDir, "pages");
  const publicDir = getMigratedPublicDir(opts.siteSlug);
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  let tablePrefix = "wp_";
  let configSiteUrl: string | undefined;

  if (layout.wpConfig) {
    const config = parseWpConfig(layout.wpConfig);
    tablePrefix = config.tablePrefix;
    configSiteUrl = config.siteUrl ?? config.homeUrl;
    fs.copyFileSync(layout.wpConfig, path.join(dataDir, "wp-config.php"));
  }

  if (layout.wpContent) {
    const dest = path.join(publicDir, "wp-content");
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(layout.wpContent, dest);
  }

  if (layout.sqlFile) {
    fs.copyFileSync(layout.sqlFile, path.join(dataDir, "database.sql"));
  }

  const sqlSiteUrl = layout.sqlFile
    ? extractSiteUrlFromSql(layout.sqlFile, tablePrefix)
    : undefined;
  const siteUrl = configSiteUrl ?? sqlSiteUrl ?? `file://${opts.importDir}`;

  const routes: WpRoute[] = [];
  let pageCount = 0;
  let pageBuilder: "classic" | "elementor" = "classic";

  if (layout.sqlFile) {
    const sqlPages = extractPagesFromSql(layout.sqlFile, tablePrefix);
    const postMeta = extractPostMetaFromSql(layout.sqlFile, tablePrefix);

    for (const page of sqlPages) {
      const { html, isElementor } = resolveElementorHtml(
        page.postId,
        page.html,
        postMeta.byPost.get(page.postId),
      );
      if (isElementor) pageBuilder = "elementor";

      const route = routeForPageSlug(page.slug);
      const key = routeToPageKey(route);
      fs.writeFileSync(
        path.join(pagesDir, `${key}.html`),
        wrapWpHtml(html, siteUrl),
        "utf8",
      );
      if (isElementor && page.postId) {
        fs.writeFileSync(
          path.join(pagesDir, `${key}.meta.json`),
          JSON.stringify({ postId: page.postId, pageBuilder: "elementor" }, null, 2),
          "utf8",
        );
      }
      routes.push({
        path: route,
        wpLink: route,
        type: "page",
        slug: page.slug,
        postId: page.postId,
      });
      pageCount++;
    }
  }

  if (pageCount === 0) {
    const htmlFiles = collectHtmlFiles(opts.importDir);
    for (const file of htmlFiles) {
      const rel = path.relative(opts.importDir, file);
      const base = path.basename(file, path.extname(file));
      const route = base === "index" || base === "home" ? "/" : `/${base}`;
      const key = routeToPageKey(route);
      fs.writeFileSync(path.join(pagesDir, `${key}.html`), fs.readFileSync(file, "utf8"), "utf8");
      routes.push({ path: route, wpLink: route, type: "page", slug: key });
      pageCount++;
    }
  }

  if (pageCount === 0) {
    const stub = buildStubHomePage(siteUrl, layout);
    fs.writeFileSync(path.join(pagesDir, "home.html"), stub, "utf8");
    routes.push({ path: "/", wpLink: "/", type: "page", slug: "home" });
    pageCount = 1;
  }

  const manifest = {
    version: 1 as const,
    migratedAt: new Date().toISOString(),
    wordpressUrl: siteUrl,
    restBase: "",
    pageBuilder,
    site: {
      name: opts.name ?? opts.siteSlug,
      description: "",
      url: siteUrl,
      home: siteUrl,
      gmt_offset: 0,
      timezone_string: "",
    },
    routes,
    pages: [],
    posts: [],
    media: [],
    styles: {
      fetchedAt: new Date().toISOString(),
      sourceUrl: siteUrl,
      pageBuilder,
      bodyClasses: [],
      inlineStyles: [],
      stylesheets: [],
      scripts: [],
    },
    wpImport: {
      hasSql: Boolean(layout.sqlFile),
      hasWpContent: Boolean(layout.wpContent),
      hasWpConfig: Boolean(layout.wpConfig),
      sqlFile: layout.sqlFile ? path.basename(layout.sqlFile) : undefined,
    },
  };

  fs.writeFileSync(path.join(dataDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  upsertSite({
    slug: opts.siteSlug,
    url: siteUrl,
    name: opts.name ?? opts.siteSlug,
    status: "ready",
    stage: "full",
    routes: routes.length,
  });

  return {
    pageCount,
    siteUrl,
    hasSql: Boolean(layout.sqlFile),
    hasWpContent: Boolean(layout.wpContent),
    hasWpConfig: Boolean(layout.wpConfig),
  };
}

function wrapWpHtml(content: string, siteUrl: string): string {
  if (/^\s*<(!DOCTYPE|html)/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${siteUrl}/"></head><body>${content}</body></html>`;
}

function buildStubHomePage(siteUrl: string, layout: WpImportLayout): string {
  const items = [
    layout.sqlFile ? `<li>Database: ${path.basename(layout.sqlFile)}</li>` : "",
    layout.wpContent ? "<li>wp-content/ copied to public assets</li>" : "",
    layout.wpConfig ? "<li>wp-config.php stored</li>" : "",
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Imported WordPress Site</title></head>
<body>
  <h1>WordPress import ready</h1>
  <p>Source: ${siteUrl}</p>
  <ul>${items.join("")}</ul>
  <p>Edit this page in GrapeJS or re-import with a SQL dump that includes page content.</p>
</body></html>`;
}

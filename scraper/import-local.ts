import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir, getMigratedPublicDir } from "../lib/wp/config";
import { upsertSite } from "../lib/wp/sites";
import type { WpRoute } from "../lib/wp/types";
import { getImportSourceDir, getWpImportStatus } from "../lib/wp-import/store-parts";
import { importWpExport } from "../lib/wp-import/import-wp-export";

export interface ImportLocalOptions {
  importPath: string;
  siteSlug: string;
  /** Display name for registry */
  name?: string;
}

function routeFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  if (base === "index" || base === "home") return "/";
  return `/${base.replace(/__/g, "/")}`;
}

function routeToPageKey(routePath: string): string {
  if (routePath === "/") return "home";
  return routePath.replace(/^\//, "").replace(/\//g, "__");
}

/** Copy local HTML or WordPress export (SQL + wp-content + wp-config) into sites/{slug}/. */
export async function importLocalSource(opts: ImportLocalOptions): Promise<void> {
  const abs = path.resolve(opts.importPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Import path not found: ${abs}`);
  }

  const wpStatus = getWpImportStatus(abs);
  if (wpStatus.hasSql || wpStatus.hasWpContent || wpStatus.hasWpConfig) {
    if (!wpStatus.readyToImport) {
      throw new Error(
        `WordPress import incomplete. Still needed: ${wpStatus.missing.join(", ")}. ` +
          "Upload database.sql, wp-content as .zip, and wp-config.php separately.",
      );
    }
    const sourceDir = getImportSourceDir(abs);
    const result = await importWpExport({
      importDir: sourceDir,
      siteSlug: opts.siteSlug,
      name: opts.name,
    });
    console.log(`\n✅ WordPress import → sites/${opts.siteSlug}/`);
    console.log(`   Pages: ${result.pageCount} | SQL: ${result.hasSql} | wp-content: ${result.hasWpContent} | wp-config: ${result.hasWpConfig}\n`);
    return;
  }

  const dataDir = getMigratedDataDir(opts.siteSlug);
  const pagesDir = path.join(dataDir, "pages");
  const publicDir = getMigratedPublicDir(opts.siteSlug);
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const routes: WpRoute[] = [];
  const stat = fs.statSync(abs);

  if (stat.isFile()) {
    const html = fs.readFileSync(abs, "utf8");
    const route = "/";
    const key = routeToPageKey(route);
    fs.writeFileSync(path.join(pagesDir, `${key}.html`), html, "utf8");
    routes.push({
      path: route,
      wpLink: route,
      type: "page",
      slug: "home",
    });
  } else {
    const htmlFiles = collectHtmlFiles(abs);
    if (htmlFiles.length === 0) {
      throw new Error(
        "No WordPress export found. Upload separately: (1) database .sql file, (2) wp-content as .zip, (3) wp-config.php — then click Start import.",
      );
    }
    for (const file of htmlFiles) {
      const rel = path.relative(abs, file);
      const route = routeFromFilename(rel);
      const key = routeToPageKey(route);
      const html = fs.readFileSync(file, "utf8");
      fs.writeFileSync(path.join(pagesDir, `${key}.html`), html, "utf8");
      routes.push({
        path: route,
        wpLink: route,
        type: "page",
        slug: key,
      });
    }

    const assetsDir = path.join(abs, "assets");
    if (fs.existsSync(assetsDir)) {
      copyDir(assetsDir, publicDir);
    }
  }

  const sourceUrl = `file://${abs}`;
  const manifest = {
    version: 1 as const,
    migratedAt: new Date().toISOString(),
    wordpressUrl: sourceUrl,
    restBase: "",
    pageBuilder: "classic" as const,
    site: {
      name: opts.name ?? opts.siteSlug,
      description: "",
      url: sourceUrl,
      home: sourceUrl,
      gmt_offset: 0,
      timezone_string: "",
    },
    routes,
    pages: [],
    posts: [],
    media: [],
    styles: {
      fetchedAt: new Date().toISOString(),
      sourceUrl,
      pageBuilder: "classic" as const,
      bodyClasses: [],
      inlineStyles: [],
      stylesheets: [],
      scripts: [],
    },
  };

  fs.writeFileSync(
    path.join(dataDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  upsertSite({
    slug: opts.siteSlug,
    url: sourceUrl,
    name: opts.name ?? opts.siteSlug,
    status: "ready",
    stage: "full",
    routes: routes.length,
  });

  console.log(`\n✅ Imported ${routes.length} page(s) → sites/${opts.siteSlug}/`);
  console.log(`   Run: pnpm generate -- --site ${opts.siteSlug}\n`);
}

function collectHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "assets") {
      out.push(...collectHtmlFiles(full));
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out.sort();
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

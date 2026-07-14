import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir, getMigratedPublicDir } from "../wp/config";
import { upsertSite } from "../wp/sites";
import type {
  MigrationManifest,
  PageBuilder,
  PluginExportBundleLayout,
  WpMedia,
  WpRoute,
} from "../wp/types";
import {
  cleanupBundle,
  readPluginExportBundle,
  type PluginExportBundle,
} from "./plugin-export/read-bundle";

export interface PluginImportResult {
  siteSlug: string;
  siteUrl: string;
  pageCount: number;
  templateCount: number;
  menuCount: number;
  mediaCount: number;
  unresolvedShortcodes: number;
  assetsCopied: boolean;
  warnings: string[];
}

function routeKey(routePath: string): string {
  if (routePath === "/") return "home";
  return routePath
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "__")
    .replace(/[^\w-]+/g, "-") || "page";
}

function wrapDocument(inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${inner}</body></html>`;
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

function toPageBuilder(value: string | undefined): PageBuilder {
  const known: PageBuilder[] = [
    "elementor",
    "gutenberg",
    "classic",
    "divi",
    "wpbakery",
    "beaver",
    "brizy",
    "oxygen",
    "unknown",
  ];
  return known.includes(value as PageBuilder) ? (value as PageBuilder) : "unknown";
}

/**
 * Import a wp-grape-export bundle (folder or .zip) into sites/{slug}/data/.
 *
 * Produces:
 *  - Canonical v2 files: layout.json, templates/, assets/manifest.json,
 *    media/map.json, audit/report.json, pages/{key}/rendered.html + meta.json
 *  - v1-compatible manifest.json + composed pages/{key}.html so the existing
 *    generator/preview keeps working until generator v2 lands.
 */
export async function importPluginExport(opts: {
  source: string;
  siteSlug: string;
  name?: string;
}): Promise<PluginImportResult> {
  const bundle = readPluginExportBundle(opts.source);
  try {
    return landBundle(bundle, opts);
  } finally {
    cleanupBundle(bundle);
  }
}

function landBundle(
  bundle: PluginExportBundle,
  opts: { source: string; siteSlug: string; name?: string },
): PluginImportResult {
  const { manifest, routes, layout, templates, assets, media, audit } = bundle;
  const slug = opts.siteSlug;

  const dataDir = getMigratedDataDir(slug);
  const pagesDir = path.join(dataDir, "pages");
  const publicDir = getMigratedPublicDir(slug);
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const warnings = [...(audit.warnings ?? [])];

  // 1. Copy bundle CSS/JS (wp-content + inline) and optional uploads into the public dir.
  let assetsCopied = false;
  let cssJsCopied = false;

  const bundleWpContent = path.join(bundle.root, "assets", "wp-content");
  if (fs.existsSync(bundleWpContent)) {
    const dest = path.join(publicDir, "wp-content");
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(bundleWpContent, dest);
    assetsCopied = true;
    cssJsCopied = true;
  }

  const bundleInline = path.join(bundle.root, "assets", "inline");
  if (fs.existsSync(bundleInline)) {
    const dest = path.join(publicDir, "inline");
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(bundleInline, dest);
    assetsCopied = true;
    cssJsCopied = true;
  }

  if (!cssJsCopied) {
    warnings.push(
      "Export bundle contained no copied CSS/JS files. Re-export from WordPress with the updated wp-grape-export plugin.",
    );
  }

  const uploadsInBundle = path.join(bundleWpContent, "uploads");
  if (!fs.existsSync(uploadsInBundle)) {
    warnings.push(
      "Uploaded media files were not included in the export. Re-run the export with 'Include media files' checked for a self-contained preview.",
    );
  }

  // 2. Resolve + persist the shared layout (header/footer HTML inlined) + menus.
  const resolvedLayout: PluginExportBundleLayout = {
    header: layout.header
      ? {
          ...layout.header,
          html: layout.header.htmlFile ? bundle.readText(layout.header.htmlFile) : "",
        }
      : null,
    footer: layout.footer
      ? {
          ...layout.footer,
          html: layout.footer.htmlFile ? bundle.readText(layout.footer.htmlFile) : "",
        }
      : null,
    menus: layout.menus ?? [],
  };
  fs.writeFileSync(path.join(dataDir, "layout.json"), JSON.stringify(resolvedLayout, null, 2), "utf8");

  // 3. Copy the structured template + asset + media + audit files verbatim.
  copyBundleSection(bundle, "templates", dataDir);
  writeJson(path.join(dataDir, "assets", "manifest.json"), assets);
  writeJson(path.join(dataDir, "media", "map.json"), media);
  writeJson(path.join(dataDir, "audit", "report.json"), { ...audit, warnings });

  // 4. Per-page: copy structured files + compose a v1-compatible full page.
  const headerHtml = resolvedLayout.header?.html ?? "";
  const footerHtml = resolvedLayout.footer?.html ?? "";
  const wpRoutes: WpRoute[] = [];
  let pageCount = 0;
  let sitePageBuilder = toPageBuilder(manifest.site.pageBuilder);

  for (const route of routes) {
    const dir = route.dir ?? `pages/${routeKey(route.path)}`;
    const meta = bundle.readPageMeta(dir);
    const renderedRel = meta?.renderedFile ?? `${dir}/rendered.html`;
    const content = bundle.readText(renderedRel);

    const key = routeKey(route.path);

    // Canonical v2: keep the content slot + meta under pages/{key}/.
    if (content) {
      writeText(path.join(dataDir, "pages", key, "rendered.html"), content);
    }
    if (meta) {
      writeJson(path.join(dataDir, "pages", key, "meta.json"), meta);
    }

    // Carry the raw builder payload (Elementor JSON / Gutenberg block tree) if present.
    if (meta?.rawFile) {
      const rawContent = bundle.readText(meta.rawFile);
      if (rawContent) {
        writeText(path.join(dataDir, "pages", key, path.basename(meta.rawFile)), rawContent);
      }
    }

    // v1-compatible: full composed page for the current generator/preview.
    const composed = wrapDocument(`${headerHtml}\n${content}\n${footerHtml}`);
    writeText(path.join(pagesDir, `${key}.html`), composed);

    const builder = toPageBuilder(route.pageBuilder ?? manifest.site.pageBuilder);
    if (builder === "elementor") sitePageBuilder = "elementor";

    writeJson(path.join(pagesDir, `${key}.meta.json`), {
      postId: route.id,
      pageBuilder: builder,
      slots: meta?.slots ?? {},
    });

    const type: WpRoute["type"] =
      route.type === "home" ? "home" : route.type === "post" ? "post" : "page";
    wpRoutes.push({
      path: route.path,
      wpLink: route.path,
      type,
      postId: route.id,
      slug: route.slug,
      isElementor: builder === "elementor",
      pageBuilder: builder,
      renderMode: "shell",
    });
    pageCount++;
  }

  // 5. Backward-compatible v1 manifest so read-scraped + Studio keep working.
  const stylesheets = (assets.stylesheets ?? [])
    .map((s) => s.src)
    .filter((src): src is string => Boolean(src));

  const wpMedia: WpMedia[] = (media ?? []).map((m) => ({
    id: m.id,
    slug: "",
    source_url: m.url,
    alt_text: m.alt ?? "",
    media_type: (m.mime ?? "").startsWith("image/") ? "image" : "file",
    mime_type: m.mime ?? "",
    title: { rendered: "" },
  }));

  const migrationManifest: MigrationManifest = {
    version: 1,
    migratedAt: new Date().toISOString(),
    wordpressUrl: manifest.site.url,
    restBase: "",
    pageBuilder: sitePageBuilder,
    site: {
      name: opts.name ?? manifest.site.name ?? slug,
      description: manifest.site.description ?? "",
      url: manifest.site.url,
      home: manifest.site.home,
      gmt_offset: 0,
      timezone_string: manifest.site.timezone ?? "",
    },
    routes: wpRoutes,
    posts: [],
    pages: [],
    media: wpMedia,
    styles: {
      fetchedAt: new Date().toISOString(),
      sourceUrl: manifest.site.url,
      pageBuilder: sitePageBuilder,
      stylesheets,
      inlineStyles: [],
      bodyClasses: [],
      htmlClasses: [],
    },
    pluginExport: {
      schemaVersion: manifest.version,
      generator: manifest.generator,
      exportedAt: manifest.exportedAt,
      hasLayout: Boolean(resolvedLayout.header || resolvedLayout.footer),
      menuCount: resolvedLayout.menus.length,
      templateCount: templates.length,
      unresolvedShortcodeCount: (audit.unresolvedShortcodes ?? []).length,
    },
  };

  fs.writeFileSync(
    path.join(dataDir, "manifest.json"),
    JSON.stringify(migrationManifest, null, 2),
    "utf8",
  );

  upsertSite({
    slug,
    url: manifest.site.url,
    name: opts.name ?? manifest.site.name ?? slug,
    status: "ready",
    stage: "full",
    routes: wpRoutes.length,
    pageBuilder: sitePageBuilder,
  });

  return {
    siteSlug: slug,
    siteUrl: manifest.site.url,
    pageCount,
    templateCount: templates.length,
    menuCount: resolvedLayout.menus.length,
    mediaCount: wpMedia.length,
    unresolvedShortcodes: (audit.unresolvedShortcodes ?? []).length,
    assetsCopied,
    warnings,
  };
}

function copyBundleSection(bundle: PluginExportBundle, section: string, dataDir: string): void {
  const src = path.join(bundle.root, section);
  if (!fs.existsSync(src)) return;
  copyDir(src, path.join(dataDir, section));
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function writeText(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

import fs from "node:fs/promises";
import path from "node:path";
import {
  getMigratedDataDir,
  getMigratedPublicDir,
  getMigratedPublicUrlPrefix,
  WP_URL,
} from "../../app/api/wp/config";
import { wpHttpFetch } from "../../app/api/wp/http";
import type { StylesManifest } from "../../app/api/wp/types";
import { detectSitePageBuilder } from "./detect-builder";
import {
  downloadStylesheet,
  getCssRegistry,
  persistCssRegistry,
} from "./lib/css-download";
import { extractPageFromHtml } from "./lib/html-extract";
import { routeToPageKey } from "./lib/page-key";

const inlinePath = () =>
  path.join(getMigratedPublicDir(), "inline-styles.css");
const pagesDir = () => path.join(getMigratedDataDir(), "pages");

export async function fetchStyles(pageUrl = WP_URL): Promise<StylesManifest> {
  const res = await wpHttpFetch(pageUrl);
  if (!res.ok) throw new Error(`Cannot fetch ${pageUrl}: ${res.status}`);
  const html = await res.text();
  const extracted = extractPageFromHtml(html, pageUrl);
  const pageBuilder = await detectSitePageBuilder(pageUrl);

  const registry = getCssRegistry();
  const stylesheets: string[] = [];

  for (const sheetUrl of extracted.stylesheetUrls) {
    const saved = await downloadStylesheet(sheetUrl, registry);
    if (saved && !saved.cached) {
      stylesheets.push(saved.path);
      console.log(`  ✓ CSS ${saved.path}`);
    } else if (saved) {
      stylesheets.push(saved.path);
    }
  }

  const inlineStyles: string[] = [];
  if (extracted.inlineStyleBlocks.length) {
    await fs.mkdir(getMigratedPublicDir(), { recursive: true });
    await fs.writeFile(
      inlinePath(),
      extracted.inlineStyleBlocks.join("\n\n"),
      "utf8",
    );
    inlineStyles.push(`${getMigratedPublicUrlPrefix()}/inline-styles.css`);
  }

  await fs.mkdir(pagesDir(), { recursive: true });
  await fs.mkdir(getMigratedDataDir(), { recursive: true });

  const homeHtml =
    pageBuilder === "elementor" ? extracted.bodyHtml : extracted.bodyHtml;
  await fs.writeFile(
    path.join(pagesDir(), `${routeToPageKey("/")}.html`),
    homeHtml,
    "utf8",
  );

  // Back-compat for older home-shell path
  await fs.writeFile(
    path.join(getMigratedDataDir(), "home-shell.html"),
    homeHtml,
    "utf8",
  );

  let themeJsonPath: string | undefined;
  try {
    const fallback = await wpHttpFetch(
      `${WP_URL}/index.php?rest_route=${encodeURIComponent("/wp/v2/global-styles/themes")}`,
    );
    if (fallback.ok) {
      const themes = (await fallback.json()) as { theme_json?: unknown }[];
      if (themes[0]?.theme_json) {
        themeJsonPath = `${getMigratedPublicUrlPrefix()}/theme.json`;
        await fs.writeFile(
          path.join(getMigratedPublicDir(), "theme.json"),
          JSON.stringify(themes[0].theme_json, null, 2),
          "utf8",
        );
      }
    }
  } catch {
    /* optional */
  }

  let previous: StylesManifest | null = null;
  const stylesPath = path.join(getMigratedDataDir(), "styles.json");
  try {
    previous = JSON.parse(await fs.readFile(stylesPath, "utf8")) as StylesManifest;
  } catch {
    /* first run */
  }

  const manifest: StylesManifest = {
    fetchedAt: new Date().toISOString(),
    sourceUrl: pageUrl,
    pageBuilder,
    stylesheets: [
      ...new Set([
        ...(previous?.stylesheets ?? []),
        ...stylesheets,
        ...registry.values(),
      ]),
    ],
    inlineStyles: [
      ...new Set([...(previous?.inlineStyles ?? []), ...inlineStyles]),
    ],
    bodyClasses: extracted.bodyClasses,
    htmlClasses: extracted.htmlClasses,
    themeJsonPath,
  };

  await fs.writeFile(stylesPath, JSON.stringify(manifest, null, 2), "utf8");
  persistCssRegistry();

  return manifest;
}

import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir, WP_URL } from "../../app/api/wp/config";
import type { MigrationManifest, WpRoute } from "../../app/api/wp/types";
import { setMigrationPhase } from "../../app/api/wp/migration-status";
import { upsertSite } from "../../app/api/wp/sites";
import { detectSitePageBuilder } from "./detect-builder";
import { crawlHomePage } from "./fetch-elementor";
import { fetchStyles } from "./fetch-styles";

/** Fast path: styles + homepage HTML only (preview workspace). */
export async function runLandingMigration(slug: string): Promise<void> {
  setMigrationPhase(slug, "Fetching homepage styles");
  const styles = await fetchStyles(WP_URL);
  console.log(
    `   ${styles.stylesheets.length} stylesheets, ${styles.inlineStyles.length} inline bundles\n`,
  );

  setMigrationPhase(slug, "Crawling homepage");
  const pageBuilder = await detectSitePageBuilder(WP_URL);
  const homeRoute: WpRoute = {
    path: "/",
    wpLink: `${WP_URL}/`,
    type: "home",
    renderMode: "shell",
    pageBuilder,
    isElementor: pageBuilder === "elementor",
  };

  const { styles: updatedStyles } = await crawlHomePage(homeRoute, styles);

  if (pageBuilder === "elementor") {
    setMigrationPhase(slug, "Running Elementor asset pipeline");
    const { runBuilderPipeline } = await import("./builders");
    await runBuilderPipeline(WP_URL);
    const { fetchElementorAssets } = await import("./fetch-elementor-assets");
    await fetchElementorAssets(`${WP_URL.replace(/\/$/, "")}/`);
  }

  const manifest: MigrationManifest = {
    version: 1,
    migratedAt: new Date().toISOString(),
    wordpressUrl: WP_URL,
    restBase: `${WP_URL}/wp-json`,
    pageBuilder,
    site: {
      name: new URL(WP_URL).hostname,
      description: "",
      url: WP_URL,
      home: WP_URL,
      gmt_offset: 0,
      timezone_string: "",
    },
    routes: [homeRoute],
    posts: [],
    pages: [],
    media: [],
    styles: updatedStyles,
  };

  const dataDir = getMigratedDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const { syncPreviewDocument } = await import("../../app/api/wp/sync-preview-document");
  syncPreviewDocument(slug);
  console.log(`   Preview HTML → public/preview-static/${slug}.html\n`);

  upsertSite({
    slug,
    url: WP_URL,
    name: manifest.site.name,
    status: "ready",
    stage: "landing",
    routes: 1,
    pageBuilder,
    migratedAt: manifest.migratedAt,
  });

  setMigrationPhase(slug, "Landing page ready");
  console.log("✅ Landing page migration complete.\n");
}

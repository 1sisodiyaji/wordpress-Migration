import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir, getWpUrl } from "../../app/api/wp/config";
import type { MigrationManifest, WpRoute } from "../../app/api/wp/types";
import { setMigrationPhase } from "../../app/api/wp/migration-status";
import { upsertSite } from "../../app/api/wp/sites";
import { crawlHomePage } from "./fetch-elementor";
import { fetchStyles } from "./fetch-styles";

/** Fast path: styles + homepage HTML only (preview workspace). */
export async function runLandingMigration(slug: string): Promise<void> {
  setMigrationPhase(slug, "Fetching homepage styles");
  const styles = await fetchStyles(getWpUrl());
  console.log(
    `   ${styles.stylesheets.length} stylesheets, ${styles.inlineStyles.length} inline bundles\n`,
  );

  setMigrationPhase(slug, "Crawling homepage");
  const pageBuilder = styles.pageBuilder ?? "unknown";
  const homeRoute: WpRoute = {
    path: "/",
    wpLink: `${getWpUrl()}/`,
    type: "home",
    renderMode: "shell",
    pageBuilder,
    isElementor: pageBuilder === "elementor",
  };

  const { styles: updatedStyles } = await crawlHomePage(homeRoute, styles);

  setMigrationPhase(slug, `Running ${pageBuilder} asset pipeline`);
  const { runBuilderPipeline } = await import("./builders");
  await runBuilderPipeline(getWpUrl());

  if (pageBuilder === "elementor") {
    const { fetchElementorAssets } = await import("./fetch-elementor-assets");
    await fetchElementorAssets(`${getWpUrl().replace(/\/$/, "")}/`);
    const { fetchElementorSystem } = await import("./fetch-elementor-system");
    await fetchElementorSystem();
  }

  const manifest: MigrationManifest = {
    version: 1,
    migratedAt: new Date().toISOString(),
    wordpressUrl: getWpUrl(),
    restBase: `${getWpUrl()}/wp-json`,
    pageBuilder,
    site: {
      name: new URL(getWpUrl()).hostname,
      description: "",
      url: getWpUrl(),
      home: getWpUrl(),
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
    url: getWpUrl(),
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

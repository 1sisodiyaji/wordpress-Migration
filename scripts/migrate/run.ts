import { fetchContent } from "./fetch-content";
import { fetchElementorPages } from "./fetch-elementor";
import { runBuilderPipeline } from "./builders";
import { fetchElementorAssets } from "./fetch-elementor-assets";
import { fetchElementorSystem } from "./fetch-elementor-system";
import { fetchStyles } from "./fetch-styles";
import { fetchStaticFiles } from "./fetch-static-files";
import { snapshotVisual } from "./snapshot-visual";
import { getMigratedDataDir, WP_URL } from "../../app/api/wp/config";
import { appendMigrationLog } from "../../app/api/wp/migration-log";
import { setMigrationPhase } from "../../app/api/wp/migration-status";
import { upsertSite } from "../../app/api/wp/sites";
import { resetCssRegistry } from "./lib/css-download";
import { resetJsRegistry } from "./lib/js-download";

function phase(slug: string | undefined, message: string): void {
  console.log(message);
  if (slug) setMigrationPhase(slug, message.replace(/^[📐📦🎨📸🔄\s]+/, "").trim());
}

export async function runMigration(argv: string[]): Promise<void> {
  const args = new Set(argv);
  const landingOnly = args.has("--landing");
  const all = args.size === 0 || args.has("--all");
  const stylesOnly = args.has("--styles");
  const contentOnly = args.has("--content");
  const snapshots = args.has("--snapshots");
  const slug = process.env.SITE_SLUG;

  if (landingOnly && slug) {
    resetCssRegistry();
    resetJsRegistry();
    phase(slug, `\n🔄 Landing page migration`);
    console.log(`   Source: ${WP_URL}`);
    console.log(`   Site folder: sites/${slug}/\n`);
    upsertSite({
      slug,
      url: WP_URL,
      name: new URL(WP_URL).hostname,
      status: "migrating",
      stage: "landing",
    });
    try {
      const { runLandingMigration } = await import("./run-landing");
      await runLandingMigration(slug);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendMigrationLog(slug, `[error] ${message}`);
      upsertSite({
        slug,
        url: WP_URL,
        name: new URL(WP_URL).hostname,
        status: "failed",
        error: message,
      });
      throw err;
    }
  }

  resetCssRegistry();
  resetJsRegistry();

  phase(slug, `\n🔄 WordPress → Remix migration`);
  console.log(`   Source: ${WP_URL}`);
  if (slug) console.log(`   Site folder: sites/${slug}/\n`);

  if (slug) {
    upsertSite({
      slug,
      url: WP_URL,
      name: new URL(WP_URL).hostname,
      status: "migrating",
    });
  }

  let stylesManifest;

  try {
    if (all || stylesOnly || contentOnly) {
      phase(slug, "📐 Fetching styles (pixel-perfect CSS clone)");
      stylesManifest = await fetchStyles(WP_URL);
      console.log(
        `   ${stylesManifest.stylesheets.length} stylesheets, ${stylesManifest.inlineStyles.length} inline bundles\n`,
      );
    }

    if (all || contentOnly) {
      if (!stylesManifest) {
        const { readFile } = await import("node:fs/promises");
        const path = await import("node:path");
        const raw = await readFile(
          path.join(getMigratedDataDir(), "styles.json"),
          "utf8",
        );
        stylesManifest = JSON.parse(raw);
      }

      phase(slug, "📦 Fetching content (REST / GraphQL)");
      const staticFiles = await fetchStaticFiles(WP_URL);
      let manifest = await fetchContent(stylesManifest!);
      manifest = { ...manifest, staticFiles };
      console.log(
        `   ${manifest.pages.length} pages, ${manifest.posts.length} posts, ${manifest.media.length} media items`,
      );
      if (manifest.pageBuilder === "elementor") {
        console.log("   Builder: Elementor (rendered HTML + per-post CSS)\n");
      } else {
        console.log(`   Builder: ${manifest.pageBuilder ?? "unknown"}\n`);
      }

      if (manifest.pageBuilder === "elementor") {
        phase(slug, "Running Elementor builder pipeline");
        await runBuilderPipeline(WP_URL);
        phase(slug, "Fetching live Elementor CSS/JS enqueue order");
        await fetchElementorAssets(`${WP_URL.replace(/\/$/, "")}/`);
        const elementor = await fetchElementorSystem();
        manifest = { ...manifest, elementor };
      } else if (
        manifest.pageBuilder === "gutenberg" ||
        manifest.pageBuilder === "classic"
      ) {
        phase(slug, "Running block builder pipeline");
        await runBuilderPipeline(WP_URL);
      }

      phase(slug, "🎨 Crawling rendered pages (full-site HTML)");
      const crawlResult = await fetchElementorPages(manifest, stylesManifest!);
      manifest = {
        ...manifest,
        styles: crawlResult.styles,
        routes: crawlResult.routes,
      };
      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await writeFile(
        join(getMigratedDataDir(), "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8",
      );

      if (all || snapshots) {
        phase(slug, "📸 Visual snapshots (optional)");
        try {
          await snapshotVisual(manifest);
        } catch (err) {
          console.warn("   Skipped snapshots:", err);
        }
      }
    } else if (snapshots) {
      const { readFile } = await import("node:fs/promises");
      const path = await import("node:path");
      const manifest = JSON.parse(
        await readFile(
          path.join(getMigratedDataDir(), "manifest.json"),
          "utf8",
        ),
      );
      await snapshotVisual(manifest);
    }

    if (slug) {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const manifestPath = join(getMigratedDataDir(), "manifest.json");
      const { existsSync } = await import("node:fs");
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        upsertSite({
          slug,
          url: WP_URL,
          name: manifest.site?.name ?? new URL(WP_URL).hostname,
          status: "ready",
          stage: "full",
          migratedAt: manifest.migratedAt,
          routes: manifest.routes?.length,
          pageBuilder: manifest.pageBuilder,
        });
        setMigrationPhase(slug, "Complete");
      } else if (slug) {
        throw new Error("Migration finished but manifest.json was not created.");
      }
    }

    console.log("✅ Migration complete. Run: npm run dev\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (slug) {
      appendMigrationLog(slug, `[error] ${message}`);
      upsertSite({
        slug,
        url: WP_URL,
        name: new URL(WP_URL).hostname,
        status: "failed",
        error: message,
      });
      setMigrationPhase(slug, `Failed: ${message}`);
    }
    throw err;
  }
}

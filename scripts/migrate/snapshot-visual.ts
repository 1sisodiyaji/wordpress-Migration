import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { MIGRATED_DATA_DIR, getWpUrl } from "../../app/api/wp/config";
import type { MigrationManifest } from "../../app/api/wp/types";

const SNAPSHOT_DIR = path.join(process.cwd(), "migration-reports", "snapshots");

export async function snapshotVisual(
  manifest: MigrationManifest,
  remixUrl = process.env.REMIX_SITE_URL ??
    process.env.VITE_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:5173",
): Promise<void> {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const targets = manifest.routes.slice(0, 10);

  console.log(`  Comparing ${targets.length} routes (WP vs Remix)…`);

  for (const route of targets) {
    const wpUrl = route.type === "home" ? getWpUrl() : route.wpLink;
    const remixPage = `${remixUrl}${route.path}`;

    const wpPage = await browser.newPage();
    const nxPage = await browser.newPage();

    try {
      await wpPage.goto(wpUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await nxPage.goto(remixPage, { waitUntil: "networkidle", timeout: 60_000 });

      const slug = route.path === "/" ? "home" : route.path.replace(/\//g, "_");
      await wpPage.screenshot({
        path: path.join(SNAPSHOT_DIR, `${slug}-wordpress.png`),
        fullPage: true,
      });
      await nxPage.screenshot({
        path: path.join(SNAPSHOT_DIR, `${slug}-remix.png`),
        fullPage: true,
      });
      console.log(`  ✓ snapshots ${route.path}`);
    } catch (err) {
      console.warn(`  ⚠ snapshot failed ${route.path}:`, err);
    } finally {
      await wpPage.close();
      await nxPage.close();
    }
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    wordpressUrl: getWpUrl(),
    remixUrl,
    snapshotDir: SNAPSHOT_DIR,
    note: "Open side-by-side PNGs in migration-reports/snapshots to verify pixel-perfect parity.",
  };

  await fs.writeFile(
    path.join(MIGRATED_DATA_DIR, "visual-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
}

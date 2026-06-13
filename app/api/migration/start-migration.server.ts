import { spawn } from "node:child_process";
import path from "node:path";
import { appendMigrationLog, initMigrationLog } from "@/api/wp/migration-log";
import { setMigrationPhase } from "@/api/wp/migration-status";
import {
  normalizeWordPressUrl,
  upsertSite,
  urlToSlug,
} from "@/api/wp/sites";

export type MigrationMode = "landing" | "full";

export function startMigration(
  urlInput: string,
  retry = false,
  mode: MigrationMode = "landing",
): { slug: string; url: string } {
  const url = normalizeWordPressUrl(urlInput);
  const slug = urlToSlug(url);
  const script = path.join(process.cwd(), "scripts", "migrate", "index.ts");
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  initMigrationLog(slug, url, retry);
  setMigrationPhase(slug, "Starting migration worker");

  upsertSite({
    slug,
    url,
    name: new URL(url).hostname,
    status: "migrating",
  });

  appendMigrationLog(slug, `[system] Launching: node tsx ${script}`);

  const migrateArgs =
    mode === "landing"
      ? ["--landing", "--url", url, "--site", slug]
      : ["--all", "--url", url, "--site", slug];

  const child = spawn(process.execPath, [tsxCli, script, ...migrateArgs], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      WORDPRESS_URL: url,
      SITE_SLUG: slug,
      MIGRATE_MODE: mode,
    },
  });

  child.on("spawn", () => {
    appendMigrationLog(slug, `[system] Worker running (pid ${child.pid ?? "unknown"})`);
  });

  child.on("error", (err) => {
    appendMigrationLog(slug, `[error] Failed to start worker: ${err.message}`);
    upsertSite({
      slug,
      url,
      name: new URL(url).hostname,
      status: "failed",
      error: err.message,
    });
  });

  child.unref();

  return { slug, url };
}

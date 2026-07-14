#!/usr/bin/env npx tsx
/**
 * Scrape a website (URL) or import local files into sites/{slug}/.
 *
 * URL mode:
 *   pnpm scrape -- --url https://example.com --site example-com --all
 *
 * Local import (HTML folder or WP export):
 *   pnpm scrape -- --import ./path/to/html --site my-site
 */
import "dotenv/config";
import { bootstrapMigrateEnv } from "./core/bootstrap";
import { importLocalSource } from "./import-local";

const argv = process.argv.slice(2);

const importPath = getArg(argv, "--import") ?? getArg(argv, "-i");
if (importPath) {
  const site = getArg(argv, "--site") ?? getArg(argv, "-s");
  if (!site) {
    console.error("Local import requires --site <slug>");
    process.exit(1);
  }
  await importLocalSource({ importPath, siteSlug: site });
  process.exit(0);
}

bootstrapMigrateEnv(argv);

const slug = process.env.SITE_SLUG;
if (slug) {
  const { installMigrationLogger } = await import("./core/lib/logger");
  installMigrationLogger(slug);
}

const { runMigration } = await import("./core/run");

try {
  await runMigration(argv);
} catch (err) {
  if (slug) {
    const { appendMigrationLog } = await import("../lib/wp/migration-log");
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    appendMigrationLog(slug, `[fatal] ${message}`);
  }
  process.exit(1);
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

#!/usr/bin/env npx tsx
import "dotenv/config";
import { bootstrapMigrateEnv } from "./bootstrap";

bootstrapMigrateEnv(process.argv.slice(2));

const slug = process.env.SITE_SLUG;
if (slug) {
  const { installMigrationLogger } = await import("./lib/logger");
  installMigrationLogger(slug);
}

const { runMigration } = await import("./run");

try {
  await runMigration(process.argv.slice(2));
} catch (err) {
  if (slug) {
    const { appendMigrationLog } = await import("../../app/api/wp/migration-log");
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    appendMigrationLog(slug, `[fatal] ${message}`);
  }
  process.exit(1);
}

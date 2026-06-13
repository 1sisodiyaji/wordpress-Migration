#!/usr/bin/env npx tsx
/**
 * WordPress scrape → Puck JSON
 *
 * Reads sites/{slug}/data/pages/*.html and writes:
 *   sites/{slug}/data/puck/database.json  — Puck page data (path → Data)
 *   sites/{slug}/data/puck/meta.json      — conversion metadata
 *
 * Usage:
 *   SITE_SLUG=radius-ois-ai npx tsx scripts/migrate-to-puck.ts
 *   npx tsx scripts/migrate-to-puck.ts radius-ois-ai
 */
import "dotenv/config";
import { bootstrapMigrateEnv } from "./migrate/bootstrap";
import {
  convertSiteToPuck,
  savePuckDatabase,
} from "./migrate/lib/wp-to-puck";

const slug =
  process.argv[2]?.trim() ||
  process.env.SITE_SLUG?.trim() ||
  "radius-ois-ai";

process.env.SITE_SLUG = slug;
bootstrapMigrateEnv([]);

console.log(`\n🎯 WP → Puck conversion: ${slug}\n`);

const { database, meta } = convertSiteToPuck(slug);
savePuckDatabase(slug, database, meta);

console.log(`   Pages converted: ${meta.pageCount}`);
console.log(`   Strategy: ${meta.strategy}`);
console.log(`   Routes: ${meta.routes.join(", ")}`);
console.log(`\n   ✓ sites/${slug}/data/puck/database.json`);
console.log(`   ✓ sites/${slug}/data/puck/meta.json\n`);

const sample = database["/"];
if (sample) {
  console.log("── Sample Puck data for / ──");
  console.log(JSON.stringify(sample, null, 2).slice(0, 800));
  console.log("...\n");
}

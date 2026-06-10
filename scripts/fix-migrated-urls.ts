#!/usr/bin/env npx tsx
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { MIGRATED_DATA_DIR, WP_URL } from "../app/api/wp/config";
import { sanitizeMigratedUrls } from "./migrate/lib/sanitize-urls";

const PAGES_DIR = path.join(MIGRATED_DATA_DIR, "pages");

async function main(): Promise<void> {
  const files = await fs.readdir(PAGES_DIR);
  let fixed = 0;

  for (const file of files) {
    if (!file.endsWith(".html")) continue;
    const filePath = path.join(PAGES_DIR, file);
    const raw = await fs.readFile(filePath, "utf8");
    const out = sanitizeMigratedUrls(raw, WP_URL);
    if (out !== raw) {
      await fs.writeFile(filePath, out, "utf8");
      fixed += 1;
      console.log(`  ✓ ${file}`);
    }
  }

  const homeLegacy = path.join(MIGRATED_DATA_DIR, "home-shell.html");
  try {
    const raw = await fs.readFile(homeLegacy, "utf8");
    const out = sanitizeMigratedUrls(raw, WP_URL);
    if (out !== raw) await fs.writeFile(homeLegacy, out, "utf8");
  } catch {
    /* optional */
  }

  console.log(`\n✅ Fixed ${fixed} HTML file(s)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

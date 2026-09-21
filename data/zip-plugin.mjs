#!/usr/bin/env node
/**
 * Zip only data/Plugin → data/Plugin.zip (WordPress-installable layout).
 *
 * Usage: pnpm zip:plugin
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.join(__dirname, "Plugin");
const OUT_ZIP = path.join(__dirname, "Plugin.zip");
const ROOT_IN_ZIP = "Plugin";

function addDir(zip, absDir, zipPrefix) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === "." || entry.name === ".." || entry.name.startsWith(".")) continue;
    const abs = path.join(absDir, entry.name);
    const rel = `${zipPrefix}/${entry.name}`.replace(/\\/g, "/");
    if (entry.isDirectory()) {
      addDir(zip, abs, rel);
    } else if (entry.isFile()) {
      zip.addLocalFile(abs, path.posix.dirname(rel), entry.name);
    }
  }
}

if (!fs.existsSync(path.join(PLUGIN_DIR, "wp-grape-export.php"))) {
  console.error(`Missing plugin bootstrap at ${path.join(PLUGIN_DIR, "wp-grape-export.php")}`);
  process.exit(1);
}

const zip = new AdmZip();
addDir(zip, PLUGIN_DIR, ROOT_IN_ZIP);

if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);
zip.writeZip(OUT_ZIP);

const entries = zip.getEntries().filter((e) => !e.isDirectory);
const bytes = fs.statSync(OUT_ZIP).size;
console.log(`Wrote ${OUT_ZIP}`);
console.log(`  ${entries.length} files · ${(bytes / 1024).toFixed(1)} KB`);
console.log(`  Root folder in zip: ${ROOT_IN_ZIP}/`);

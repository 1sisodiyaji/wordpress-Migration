#!/usr/bin/env npx tsx
/**
 * Compare migrated data on disk vs what preview needs.
 * Usage: npx tsx scripts/migrate-audit.ts radius-ois-ai
 */
import fs from "node:fs";
import path from "node:path";
import { getElementorAssets } from "../app/api/wp/elementor-assets";
import { getMigratedDataDir, getMigratedPublicDir } from "../app/api/wp/config";
import { loadCssRegistry } from "../app/api/wp/css-registry";
import { loadJsRegistry } from "../app/api/wp/js-registry";
import { getStyles } from "../app/api/wp/load-migrated";
import { resolvePreviewStylesheets } from "../app/api/wp/resolve-preview-stylesheets";

const slug = process.argv[2] ?? "radius-ois-ai";
const dataDir = getMigratedDataDir(slug);
const cssDir = path.join(getMigratedPublicDir(slug), "css");

const styles = getStyles(slug);
const elementor = getElementorAssets(slug);
const registry = loadCssRegistry(slug);
const jsRegistry = loadJsRegistry(slug);
const resolved = resolvePreviewStylesheets(slug);

const cssFiles = fs.existsSync(cssDir) ? fs.readdirSync(cssDir) : [];
const jsDir = path.join(getMigratedPublicDir(slug), "js");
const jsFiles = fs.existsSync(jsDir) ? fs.readdirSync(jsDir) : [];

const dataFiles = fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir, { recursive: true }).map(String)
  : [];

console.log(`\n📊 Migration audit: ${slug}\n`);
console.log("── Data folder (sites/{slug}/data/) ──");
console.log(dataFiles.filter((f) => !f.includes("pages")).join("\n") || "(empty)");
console.log(`\n── pages/ ──`);
const pagesDir = path.join(dataDir, "pages");
if (fs.existsSync(pagesDir)) {
  console.log(fs.readdirSync(pagesDir).join(", "));
}

console.log(`\n── CSS on disk (public/sites/{slug}/css/) ──`);
console.log(`Count: ${cssFiles.length}`);

console.log(`\n── styles.json stylesheets ──`);
console.log(`Count: ${styles?.stylesheets?.length ?? 0}`);
styles?.stylesheets?.forEach((s) => console.log(`  ${s}`));

console.log(`\n── elementor/assets.json stylesheets ──`);
console.log(`Count: ${elementor?.stylesheets?.length ?? 0}`);

console.log(`\n── css-registry.json entries ──`);
console.log(`Count: ${Object.keys(registry).length}`);

console.log(`\n── JS on disk (public/sites/{slug}/js/) ──`);
console.log(`Count: ${jsFiles.length}`);

console.log(`\n── js-registry.json entries ──`);
console.log(`Count: ${Object.keys(jsRegistry).length}`);

console.log(`\n── Preview resolver output ──`);
console.log(`Count: ${resolved.length}`);
resolved.slice(0, 8).forEach((s) => console.log(`  ${s}`));
if (resolved.length > 8) console.log(`  ... +${resolved.length - 8} more`);

const missingLocal =
  elementor?.stylesheets?.filter((url) => {
    const local = resolved.find(
      (r) => r.includes("post-") && url.includes(r.split("/").pop()?.split("-")[0] ?? ""),
    );
    return !local && !resolved.some((r) => r.startsWith("/sites/"));
  }) ?? [];

console.log(`\n── Gap summary ──`);
console.log(
  styles?.stylesheets?.length === 1 && cssFiles.length > 10
    ? "⚠ styles.json is stale (1 entry) but many CSS files exist — preview was broken until resolver fix"
    : "✓ styles.json count looks consistent",
);
console.log(
  elementor
    ? `✓ elementor/assets.json present (${elementor.stylesheets.length} sheets, ${elementor.scripts.length} scripts)`
    : "⚠ Missing elementor/assets.json — re-run full migrate with Elementor builder",
);
console.log(
  fs.existsSync(path.join(dataDir, "pages", "home.assets.json"))
    ? "✓ home.assets.json (JS stack for preview)"
    : "⚠ Missing home.assets.json",
);
console.log(
  fs.existsSync(path.join(dataDir, "elementor", "global-styles.css"))
    ? "✓ elementor/global-styles.css"
    : "○ No global custom CSS",
);
console.log(
  jsFiles.length === 0
    ? "⚠ No local JS — run: npm run migrate:repair-assets"
    : `✓ ${jsFiles.length} JS files mirrored locally`,
);
console.log("");

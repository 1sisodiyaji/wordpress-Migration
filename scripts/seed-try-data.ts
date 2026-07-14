#!/usr/bin/env npx tsx
/**
 * Seed a project from try-data/ (local Smartco WordPress export for testing).
 *
 *   pnpm import:try-data
 *   pnpm import:try-data -- --slug smartco --generate --run
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { importWpExport } from "../lib/wp-import/import-wp-export";
import {
  getImportSourceDir,
  storeSqlFile,
  storeWpConfigFile,
  storeWpContentZip,
} from "../lib/wp-import/store-parts";
import { createStudioMeta, getImportDir, patchStudioMeta } from "../studio/server/state";
import { upsertSite } from "../lib/wp/sites";

const ROOT = process.cwd();
const TRY_DATA = path.join(ROOT, "try-data");

function getArg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

const argv = process.argv.slice(2);
const slug = getArg(argv, "--slug") ?? "smartco";
const shouldGenerate = argv.includes("--generate");
const shouldRun = argv.includes("--run");

const sqlPath = path.join(TRY_DATA, "smartco.sql");
const wpConfigPath = path.join(
  TRY_DATA,
  "smartco-20260705T182508Z-3-001/smartco/wp-config.php",
);
const wpContentZip = path.join(
  TRY_DATA,
  "smartco-20260705T182508Z-3-001/smartco/wp-content.zip",
);

for (const f of [sqlPath, wpConfigPath, wpContentZip]) {
  if (!fs.existsSync(f)) {
    console.error(`Missing try-data file: ${f}`);
    process.exit(1);
  }
}

const importDir = getImportDir(slug);
if (fs.existsSync(importDir)) fs.rmSync(importDir, { recursive: true, force: true });
fs.mkdirSync(importDir, { recursive: true });

console.log(`\n📦 Seeding try-data → sites/${slug}/import/\n`);

storeSqlFile(importDir, fs.readFileSync(sqlPath), "smartco.sql");
storeWpConfigFile(importDir, fs.readFileSync(wpConfigPath));
const extracted = storeWpContentZip(importDir, fs.readFileSync(wpContentZip));
console.log(`   ✓ smartco.sql`);
console.log(`   ✓ wp-config.php`);
console.log(`   ✓ wp-content.zip (${extracted} files extracted)\n`);

createStudioMeta({
  slug,
  name: "Smartco",
  sourceType: "files",
  url: "http://localhost/smartco",
});

patchStudioMeta(slug, {
  scrapeStatus: "running",
  hasDbDump: true,
  hasWpContent: true,
  hasWpConfig: true,
  uploadedFiles: ["smartco.sql", "wp-config.php", "wp-content.zip"],
  sourceType: "files",
});

const sourceDir = getImportSourceDir(importDir);
const result = await importWpExport({
  importDir: sourceDir,
  siteSlug: slug,
  name: "Smartco",
});

patchStudioMeta(slug, { scrapeStatus: "done" });

console.log(`✅ Import complete → sites/${slug}/`);
console.log(`   Pages: ${result.pageCount}`);
console.log(`   Site URL: ${result.siteUrl}`);
console.log(`   SQL: ${result.hasSql} | wp-content: ${result.hasWpContent} | wp-config: ${result.hasWpConfig}\n`);

upsertSite({
  slug,
  url: result.siteUrl,
  name: "Smartco",
  status: "ready",
  stage: "full",
  routes: result.pageCount,
  pageBuilder: "elementor",
});

if (shouldGenerate) {
  const { generateReactGrapeProject, getProjectDir } = await import("../generator/lib/scaffold");
  const port = 3001;
  console.log(`🔧 Generating GrapeJS project…`);
  await generateReactGrapeProject({ siteSlug: slug, port });
  patchStudioMeta(slug, { generateStatus: "done", editorPort: port });

  if (shouldRun) {
    const projectDir = getProjectDir(slug);
    console.log(`📦 pnpm install in projects/${slug}/…`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("pnpm", ["install"], { cwd: projectDir, shell: true, stdio: "inherit" });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`install failed ${code}`))));
    });
    console.log(`\n🚀 Editor: http://localhost:${port}\n`);
    spawn("pnpm", ["dev"], { cwd: projectDir, shell: true, stdio: "inherit" });
  } else {
    console.log(`Next: cd projects/${slug} && pnpm install && pnpm dev\n`);
  }
} else {
  console.log(`Next: pnpm generate -- --site ${slug} --run\n`);
}

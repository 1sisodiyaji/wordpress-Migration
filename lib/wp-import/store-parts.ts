import fs from "node:fs";
import path from "node:path";
import {
  detectWpLayout,
  extractZipBuffer,
  type WpImportLayout,
} from "./unpack-zip";

const WP_ROOT = "_wp";
const WP_CONTENT = "wp-content";
const WP_CONFIG = "wp-config.php";

export function getWpImportRoot(importDir: string): string {
  return path.join(importDir, WP_ROOT);
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Merge detected wp-content tree into import/_wp/wp-content */
function mergeWpContentTree(sourceDir: string, wpRoot: string): void {
  const dest = path.join(wpRoot, WP_CONTENT);
  const layout = detectWpLayout(sourceDir);

  if (layout.wpContent) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(layout.wpContent, dest);
    return;
  }

  // Zip may contain themes/plugins/uploads directly (wp-content contents).
  const hasWpFolders = ["themes", "plugins", "uploads", "mu-plugins"].some((name) =>
    fs.existsSync(path.join(sourceDir, name)),
  );
  if (hasWpFolders) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (entry.name === WP_CONFIG || /\.sql$/i.test(entry.name)) continue;
      const from = path.join(sourceDir, entry.name);
      const to = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDir(from, to);
      else fs.copyFileSync(from, to);
    }
  }
}

export function storeSqlFile(importDir: string, buffer: Buffer, originalName: string): void {
  const wpRoot = getWpImportRoot(importDir);
  fs.mkdirSync(wpRoot, { recursive: true });
  const safeName = path.basename(originalName).replace(/[^\w.\-]+/g, "_");
  const dest = path.join(wpRoot, safeName.endsWith(".sql") ? safeName : `${safeName}.sql`);
  fs.writeFileSync(dest, buffer);
}

export function storeWpConfigFile(importDir: string, buffer: Buffer): void {
  const wpRoot = getWpImportRoot(importDir);
  fs.mkdirSync(wpRoot, { recursive: true });
  fs.writeFileSync(path.join(wpRoot, WP_CONFIG), buffer);
}

export function storeWpContentZip(importDir: string, buffer: Buffer): number {
  const wpRoot = getWpImportRoot(importDir);
  const staging = path.join(importDir, "_staging-wp-content");
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });

  const extracted = extractZipBuffer(buffer, staging);
  mergeWpContentTree(staging, wpRoot);
  fs.rmSync(staging, { recursive: true, force: true });
  return extracted.length;
}

export interface WpImportStatus {
  layout: WpImportLayout;
  hasSql: boolean;
  hasWpContent: boolean;
  hasWpConfig: boolean;
  readyToImport: boolean;
  missing: string[];
}

export function getWpImportStatus(importDir: string): WpImportStatus {
  const wpRoot = getWpImportRoot(importDir);
  if (!fs.existsSync(wpRoot)) {
    return {
      layout: { root: importDir },
      hasSql: false,
      hasWpContent: false,
      hasWpConfig: false,
      readyToImport: false,
      missing: ["Database (.sql file)", "wp-content (.zip)", "wp-config.php"],
    };
  }

  const layout = detectWpLayout(wpRoot);

  const hasSql = Boolean(layout.sqlFile);
  const hasWpContent = Boolean(layout.wpContent);
  const hasWpConfig = Boolean(layout.wpConfig);

  const missing: string[] = [];
  if (!hasSql) missing.push("Database (.sql file)");
  if (!hasWpContent) missing.push("wp-content (.zip)");
  if (!hasWpConfig) missing.push("wp-config.php");

  return {
    layout: { ...layout, root: wpRoot },
    hasSql,
    hasWpContent,
    hasWpConfig,
    readyToImport: hasSql || hasWpContent,
    missing,
  };
}

export function getImportSourceDir(importDir: string): string {
  const status = getWpImportStatus(importDir);
  return status.layout.root;
}

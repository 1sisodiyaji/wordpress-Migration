import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const SQL_PATTERN = /\.sql$/i;
const WP_CONFIG = "wp-config.php";
const WP_CONTENT = "wp-content";

export interface WpImportLayout {
  root: string;
  sqlFile?: string;
  wpConfig?: string;
  wpContent?: string;
}

/** Extract a zip buffer into destDir (safe paths only). */
export function extractZipBuffer(buffer: Buffer, destDir: string): string[] {
  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const written: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const normalized = path.normalize(entry.entryName).replace(/^(\.\.(\/|\\|$))+/, "");
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) continue;

    const outPath = path.join(destDir, normalized);
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
    written.push(normalized);
  }

  return written;
}

/** Find wp-content, wp-config.php, and .sql anywhere under importDir (max depth 4). */
export function detectWpLayout(importDir: string): WpImportLayout {
  const found: WpImportLayout = { root: importDir };

  function walk(dir: string, depth: number): void {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === WP_CONTENT && !found.wpContent) {
          found.wpContent = full;
        }
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (entry.name === WP_CONFIG && !found.wpConfig) {
          found.wpConfig = full;
        }
        if (SQL_PATTERN.test(entry.name) && !found.sqlFile) {
          found.sqlFile = full;
        }
      }
    }
  }

  walk(importDir, 0);
  return found;
}

export function normalizeWpImportTree(importDir: string): WpImportLayout {
  const layout = detectWpLayout(importDir);
  const normalizedRoot = path.join(importDir, "_wp");

  if (!layout.wpContent && !layout.sqlFile && !layout.wpConfig) {
    return layout;
  }

  fs.mkdirSync(normalizedRoot, { recursive: true });

  if (layout.sqlFile) {
    const dest = path.join(normalizedRoot, path.basename(layout.sqlFile));
    if (layout.sqlFile !== dest) {
      fs.copyFileSync(layout.sqlFile, dest);
      layout.sqlFile = dest;
    }
  }

  if (layout.wpConfig) {
    const dest = path.join(normalizedRoot, WP_CONFIG);
    if (layout.wpConfig !== dest) {
      fs.copyFileSync(layout.wpConfig, dest);
      layout.wpConfig = dest;
    }
  }

  if (layout.wpContent) {
    const dest = path.join(normalizedRoot, WP_CONTENT);
    if (layout.wpContent !== dest) {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      copyDir(layout.wpContent, dest);
      layout.wpContent = dest;
    }
  }

  layout.root = normalizedRoot;
  return layout;
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

export interface WpUploadSummary {
  extracted: string[];
  layout: WpImportLayout;
  hasSql: boolean;
  hasWpContent: boolean;
  hasWpConfig: boolean;
}

export function processUploadedZip(buffer: Buffer, importDir: string): WpUploadSummary {
  const extractDir = path.join(importDir, "upload");
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });

  const extracted = extractZipBuffer(buffer, extractDir);
  const layout = normalizeWpImportTree(extractDir);

  return {
    extracted,
    layout,
    hasSql: Boolean(layout.sqlFile),
    hasWpContent: Boolean(layout.wpContent),
    hasWpConfig: Boolean(layout.wpConfig),
  };
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import type {
  PluginExportAssetManifest,
  PluginExportAudit,
  PluginExportLayout,
  PluginExportManifest,
  PluginExportMediaItem,
  PluginExportPageMeta,
  PluginExportRoute,
  PluginExportTemplate,
} from "../../wp/types";
import { extractZipBuffer } from "../unpack-zip";

export interface PluginExportBundle {
  /** Absolute path to the bundle root (extracted). */
  root: string;
  /** True when we extracted a zip to a temp dir that the caller may clean up. */
  isTemp: boolean;
  /** Temp dir the zip was extracted into (present when isTemp). */
  extractRoot?: string;
  manifest: PluginExportManifest;
  routes: PluginExportRoute[];
  layout: PluginExportLayout;
  templates: PluginExportTemplate[];
  assets: PluginExportAssetManifest;
  media: PluginExportMediaItem[];
  audit: PluginExportAudit;
  /** Read a page's meta.json given the route dir. */
  readPageMeta: (dir: string) => PluginExportPageMeta | null;
  /** Read an arbitrary bundle file as text (relative path). */
  readText: (relative: string) => string;
}

function readJson<T>(root: string, relative: string, fallback: T): T {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Find the directory that actually contains manifest.json (bundle may be nested one level). */
function locateBundleRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(dir, entry.name);
    if (fs.existsSync(path.join(candidate, "manifest.json"))) return candidate;
  }
  return dir;
}

/**
 * Load a wp-grape-export bundle from either an extracted directory or a .zip file.
 */
export function readPluginExportBundle(source: string): PluginExportBundle {
  const stat = fs.existsSync(source) ? fs.statSync(source) : null;
  if (!stat) {
    throw new Error(`Plugin export not found: ${source}`);
  }

  let root: string;
  let isTemp = false;
  let extractRoot: string | undefined;

  if (stat.isDirectory()) {
    root = locateBundleRoot(source);
  } else if (/\.zip$/i.test(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wpge-bundle-"));
    extractZipBuffer(fs.readFileSync(source), tmp);
    root = locateBundleRoot(tmp);
    isTemp = true;
    extractRoot = tmp;
  } else {
    throw new Error(`Unsupported plugin export source (expect a folder or .zip): ${source}`);
  }

  const manifestPath = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `manifest.json not found in plugin export. Is this a wp-grape-export bundle? (${root})`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PluginExportManifest;
  if (manifest.version !== 2) {
    throw new Error(
      `Unsupported plugin export schema version: ${String(
        (manifest as { version?: unknown }).version,
      )} (expected 2).`,
    );
  }

  const files = manifest.files ?? {};

  const layout = readJson<PluginExportLayout>(root, files.layout ?? "layout.json", {
    header: null,
    footer: null,
    menus: [],
  });
  const routes = readJson<PluginExportRoute[]>(root, files.routes ?? "routes.json", []);
  const assets = readJson<PluginExportAssetManifest>(root, files.assets ?? "assets/manifest.json", {
    stylesheets: [],
    scripts: [],
  });
  const media = readJson<PluginExportMediaItem[]>(root, files.media ?? "media/map.json", []);
  const audit = readJson<PluginExportAudit>(root, files.audit ?? "audit/report.json", {
    unresolvedShortcodes: [],
    warnings: [],
  });

  const templatesIndex = readJson<PluginExportTemplate[]>(root, "templates/index.json", []);

  return {
    root,
    isTemp,
    extractRoot,
    manifest,
    routes,
    layout,
    templates: templatesIndex,
    assets,
    media,
    audit,
    readPageMeta: (dir) => readJson<PluginExportPageMeta | null>(root, path.join(dir, "meta.json"), null),
    readText: (relative) => {
      const full = path.join(root, relative);
      return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
    },
  };
}

/** Best-effort cleanup of a temp-extracted bundle. */
export function cleanupBundle(bundle: PluginExportBundle): void {
  if (bundle.isTemp && bundle.extractRoot && fs.existsSync(bundle.extractRoot)) {
    fs.rmSync(bundle.extractRoot, { recursive: true, force: true });
  }
}

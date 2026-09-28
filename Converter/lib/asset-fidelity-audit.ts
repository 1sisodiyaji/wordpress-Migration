/**
 * Post-migration / post-convert asset fidelity audit.
 *
 * Compares plugin-export asset manifests + converted canvas style/script lists
 * against files on disk, then writes a durable report so we can track missing
 * CSS/JS over time and tighten the WordPress export plugin.
 */
import fs from "node:fs";
import path from "node:path";
import { getProjectsRoot } from "../shared/paths";
import { getMigratedDataDir } from "../shared/wp/config";
import type { PluginExportAssetRef } from "../shared/wp/types";

function getProjectDir(slug: string): string {
  return path.join(getProjectsRoot(), slug);
}

export type AssetKind = "style" | "script";

export type MissingReason =
  | "file-missing"
  | "no-bundle-path"
  | "canvas-href-missing"
  | "html-href-missing";

export interface AssetEntryAudit {
  kind: AssetKind;
  handle: string;
  src: string | null;
  bundlePath: string | null;
  bundleInline: string | null;
  /** Absolute or project-relative path checked on disk (when known). */
  diskPath: string | null;
  present: boolean;
  bytes: number | null;
  /** Why this entry is incomplete (null when present or intentionally skipped). */
  reason: MissingReason | null;
  /** Converter intentionally skips admin/editor chrome. */
  blocked: boolean;
  /** Entry only exists as inline CSS/JS (no external file expected). */
  inlineOnly: boolean;
}

export interface HrefAudit {
  href: string;
  kind: AssetKind;
  source: "canvasStyles" | "canvasScripts" | "html";
  pageKey?: string;
  present: boolean;
  bytes: number | null;
  diskPath: string | null;
  reason: MissingReason | null;
}

export interface AssetKindSummary {
  declared: number;
  present: number;
  missing: number;
  inlineOnly: number;
  noBundlePath: number;
  blocked: number;
  bytesPresent: number;
  bytesMissingKnown: number;
}

export interface HrefSummary {
  referenced: number;
  present: number;
  missing: number;
  bytesPresent: number;
}

export interface AssetFidelityGuardrail {
  maxMissingStyles: number;
  maxMissingScripts: number;
  maxMissingCanvasStyles: number;
  maxMissingCanvasScripts: number;
  /** Fail when missing / declared exceeds this ratio (0–1). Null = disabled. */
  maxMissingStyleRatio: number | null;
  passed: boolean;
  failures: string[];
}

export interface AssetFidelityReport {
  version: 1;
  slug: string;
  phase: "post-import" | "post-convert";
  generatedAt: string;
  pageBuilder: string | null;
  roots: {
    dataDir: string;
    projectDir: string;
    publicDir: string;
    assetsDir: string;
  };
  summary: {
    styles: AssetKindSummary;
    scripts: AssetKindSummary;
    canvasStyles: HrefSummary;
    canvasScripts: HrefSummary;
    htmlRefs: HrefSummary;
    /** Convenience totals for dashboards / CI. */
    totalMissing: number;
    totalDeclaredAssets: number;
  };
  guardrail: AssetFidelityGuardrail;
  missing: {
    styles: AssetEntryAudit[];
    scripts: AssetEntryAudit[];
    canvasStyles: HrefAudit[];
    canvasScripts: HrefAudit[];
    htmlRefs: HrefAudit[];
  };
  /** Compact top offenders (largest expected gaps first). */
  topMissing: Array<{
    kind: AssetKind | "canvas" | "html";
    handleOrHref: string;
    reason: MissingReason;
    bytes: number | null;
  }>;
}

export interface AuditOptions {
  slug: string;
  phase?: "post-import" | "post-convert";
  /** Soft caps — defaults are lenient so convert still succeeds while we gather data. */
  maxMissingStyles?: number;
  maxMissingScripts?: number;
  maxMissingCanvasStyles?: number;
  maxMissingCanvasScripts?: number;
  maxMissingStyleRatio?: number | null;
  /** When true, throw if guardrail fails. */
  failOnGuardrail?: boolean;
  /** Also append a one-line JSONL history entry. */
  writeHistory?: boolean;
}

const BLOCKED_STYLE_HANDLES = new Set([
  "admin-bar",
  "dashicons",
  "wp-optimize-global",
]);

const BLOCKED_SCRIPT_HANDLES = new Set([
  "admin-bar",
  "app-loader",
  "elementor-app-loader",
  "elementor-web-cli",
  "elementor-dev-tools",
  "elementor-common",
  "elementor-common-modules",
  "elementor-pro-app",
  "wp-api-request",
  "wp-hooks",
  "wp-i18n",
  "underscore",
  "backbone",
  "backbone-marionette",
  "backbone-radio",
  "elementor-dialog",
  "jquery-ui-core",
  "jquery-ui-mouse",
  "jquery-ui-draggable",
  "jquery-ui-position",
  "astra-flexibility",
  "astra-theme-js",
]);

const ALLOWED_WP_INCLUDES_STYLE =
  /wp-includes\/css\/dist\/block-library\/(style|theme|common)(\.min)?\.css|wp-includes\/css\/dist\/theme\/(design-tokens|theme-json)(\.min)?\.css|wp-includes\/css\/classic-themes(\.min)?\.css/i;

function isBlockedStyle(entry: PluginExportAssetRef): boolean {
  const handle = entry.handle ?? "";
  if (BLOCKED_STYLE_HANDLES.has(handle)) return true;
  if (handle.includes("admin")) return true;
  if (/block-editor|block-directory|wp-components|wp-preferences|\/editor(\.min)?\.css/i.test(handle)) {
    return true;
  }
  const src = entry.src ?? "";
  const bundle = entry.bundlePath ?? "";
  if (
    /^(wp-block-library|wp-block-library-theme|classic-theme-styles|wp-theme|wp-theme-json)$/i.test(
      handle,
    )
  ) {
    return false;
  }
  if (ALLOWED_WP_INCLUDES_STYLE.test(src) || ALLOWED_WP_INCLUDES_STYLE.test(bundle)) return false;
  if (/editor(\.min)?\.css/i.test(src) || /editor(\.min)?\.css/i.test(bundle)) return true;
  if (/block-editor|block-directory/i.test(src)) return true;
  // Non-allowed wp-includes styles still count as missing until plugin copies them —
  // do not auto-block design CSS.
  if (/wp-includes\//i.test(src) || /\/wp-includes\//i.test(bundle)) {
    // Editor-only paths remain blocked.
    if (/block-editor|components|preferences|\/editor(\.min)?\.css/i.test(src + bundle)) return true;
    return false;
  }
  return false;
}

function isBlockedScript(entry: PluginExportAssetRef): boolean {
  const handle = entry.handle ?? "";
  if (BLOCKED_SCRIPT_HANDLES.has(handle)) return true;
  if (handle.includes("admin")) return true;
  // Editor vendor React is not a design asset for the migrated frontend.
  if (/^(react|react-dom|react-jsx-runtime|wp-element)$/i.test(handle)) return true;
  if (/^(jquery|jquery-core|jquery-migrate)$/i.test(handle)) return false;
  const src = entry.src ?? "";
  if (/wp-includes\/js\/jquery\//i.test(src) || /wp-includes\/js\/jquery\//i.test(entry.bundlePath ?? "")) {
    return false;
  }
  // Other wp-includes scripts (wp-i18n, etc.) are not required for static design.
  if (/wp-includes\//i.test(src) || /\/wp-includes\//i.test(entry.bundlePath ?? "")) return true;
  return false;
}

function emptyKindSummary(): AssetKindSummary {
  return {
    declared: 0,
    present: 0,
    missing: 0,
    inlineOnly: 0,
    noBundlePath: 0,
    blocked: 0,
    bytesPresent: 0,
    bytesMissingKnown: 0,
  };
}

function emptyHrefSummary(): HrefSummary {
  return { referenced: 0, present: 0, missing: 0, bytesPresent: 0 };
}

function resolveAssetRoots(slug: string): {
  dataDir: string;
  projectDir: string;
  publicDir: string;
  assetsDir: string;
} {
  const dataDir = getMigratedDataDir(slug);
  const projectDir = getProjectDir(slug);
  const publicDir = path.join(projectDir, "public");
  const assetsDir = path.join(publicDir, "assets");
  return { dataDir, projectDir, publicDir, assetsDir };
}

/** Map bundlePath / href → absolute file path under public or public/assets. */
function resolveOnDisk(
  roots: ReturnType<typeof resolveAssetRoots>,
  ref: string | null | undefined,
): { diskPath: string | null; present: boolean; bytes: number | null } {
  if (!ref) return { diskPath: null, present: false, bytes: null };

  let rel = ref.trim();
  if (rel.startsWith("/assets/")) rel = rel.slice("/assets/".length);
  else if (rel.startsWith("assets/")) rel = rel.slice("assets/".length);
  else if (rel.startsWith("/")) rel = rel.replace(/^\//, "");

  const candidates = [
    path.join(roots.assetsDir, rel),
    path.join(roots.publicDir, rel),
    path.join(roots.dataDir, "assets", rel),
    // Import may still hold files under data/ without the assets/ prefix strip.
    path.join(roots.dataDir, rel),
  ];

  for (const diskPath of candidates) {
    try {
      if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
        return { diskPath, present: true, bytes: fs.statSync(diskPath).size };
      }
    } catch {
      /* next */
    }
  }

  return { diskPath: candidates[0] ?? null, present: false, bytes: null };
}

function auditManifestEntry(
  kind: AssetKind,
  entry: PluginExportAssetRef,
  roots: ReturnType<typeof resolveAssetRoots>,
): AssetEntryAudit {
  const handle = entry.handle ?? "(unnamed)";
  const src = entry.src ?? null;
  const bundlePath = entry.bundlePath ?? null;
  const bundleInline = entry.bundleInline ?? null;
  const blocked = kind === "style" ? isBlockedStyle(entry) : isBlockedScript(entry);
  const hasInline =
    Boolean(bundleInline) ||
    Boolean(entry.inlineAfter?.trim()) ||
    Boolean(entry.inlineBefore?.trim());
  const inlineOnly = !src && !bundlePath && hasInline;

  if (blocked) {
    return {
      kind,
      handle,
      src,
      bundlePath,
      bundleInline,
      diskPath: null,
      present: false,
      bytes: null,
      reason: null,
      blocked: true,
      inlineOnly: false,
    };
  }

  if (inlineOnly) {
    const inlineCheck = bundleInline
      ? resolveOnDisk(roots, bundleInline)
      : { diskPath: null, present: true, bytes: entry.inlineAfter?.length ?? entry.inlineBefore?.length ?? 0 };
    return {
      kind,
      handle,
      src,
      bundlePath,
      bundleInline,
      diskPath: inlineCheck.diskPath,
      present: inlineCheck.present,
      bytes: inlineCheck.bytes,
      reason: inlineCheck.present || !bundleInline ? null : "file-missing",
      blocked: false,
      inlineOnly: true,
    };
  }

  if (bundlePath || bundleInline) {
    const primary = resolveOnDisk(roots, bundlePath ?? bundleInline);
    if (primary.present) {
      return {
        kind,
        handle,
        src,
        bundlePath,
        bundleInline,
        diskPath: primary.diskPath,
        present: true,
        bytes: primary.bytes,
        reason: null,
        blocked: false,
        inlineOnly: false,
      };
    }
    // Fall back: src rewritten under /assets/wp-content|wp-includes
    if (src) {
      const fromSrc = resolveOnDisk(roots, src.replace(/^https?:\/\/[^/]+/i, ""));
      if (fromSrc.present) {
        return {
          kind,
          handle,
          src,
          bundlePath,
          bundleInline,
          diskPath: fromSrc.diskPath,
          present: true,
          bytes: fromSrc.bytes,
          reason: null,
          blocked: false,
          inlineOnly: false,
        };
      }
    }
    return {
      kind,
      handle,
      src,
      bundlePath,
      bundleInline,
      diskPath: primary.diskPath,
      present: false,
      bytes: null,
      reason: "file-missing",
      blocked: false,
      inlineOnly: false,
    };
  }

  // Declared with remote src but plugin never copied a file — plugin gap.
  if (src) {
    const fromSrc = resolveOnDisk(roots, src.replace(/^https?:\/\/[^/]+/i, ""));
    if (fromSrc.present) {
      return {
        kind,
        handle,
        src,
        bundlePath,
        bundleInline,
        diskPath: fromSrc.diskPath,
        present: true,
        bytes: fromSrc.bytes,
        reason: null,
        blocked: false,
        inlineOnly: false,
      };
    }
    return {
      kind,
      handle,
      src,
      bundlePath,
      bundleInline,
      diskPath: fromSrc.diskPath,
      present: false,
      bytes: null,
      reason: "no-bundle-path",
      blocked: false,
      inlineOnly: false,
    };
  }

  // Empty entry — treat as inline-only placeholder.
  return {
    kind,
    handle,
    src,
    bundlePath,
    bundleInline,
    diskPath: null,
    present: true,
    bytes: 0,
    reason: null,
    blocked: false,
    inlineOnly: true,
  };
}

function summarizeEntries(entries: AssetEntryAudit[]): AssetKindSummary {
  const s = emptyKindSummary();
  for (const e of entries) {
    s.declared += 1;
    if (e.blocked) {
      s.blocked += 1;
      continue;
    }
    if (e.inlineOnly && e.present) {
      s.inlineOnly += 1;
      s.present += 1;
      s.bytesPresent += e.bytes ?? 0;
      continue;
    }
    if (e.present) {
      s.present += 1;
      s.bytesPresent += e.bytes ?? 0;
    } else {
      s.missing += 1;
      if (e.reason === "no-bundle-path") s.noBundlePath += 1;
    }
  }
  return s;
}

function summarizeHrefs(entries: HrefAudit[]): HrefSummary {
  const s = emptyHrefSummary();
  for (const e of entries) {
    s.referenced += 1;
    if (e.present) {
      s.present += 1;
      s.bytesPresent += e.bytes ?? 0;
    } else {
      s.missing += 1;
    }
  }
  return s;
}

function readAssetManifest(dataDir: string): {
  stylesheets: PluginExportAssetRef[];
  scripts: PluginExportAssetRef[];
} {
  const candidates = [
    path.join(dataDir, "assets", "manifest.json"),
    path.join(dataDir, "manifest.json"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
        stylesheets?: PluginExportAssetRef[];
        scripts?: PluginExportAssetRef[];
        assets?: { stylesheets?: PluginExportAssetRef[]; scripts?: PluginExportAssetRef[] };
      };
      if (Array.isArray(raw.stylesheets) || Array.isArray(raw.scripts)) {
        return {
          stylesheets: raw.stylesheets ?? [],
          scripts: raw.scripts ?? [],
        };
      }
      if (raw.assets) {
        return {
          stylesheets: raw.assets.stylesheets ?? [],
          scripts: raw.assets.scripts ?? [],
        };
      }
    } catch {
      /* next */
    }
  }
  return { stylesheets: [], scripts: [] };
}

function readSiteCanvas(projectDir: string): {
  pageBuilder: string | null;
  styles: Array<{ href: string; pageKey?: string }>;
  scripts: Array<{ href: string; pageKey?: string }>;
} {
  const sitePath = path.join(projectDir, "src", "data", "site.json");
  if (!fs.existsSync(sitePath)) {
    return { pageBuilder: null, styles: [], scripts: [] };
  }
  try {
    const site = JSON.parse(fs.readFileSync(sitePath, "utf8")) as {
      pageBuilder?: string;
      canvasStyles?: string[];
      canvasScripts?: string[];
      pages?: Array<{
        key?: string;
        canvasStyles?: string[];
        canvasScripts?: string[];
      }>;
    };
    const styles: Array<{ href: string; pageKey?: string }> = [];
    const scripts: Array<{ href: string; pageKey?: string }> = [];
    const pushUnique = (
      list: Array<{ href: string; pageKey?: string }>,
      href: string,
      pageKey?: string,
    ) => {
      if (!href || list.some((x) => x.href === href)) return;
      list.push({ href, pageKey });
    };
    for (const href of site.canvasStyles ?? []) pushUnique(styles, href);
    for (const href of site.canvasScripts ?? []) pushUnique(scripts, href);
    for (const page of site.pages ?? []) {
      for (const href of page.canvasStyles ?? []) pushUnique(styles, href, page.key);
      for (const href of page.canvasScripts ?? []) pushUnique(scripts, href, page.key);
    }
    return {
      pageBuilder: site.pageBuilder ?? null,
      styles,
      scripts,
    };
  } catch {
    return { pageBuilder: null, styles: [], scripts: [] };
  }
}

/** Collect /assets/...css|js references from exported / rendered HTML. */
function collectHtmlAssetHrefs(dataDir: string, projectDir: string): HrefAudit[] {
  const files: string[] = [];
  const walk = (dir: string, depth = 0) => {
    if (!fs.existsSync(dir) || depth > 6) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".git") continue;
        walk(full, depth + 1);
      } else if (/\.(html|htm)$/i.test(name) || name === "rendered.html") {
        files.push(full);
      }
    }
  };
  walk(path.join(dataDir, "pages"));
  walk(path.join(projectDir, "data", "pages"));

  const hrefs = new Map<string, { kind: AssetKind; pageKey?: string }>();
  const attrRe = /(?:href|src)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']/gi;
  const urlRe = /url\(\s*['"]?([^'"\s)]+\.(?:css|js))/gi;

  for (const file of files) {
    let html = "";
    try {
      html = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const pageKey = path.basename(path.dirname(file));
    const collect = (re: RegExp) => {
      re.lastIndex = 0;
      for (const match of html.matchAll(re)) {
        const raw = (match[1] || "").split("?")[0];
        if (!raw) continue;
        if (!/\/assets\/|\/wp-content\/|\/wp-includes\//i.test(raw) && !raw.startsWith("/")) {
          continue;
        }
        if (/^https?:\/\//i.test(raw) && !/\/wp-content\/|\/wp-includes\/|\/assets\//i.test(raw)) {
          continue;
        }
        const kind: AssetKind = /\.css$/i.test(raw) ? "style" : "script";
        if (!hrefs.has(raw)) hrefs.set(raw, { kind, pageKey });
      }
    };
    collect(attrRe);
    collect(urlRe);
  }

  return [...hrefs.entries()].map(([href, meta]) => {
    const roots = {
      dataDir,
      projectDir,
      publicDir: path.join(projectDir, "public"),
      assetsDir: path.join(projectDir, "public", "assets"),
    };
    const disk = resolveOnDisk(roots, href.replace(/^https?:\/\/[^/]+/i, ""));
    return {
      href,
      kind: meta.kind,
      source: "html" as const,
      pageKey: meta.pageKey,
      present: disk.present,
      bytes: disk.bytes,
      diskPath: disk.diskPath,
      reason: disk.present ? null : ("html-href-missing" as const),
    };
  });
}

function buildGuardrail(
  summary: AssetFidelityReport["summary"],
  opts: AuditOptions,
): AssetFidelityGuardrail {
  // Strict by default: any missing design CSS/canvas CSS fails the guardrail.
  // Scripts stay slightly looser (blocked admin vendors don't count as missing).
  const maxMissingStyles = opts.maxMissingStyles ?? Number(process.env.ASSET_AUDIT_MAX_MISSING_STYLES ?? 0);
  const maxMissingScripts = opts.maxMissingScripts ?? Number(process.env.ASSET_AUDIT_MAX_MISSING_SCRIPTS ?? 0);
  const maxMissingCanvasStyles =
    opts.maxMissingCanvasStyles ?? Number(process.env.ASSET_AUDIT_MAX_MISSING_CANVAS_STYLES ?? 0);
  const maxMissingCanvasScripts =
    opts.maxMissingCanvasScripts ?? Number(process.env.ASSET_AUDIT_MAX_MISSING_CANVAS_SCRIPTS ?? 0);
  const ratioEnv = process.env.ASSET_AUDIT_MAX_MISSING_STYLE_RATIO;
  const maxMissingStyleRatio =
    opts.maxMissingStyleRatio !== undefined
      ? opts.maxMissingStyleRatio
      : ratioEnv != null && ratioEnv !== ""
        ? Number(ratioEnv)
        : 0;

  const failures: string[] = [];
  if (summary.styles.missing > maxMissingStyles) {
    failures.push(`styles missing ${summary.styles.missing} > cap ${maxMissingStyles}`);
  }
  if (summary.scripts.missing > maxMissingScripts) {
    failures.push(`scripts missing ${summary.scripts.missing} > cap ${maxMissingScripts}`);
  }
  if (summary.canvasStyles.missing > maxMissingCanvasStyles) {
    failures.push(
      `canvasStyles missing ${summary.canvasStyles.missing} > cap ${maxMissingCanvasStyles}`,
    );
  }
  if (summary.canvasScripts.missing > maxMissingCanvasScripts) {
    failures.push(
      `canvasScripts missing ${summary.canvasScripts.missing} > cap ${maxMissingCanvasScripts}`,
    );
  }
  if (maxMissingStyleRatio != null && summary.styles.declared > 0) {
    const actionable = summary.styles.declared - summary.styles.blocked;
    if (actionable > 0) {
      const ratio = summary.styles.missing / actionable;
      if (ratio > maxMissingStyleRatio) {
        failures.push(
          `style missing ratio ${(ratio * 100).toFixed(1)}% > cap ${(maxMissingStyleRatio * 100).toFixed(0)}%`,
        );
      }
    }
  }

  return {
    maxMissingStyles,
    maxMissingScripts,
    maxMissingCanvasStyles,
    maxMissingCanvasScripts,
    maxMissingStyleRatio,
    passed: failures.length === 0,
    failures,
  };
}

function topMissingFromReport(report: Omit<AssetFidelityReport, "topMissing" | "guardrail">): AssetFidelityReport["topMissing"] {
  const rows: AssetFidelityReport["topMissing"] = [];
  for (const e of report.missing.styles) {
    rows.push({
      kind: "style",
      handleOrHref: e.handle,
      reason: e.reason ?? "file-missing",
      bytes: e.bytes,
    });
  }
  for (const e of report.missing.scripts) {
    rows.push({
      kind: "script",
      handleOrHref: e.handle,
      reason: e.reason ?? "file-missing",
      bytes: e.bytes,
    });
  }
  for (const e of [...report.missing.canvasStyles, ...report.missing.canvasScripts]) {
    rows.push({
      kind: "canvas",
      handleOrHref: e.href,
      reason: e.reason ?? "canvas-href-missing",
      bytes: e.bytes,
    });
  }
  for (const e of report.missing.htmlRefs) {
    rows.push({
      kind: "html",
      handleOrHref: e.href,
      reason: e.reason ?? "html-href-missing",
      bytes: e.bytes,
    });
  }
  return rows.slice(0, 40);
}

export function runAssetFidelityAudit(opts: AuditOptions): AssetFidelityReport {
  const slug = opts.slug;
  const phase = opts.phase ?? "post-convert";
  const roots = resolveAssetRoots(slug);
  const manifest = readAssetManifest(roots.dataDir);
  const canvas = readSiteCanvas(roots.projectDir);

  const styleEntries = manifest.stylesheets.map((e) => auditManifestEntry("style", e, roots));
  const scriptEntries = manifest.scripts.map((e) => auditManifestEntry("script", e, roots));

  const canvasStyleAudits: HrefAudit[] = canvas.styles.map(({ href, pageKey }) => {
    const disk = resolveOnDisk(roots, href);
    return {
      href,
      kind: "style" as const,
      source: "canvasStyles" as const,
      pageKey,
      present: disk.present,
      bytes: disk.bytes,
      diskPath: disk.diskPath,
      reason: disk.present ? null : ("canvas-href-missing" as const),
    };
  });
  const canvasScriptAudits: HrefAudit[] = canvas.scripts.map(({ href, pageKey }) => {
    const disk = resolveOnDisk(roots, href);
    // Remote CDNs (fonts, jquery) are intentional.
    if (/^https?:\/\//i.test(href) && !/\/wp-content\/|\/wp-includes\/|\/assets\//i.test(href)) {
      return {
        href,
        kind: "script" as const,
        source: "canvasScripts" as const,
        pageKey,
        present: true,
        bytes: null,
        diskPath: null,
        reason: null,
      };
    }
    return {
      href,
      kind: "script" as const,
      source: "canvasScripts" as const,
      pageKey,
      present: disk.present,
      bytes: disk.bytes,
      diskPath: disk.diskPath,
      reason: disk.present ? null : ("canvas-href-missing" as const),
    };
  });

  const htmlRefs = collectHtmlAssetHrefs(roots.dataDir, roots.projectDir);

  const stylesSummary = summarizeEntries(styleEntries);
  const scriptsSummary = summarizeEntries(scriptEntries);
  const canvasStylesSummary = summarizeHrefs(canvasStyleAudits);
  const canvasScriptsSummary = summarizeHrefs(canvasScriptAudits);
  const htmlSummary = summarizeHrefs(htmlRefs);

  const draft = {
    version: 1 as const,
    slug,
    phase,
    generatedAt: new Date().toISOString(),
    pageBuilder: canvas.pageBuilder,
    roots: {
      dataDir: roots.dataDir,
      projectDir: roots.projectDir,
      publicDir: roots.publicDir,
      assetsDir: roots.assetsDir,
    },
    summary: {
      styles: stylesSummary,
      scripts: scriptsSummary,
      canvasStyles: canvasStylesSummary,
      canvasScripts: canvasScriptsSummary,
      htmlRefs: htmlSummary,
      totalMissing:
        stylesSummary.missing +
        scriptsSummary.missing +
        canvasStylesSummary.missing +
        canvasScriptsSummary.missing +
        htmlSummary.missing,
      totalDeclaredAssets: stylesSummary.declared + scriptsSummary.declared,
    },
    missing: {
      styles: styleEntries.filter((e) => !e.blocked && !e.present),
      scripts: scriptEntries.filter((e) => !e.blocked && !e.present),
      canvasStyles: canvasStyleAudits.filter((e) => !e.present),
      canvasScripts: canvasScriptAudits.filter((e) => !e.present),
      htmlRefs: htmlRefs.filter((e) => !e.present),
    },
  };

  const guardrail = buildGuardrail(draft.summary, opts);
  const report: AssetFidelityReport = {
    ...draft,
    guardrail,
    topMissing: topMissingFromReport(draft),
  };

  writeAssetFidelityReport(slug, report, { writeHistory: opts.writeHistory !== false });

  if (opts.failOnGuardrail && !guardrail.passed) {
    throw new Error(
      `Asset fidelity guardrail failed for "${slug}": ${guardrail.failures.join("; ")}`,
    );
  }

  return report;
}

export function writeAssetFidelityReport(
  slug: string,
  report: AssetFidelityReport,
  opts?: { writeHistory?: boolean },
): { reportPath: string; historyPath: string } {
  const dataDir = getMigratedDataDir(slug);
  const auditDir = path.join(dataDir, "audit");
  fs.mkdirSync(auditDir, { recursive: true });

  const reportPath = path.join(auditDir, "asset-fidelity.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const historyPath = path.join(auditDir, "asset-fidelity-history.jsonl");
  if (opts?.writeHistory !== false) {
    const line = JSON.stringify({
      generatedAt: report.generatedAt,
      phase: report.phase,
      pageBuilder: report.pageBuilder,
      summary: report.summary,
      guardrail: {
        passed: report.guardrail.passed,
        failures: report.guardrail.failures,
      },
      topMissing: report.topMissing.slice(0, 15),
    });
    fs.appendFileSync(historyPath, `${line}\n`, "utf8");
  }

  // Global rollup across projects (easy to grep over time).
  // reportPath = output/<slug>/data/audit/asset-fidelity.json → output/
  const outputRoot = path.dirname(path.dirname(path.dirname(path.dirname(reportPath))));
  try {
    const globalHistory = path.join(outputRoot, "asset-fidelity-history.jsonl");
    fs.appendFileSync(
      globalHistory,
      `${JSON.stringify({
        slug,
        generatedAt: report.generatedAt,
        phase: report.phase,
        pageBuilder: report.pageBuilder,
        totalMissing: report.summary.totalMissing,
        stylesMissing: report.summary.styles.missing,
        scriptsMissing: report.summary.scripts.missing,
        canvasStylesMissing: report.summary.canvasStyles.missing,
        canvasScriptsMissing: report.summary.canvasScripts.missing,
        stylesDeclared: report.summary.styles.declared,
        scriptsDeclared: report.summary.scripts.declared,
        bytesPresent: report.summary.styles.bytesPresent + report.summary.scripts.bytesPresent,
        guardrailPassed: report.guardrail.passed,
        failures: report.guardrail.failures,
      })}\n`,
      "utf8",
    );
  } catch {
    /* optional global history */
  }

  return { reportPath, historyPath };
}

export function formatAssetFidelitySummary(report: AssetFidelityReport): string {
  const { summary: s, guardrail: g } = report;
  const lines = [
    `Asset fidelity [${report.slug}] phase=${report.phase} builder=${report.pageBuilder ?? "?"}`,
    `  styles:   declared=${s.styles.declared} present=${s.styles.present} missing=${s.styles.missing} (noBundlePath=${s.styles.noBundlePath}, blocked=${s.styles.blocked}, inline=${s.styles.inlineOnly}) bytes=${s.styles.bytesPresent}`,
    `  scripts:  declared=${s.scripts.declared} present=${s.scripts.present} missing=${s.scripts.missing} (noBundlePath=${s.scripts.noBundlePath}, blocked=${s.scripts.blocked}) bytes=${s.scripts.bytesPresent}`,
    `  canvas:   styles ${s.canvasStyles.present}/${s.canvasStyles.referenced} ok (missing=${s.canvasStyles.missing}); scripts ${s.canvasScripts.present}/${s.canvasScripts.referenced} ok (missing=${s.canvasScripts.missing})`,
    `  htmlRefs: ${s.htmlRefs.present}/${s.htmlRefs.referenced} ok (missing=${s.htmlRefs.missing})`,
    `  totalMissing=${s.totalMissing}  guardrail=${g.passed ? "PASS" : "FAIL"}`,
  ];
  if (!g.passed) {
    for (const f of g.failures) lines.push(`    - ${f}`);
  }
  if (report.topMissing.length) {
    lines.push("  top missing:");
    for (const row of report.topMissing.slice(0, 10)) {
      lines.push(`    - [${row.kind}] ${row.handleOrHref} (${row.reason})`);
    }
  }
  return lines.join("\n");
}

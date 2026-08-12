import fs from "node:fs";
import path from "node:path";
import { SITES_ROOT } from "../../lib/wp/sites";

export type JobStatus = "pending" | "running" | "done" | "failed";
export type EditorStatus = "stopped" | "starting" | "running";

export type SourceType = "url" | "files" | "plugin";

export interface StudioMeta {
  slug: string;
  name: string;
  sourceType: SourceType;
  url?: string;
  scrapeStatus: JobStatus;
  generateStatus: JobStatus;
  editorStatus: EditorStatus;
  editorPort?: number;
  editorPid?: number;
  hasDbDump?: boolean;
  hasWpContent?: boolean;
  hasWpConfig?: boolean;
  hasPluginExport?: boolean;
  uploadedFiles?: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

function metaPath(slug: string): string {
  return path.join(SITES_ROOT, slug, "studio.json");
}

/** True when the site folder exists and is readable (not a broken junction). */
export function isSiteDirHealthy(slug: string): boolean {
  const dir = path.join(SITES_ROOT, slug);
  if (!fs.existsSync(dir)) return false;
  try {
    fs.readdirSync(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure `sites/<slug>` is a writable real directory.
 * Removes broken Windows junctions (ENOENT on mkdir/readdir) before creating.
 */
export function ensureSiteDir(slug: string): string {
  const dir = path.join(SITES_ROOT, slug);
  fs.mkdirSync(SITES_ROOT, { recursive: true });

  if (fs.existsSync(dir) && !isSiteDirHealthy(slug)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readStudioMeta(slug: string): StudioMeta | null {
  if (!isSiteDirHealthy(slug)) return null;
  const file = metaPath(slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StudioMeta;
  } catch {
    return null;
  }
}

export function writeStudioMeta(meta: StudioMeta): void {
  ensureSiteDir(meta.slug);
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(meta.slug), JSON.stringify(meta, null, 2), "utf8");
}

export function createStudioMeta(opts: {
  slug: string;
  name: string;
  sourceType: SourceType;
  url?: string;
}): StudioMeta {
  const now = new Date().toISOString();
  const meta: StudioMeta = {
    slug: opts.slug,
    name: opts.name,
    sourceType: opts.sourceType,
    url: opts.url,
    scrapeStatus: opts.sourceType === "files" ? "pending" : "pending",
    generateStatus: "pending",
    editorStatus: "stopped",
    createdAt: now,
    updatedAt: now,
  };
  writeStudioMeta(meta);
  return meta;
}

export function patchStudioMeta(slug: string, patch: Partial<StudioMeta>): StudioMeta {
  const current = readStudioMeta(slug) ?? createStudioMeta({
    slug,
    name: slug,
    sourceType: "url",
  });
  const next = { ...current, ...patch, slug };
  writeStudioMeta(next);
  return next;
}

export function getImportDir(slug: string): string {
  return path.join(ensureSiteDir(slug), "import");
}

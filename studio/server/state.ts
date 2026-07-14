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

export function readStudioMeta(slug: string): StudioMeta | null {
  const file = metaPath(slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StudioMeta;
  } catch {
    return null;
  }
}

export function writeStudioMeta(meta: StudioMeta): void {
  const dir = path.join(SITES_ROOT, meta.slug);
  fs.mkdirSync(dir, { recursive: true });
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
  return path.join(SITES_ROOT, slug, "import");
}

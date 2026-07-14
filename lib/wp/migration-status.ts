import fs from "node:fs";
import path from "node:path";
import { SITES_ROOT } from "./sites";

export interface MigrationProgress {
  done: number;
  total: number;
}

export interface MigrationStatus {
  slug: string;
  phase: string;
  updatedAt: string;
  progress?: MigrationProgress;
}

function statusPath(slug: string): string {
  return path.join(SITES_ROOT, slug, "status.json");
}

export function setMigrationPhase(slug: string, phase: string): void {
  setMigrationProgress(slug, phase);
}

export function setMigrationProgress(
  slug: string,
  phase: string,
  progress?: MigrationProgress,
): void {
  const dir = path.join(SITES_ROOT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const status: MigrationStatus = {
    slug,
    phase,
    updatedAt: new Date().toISOString(),
    ...(progress ? { progress } : {}),
  };
  fs.writeFileSync(statusPath(slug), JSON.stringify(status, null, 2), "utf8");
}

export function readMigrationStatus(slug: string): MigrationStatus | null {
  const file = statusPath(slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as MigrationStatus;
  } catch {
    return null;
  }
}

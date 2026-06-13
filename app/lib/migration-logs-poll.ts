/** Client-safe helpers for migration log polling (no server/fs imports). */

export type MigrationLogSiteEntry = {
  slug: string;
  url: string;
  name: string;
  migratedAt?: string;
  status: "ready" | "migrating" | "failed";
  stage?: "landing" | "converted" | "full";
  routes?: number;
  pageBuilder?: string;
  error?: string;
};

export type MigrationLogsPayload = {
  logs: string;
  entry: MigrationLogSiteEntry | null;
  phase: string | null;
  progress: { done: number; total: number } | null;
  hasData: boolean;
};

export function migrationLogsPollPath(slug: string): string {
  return `/api/migrate/${slug}/logs`;
}

import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "@/api/wp/config";
import type {
  PuckConversionMeta,
  PuckPageData,
  PuckSiteDatabase,
} from "./wp-migration-types";

export function getPuckDatabasePath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "puck", "database.json");
}

export function loadPuckPage(
  siteSlug: string,
  routePath: string,
): PuckPageData | null {
  const file = getPuckDatabasePath(siteSlug);
  if (!fs.existsSync(file)) return null;
  const db = JSON.parse(fs.readFileSync(file, "utf8")) as PuckSiteDatabase;
  return db[routePath] ?? null;
}

export function loadPuckDatabase(siteSlug: string): PuckSiteDatabase | null {
  const file = getPuckDatabasePath(siteSlug);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PuckSiteDatabase;
}

export function loadPuckMeta(siteSlug: string): PuckConversionMeta | null {
  const file = path.join(getMigratedDataDir(siteSlug), "puck", "meta.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PuckConversionMeta;
}

export function hasPuckDatabase(siteSlug: string): boolean {
  return fs.existsSync(getPuckDatabasePath(siteSlug));
}

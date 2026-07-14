import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";
import type { MigrationManifest, StylesManifest, WpPost } from "./types";

function readJson<T>(filename: string, siteSlug?: string): T | null {
  const file = path.join(getMigratedDataDir(siteSlug), filename);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function getManifest(siteSlug?: string): MigrationManifest | null {
  return readJson<MigrationManifest>("manifest.json", siteSlug);
}

export function getStyles(siteSlug?: string): StylesManifest | null {
  return readJson<StylesManifest>("styles.json", siteSlug);
}

export function findPostBySlug(
  slug: string,
  type: "page" | "post",
  siteSlug?: string,
): WpPost | undefined {
  const manifest = getManifest(siteSlug);
  if (!manifest) return undefined;
  const list = type === "page" ? manifest.pages : manifest.posts;
  return list.find((p) => p.slug === slug);
}

export function getRoutePaths(siteSlug?: string): string[] {
  const manifest = getManifest(siteSlug);
  if (!manifest) return ["/"];
  return manifest.routes.map((r) => r.path);
}

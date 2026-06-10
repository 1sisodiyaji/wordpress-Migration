import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";

export type FontRegistryMap = Record<string, string>;

function registryPath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "font-registry.json");
}

export function loadFontRegistry(siteSlug: string): FontRegistryMap {
  const file = registryPath(siteSlug);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as FontRegistryMap;
}

export function saveFontRegistry(
  siteSlug: string,
  registry: Map<string, string> | FontRegistryMap,
): void {
  const dir = getMigratedDataDir(siteSlug);
  fs.mkdirSync(dir, { recursive: true });
  const obj =
    registry instanceof Map ? Object.fromEntries(registry.entries()) : registry;
  fs.writeFileSync(registryPath(siteSlug), JSON.stringify(obj, null, 2), "utf8");
}

export function mergeFontRegistry(
  siteSlug: string,
  entries: Map<string, string>,
): FontRegistryMap {
  const merged = { ...loadFontRegistry(siteSlug), ...Object.fromEntries(entries) };
  saveFontRegistry(siteSlug, merged);
  return merged;
}

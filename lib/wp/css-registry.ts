import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";

export type CssRegistryMap = Record<string, string>;

function registryPath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "css-registry.json");
}

export function loadCssRegistry(siteSlug: string): CssRegistryMap {
  const file = registryPath(siteSlug);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as CssRegistryMap;
}

export function saveCssRegistry(
  siteSlug: string,
  registry: Map<string, string> | CssRegistryMap,
): void {
  const dir = getMigratedDataDir(siteSlug);
  fs.mkdirSync(dir, { recursive: true });
  const obj =
    registry instanceof Map ? Object.fromEntries(registry.entries()) : registry;
  fs.writeFileSync(registryPath(siteSlug), JSON.stringify(obj, null, 2), "utf8");
}

export function mergeCssRegistry(
  siteSlug: string,
  entries: Map<string, string>,
): CssRegistryMap {
  const merged = { ...loadCssRegistry(siteSlug), ...Object.fromEntries(entries) };
  saveCssRegistry(siteSlug, merged);
  return merged;
}

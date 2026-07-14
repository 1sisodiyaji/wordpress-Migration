import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";

export type JsRegistryMap = Record<string, string>;

function registryPath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "js-registry.json");
}

export function loadJsRegistry(siteSlug: string): JsRegistryMap {
  const file = registryPath(siteSlug);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as JsRegistryMap;
}

export function saveJsRegistry(
  siteSlug: string,
  registry: Map<string, string> | JsRegistryMap,
): void {
  const dir = getMigratedDataDir(siteSlug);
  fs.mkdirSync(dir, { recursive: true });
  const obj =
    registry instanceof Map ? Object.fromEntries(registry.entries()) : registry;
  fs.writeFileSync(registryPath(siteSlug), JSON.stringify(obj, null, 2), "utf8");
}

export function mergeJsRegistry(
  siteSlug: string,
  entries: Map<string, string>,
): JsRegistryMap {
  const merged = { ...loadJsRegistry(siteSlug), ...Object.fromEntries(entries) };
  saveJsRegistry(siteSlug, merged);
  return merged;
}

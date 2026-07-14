import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";

export interface ElementorAssetsManifest {
  fetchedAt: string;
  sourceUrl: string;
  stylesheets: string[];
  scripts: Array<{ src: string; id?: string }>;
  inlineScripts: Array<{ id?: string; content: string; type?: string }>;
  documentIds: number[];
  kitCssPaths: string[];
}

export function getElementorAssets(siteSlug?: string): ElementorAssetsManifest | null {
  const file = path.join(getMigratedDataDir(siteSlug), "elementor", "assets.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ElementorAssetsManifest;
}

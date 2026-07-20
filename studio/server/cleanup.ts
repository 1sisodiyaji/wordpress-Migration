import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "../../generator/lib/scaffold";
import { getSitePublicDir, readRegistry, SITES_ROOT, writeRegistry } from "../../lib/wp/sites";
import { stopEditor, stopScrape } from "./jobs";

export interface DeleteProjectResult {
  slug: string;
  removed: {
    site: boolean;
    publicAssets: boolean;
    project: boolean;
    registry: boolean;
  };
}

function removeIfExists(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Stop jobs and remove all on-disk data for a project (sites + projects). */
export function deleteProjectCompletely(slug: string): DeleteProjectResult {
  stopScrape(slug);
  stopEditor(slug, { skipMeta: true });

  const hadRegistry = readRegistry().some((s) => s.slug === slug);
  if (hadRegistry) {
    writeRegistry(readRegistry().filter((s) => s.slug !== slug));
  }

  return {
    slug,
    removed: {
      site: removeIfExists(path.join(SITES_ROOT, slug)),
      publicAssets: removeIfExists(getSitePublicDir(slug)),
      project: removeIfExists(getProjectDir(slug)),
      registry: hadRegistry,
    },
  };
}

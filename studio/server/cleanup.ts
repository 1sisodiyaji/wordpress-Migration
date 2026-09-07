import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "../../generator/lib/scaffold";
import { rmPathSafe } from "../../generator/lib/fs-clean";
import {
  killDevPort,
  killProcessesUsingPath,
  readProjectDevPort,
} from "../../lib/kill-dev-port";
import { getSitePublicDir, readRegistry, SITES_ROOT, writeRegistry } from "../../lib/wp/sites";
import { stopEditor, stopScrape } from "./jobs";
import { readStudioMeta } from "./state";

export interface DeleteProjectResult {
  slug: string;
  removed: {
    site: boolean;
    publicAssets: boolean;
    project: boolean;
    registry: boolean;
  };
  warning?: string;
}

function removeIfExists(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  rmPathSafe(dir);
  // Windows may leave an empty locked shell; try once more after a short wait.
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    } catch {
      /* still locked — caller may report partial delete */
    }
  }
  return !fs.existsSync(dir);
}

/** Stop jobs and remove all on-disk data for a project (sites + projects). */
export async function deleteProjectCompletely(slug: string): Promise<DeleteProjectResult> {
  stopScrape(slug);
  stopEditor(slug, { skipMeta: true });

  const projectDir = getProjectDir(slug);
  const meta = readStudioMeta(slug);
  const ports = new Set<number>();
  if (meta?.editorPort) ports.add(meta.editorPort);
  if (fs.existsSync(projectDir)) ports.add(readProjectDevPort(projectDir));

  // Kill anything still holding the project folder (orphaned Vite after Studio restart).
  if (fs.existsSync(projectDir)) {
    await killProcessesUsingPath(projectDir);
  }

  for (const port of ports) {
    await killDevPort(port);
  }

  // Give Windows a beat to release directory handles after process kill.
  await new Promise((r) => setTimeout(r, 800));

  // Retry path kill once more if folder still present before rm.
  if (fs.existsSync(projectDir)) {
    await killProcessesUsingPath(projectDir);
    await new Promise((r) => setTimeout(r, 300));
  }

  const hadRegistry = readRegistry().some((s) => s.slug === slug);
  if (hadRegistry) {
    writeRegistry(readRegistry().filter((s) => s.slug !== slug));
  }

  const removed = {
    site: removeIfExists(path.join(SITES_ROOT, slug)),
    publicAssets: removeIfExists(getSitePublicDir(slug)),
    project: removeIfExists(projectDir),
    registry: hadRegistry,
  };

  const leftovers: string[] = [];
  if (fs.existsSync(path.join(SITES_ROOT, slug))) leftovers.push(`sites/${slug}`);
  if (fs.existsSync(projectDir)) leftovers.push(`projects/${slug}`);

  return {
    slug,
    removed,
    warning:
      leftovers.length > 0
        ? `Some files are still locked (${leftovers.join(", ")}). Close the editor tab and retry delete.`
        : undefined,
  };
}

import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "../../Converter/lib/scaffold";
import { rmPathSafe } from "../../Converter/lib/fs-clean";
import {
  killDevPort,
  killProcessesUsingPath,
  readProjectDevPort,
} from "../../Converter/shared/kill-dev-port";
import { readRegistry, writeRegistry } from "../../Converter/shared/wp/sites";
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
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    } catch {
      /* still locked — caller may report partial delete */
    }
  }
  return !fs.existsSync(dir);
}

/** Stop jobs and remove Projects/{slug} (data + generated app). */
export async function deleteProjectCompletely(slug: string): Promise<DeleteProjectResult> {
  stopScrape(slug);
  stopEditor(slug, { skipMeta: true });

  const projectDir = getProjectDir(slug);
  const meta = readStudioMeta(slug);
  const ports = new Set<number>();
  if (meta?.editorPort) ports.add(meta.editorPort);
  if (fs.existsSync(projectDir)) ports.add(readProjectDevPort(projectDir));

  if (fs.existsSync(projectDir)) {
    await killProcessesUsingPath(projectDir);
  }

  for (const port of ports) {
    await killDevPort(port);
  }

  await new Promise((r) => setTimeout(r, 800));

  if (fs.existsSync(projectDir)) {
    await killProcessesUsingPath(projectDir);
    await new Promise((r) => setTimeout(r, 300));
  }

  const hadRegistry = readRegistry().some((s) => s.slug === slug);
  if (hadRegistry) {
    writeRegistry(readRegistry().filter((s) => s.slug !== slug));
  }

  const gone = removeIfExists(projectDir);

  return {
    slug,
    removed: {
      site: gone,
      publicAssets: gone,
      project: gone,
      registry: hadRegistry,
    },
    warning: fs.existsSync(projectDir)
      ? `Some files are still locked (Projects/${slug}). Close the editor tab and retry delete.`
      : undefined,
  };
}

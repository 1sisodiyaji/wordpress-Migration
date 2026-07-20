import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "../../generator/lib/scaffold";
import { assertValidAppTsx } from "../../generator/lib/app-shell-template";
import { initMigrationLog } from "../../lib/wp/migration-log";
import { upsertSite, normalizeWordPressUrl } from "../../lib/wp/sites";
import { importLocalSource } from "../../scraper/import-local";
import { importPluginExport } from "../../lib/wp-import/import-plugin-export";
import {
  explainWpAuthFailure,
  isLocalWpUrl,
  normalizeWpAppPassword,
  parseWpRestError,
  resolveWpRestBase,
  wpRestEndpoint,
  type WpWhoAmI,
} from "../../lib/wp-import/plugin-rest";
import { patchStudioMeta, getImportDir, readStudioMeta, type StudioMeta } from "./state";

const ROOT = process.cwd();
const scrapeProcesses = new Map<string, ChildProcess>();
const editorProcesses = new Map<string, ChildProcess>();
const usedPorts = new Set<number>();

const EDITOR_PORT_START = 3001;

function allocatePort(): number {
  let port = EDITOR_PORT_START;
  while (usedPorts.has(port)) port += 1;
  usedPorts.add(port);
  return port;
}

function releasePort(port: number | undefined): void {
  if (port) usedPorts.delete(port);
}

export function isScrapeRunning(slug: string): boolean {
  return scrapeProcesses.has(slug);
}

export function isEditorRunning(slug: string): boolean {
  return editorProcesses.has(slug);
}

export async function runScrapeFromUrl(slug: string, url: string): Promise<void> {
  if (scrapeProcesses.has(slug)) {
    throw new Error("Scrape already running");
  }

  const normalized = normalizeWordPressUrl(url);
  initMigrationLog(slug, normalized);
  upsertSite({ slug, url: normalized, name: new URL(normalized).hostname, status: "migrating" });
  patchStudioMeta(slug, { scrapeStatus: "running", error: undefined, url: normalized });

  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["scrape", "--", "--url", normalized, "--site", slug, "--all"],
      { cwd: ROOT, shell: true, env: { ...process.env, SITE_SLUG: slug, WORDPRESS_URL: normalized } },
    );

    scrapeProcesses.set(slug, child);

    child.on("exit", (code) => {
      scrapeProcesses.delete(slug);
      if (code === 0) {
        patchStudioMeta(slug, { scrapeStatus: "done" });
        resolve();
      } else {
        patchStudioMeta(slug, { scrapeStatus: "failed", error: `Scrape exited with code ${code}` });
        reject(new Error(`Scrape failed (code ${code})`));
      }
    });

    child.on("error", (err) => {
      scrapeProcesses.delete(slug);
      patchStudioMeta(slug, { scrapeStatus: "failed", error: err.message });
      reject(err);
    });
  });
}

export async function runImportFromFiles(slug: string, name: string): Promise<void> {
  const importDir = getImportDir(slug);
  if (!fs.existsSync(importDir)) {
    throw new Error("No files uploaded yet");
  }

  patchStudioMeta(slug, { scrapeStatus: "running", error: undefined });

  try {
    await importLocalSource({ importPath: importDir, siteSlug: slug, name });
    patchStudioMeta(slug, { scrapeStatus: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message });
    throw err;
  }
}

export async function runImportFromPluginExport(
  slug: string,
  name: string,
  source: string,
): Promise<void> {
  patchStudioMeta(slug, { scrapeStatus: "running", error: undefined, sourceType: "plugin" });

  try {
    await importPluginExport({ source, siteSlug: slug, name });
    patchStudioMeta(slug, { scrapeStatus: "done", hasPluginExport: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message });
    throw err;
  }
}

export async function runPullFromPluginRest(
  slug: string,
  name: string,
  opts: { wpUrl: string; username: string; appPassword: string; copyMedia: boolean },
): Promise<void> {
  patchStudioMeta(slug, { scrapeStatus: "running", error: undefined, sourceType: "plugin" });

  try {
    const base = opts.wpUrl.replace(/\/+$/, "");
    const password = normalizeWpAppPassword(opts.appPassword);
    const auth = "Basic " + Buffer.from(`${opts.username}:${password}`).toString("base64");
    const restBase = await resolveWpRestBase(base);
    const local = isLocalWpUrl(base);

    // Probe auth before running a long export so errors are actionable.
    const whoamiUrl = wpRestEndpoint(restBase, "/wp-grape-export/v1/whoami");
    const whoamiRes = await fetch(whoamiUrl, { headers: { Authorization: auth } });
    const whoami = (await whoamiRes.json().catch(() => null)) as WpWhoAmI | null;
    if (whoami && whoami.ok !== false && (!whoami.loggedIn || !whoami.canExport)) {
      throw new Error(`Remote export failed: ${explainWpAuthFailure(whoami, local)}`);
    }
    // Older plugin without /whoami — continue; export will return the usual 401.

    const exportUrl = wpRestEndpoint(restBase, "/wp-grape-export/v1/export");

    // 1. Trigger the export on the remote WordPress.
    const exportRes = await fetch(exportUrl, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ post_types: ["page", "post"], copy_media: opts.copyMedia }),
    });

    const exportData = (await exportRes.json().catch(() => null)) as
      | { ok?: boolean; url?: string; message?: string; code?: string }
      | null;

    if (!exportRes.ok || !exportData?.url) {
      if (exportRes.status === 401 || exportRes.status === 403) {
        throw new Error(
          `Remote export failed: ${exportData?.message ?? explainWpAuthFailure(whoami, local)}`,
        );
      }
      throw new Error(`Remote export failed: ${parseWpRestError(exportRes.status, exportData)}`);
    }

    // 2. Download the generated bundle.
    const zipRes = await fetch(exportData.url, { headers: { Authorization: auth } });
    if (!zipRes.ok) {
      throw new Error(`Failed to download bundle: HTTP ${zipRes.status}`);
    }
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());

    const importDir = getImportDir(slug);
    fs.mkdirSync(importDir, { recursive: true });
    const zipPath = path.join(importDir, "plugin-export.zip");
    fs.writeFileSync(zipPath, zipBuffer);

    // 3. Import it the same way as an uploaded bundle.
    await importPluginExport({ source: zipPath, siteSlug: slug, name });
    patchStudioMeta(slug, { scrapeStatus: "done", hasPluginExport: true, url: base });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message });
    throw err;
  }
}

export async function runGenerate(slug: string): Promise<StudioMeta> {
  stopEditor(slug);
  patchStudioMeta(slug, { generateStatus: "running", error: undefined });

  try {
    const port = allocatePort();
    // Fresh subprocess so Studio always uses the latest generator on disk (not a cached import).
    await runCmd("pnpm", ["generate", "--", "--site", slug, "--port", String(port)], ROOT);

    const projectDir = getProjectDir(slug);
    const appPath = path.join(projectDir, "src", "App.tsx");
    if (!fs.existsSync(appPath)) {
      throw new Error(`Generate did not create ${appPath}`);
    }
    assertValidAppTsx(fs.readFileSync(appPath, "utf8"));

    await runCmd("pnpm", ["install"], projectDir);

    patchStudioMeta(slug, { generateStatus: "done", editorPort: port });
    return readStudioMeta(slug)!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { generateStatus: "failed", error: message });
    throw err;
  }
}

export async function startEditor(slug: string): Promise<{ port: number; url: string }> {
  const meta = readStudioMeta(slug);
  if (!meta) throw new Error("Project not found");

  const projectDir = getProjectDir(slug);
  if (!fs.existsSync(projectDir)) {
    throw new Error("Generate the GrapeJS project first");
  }

  if (editorProcesses.has(slug)) {
    const port = meta.editorPort ?? EDITOR_PORT_START;
    return { port, url: `http://localhost:${port}` };
  }

  const port = meta.editorPort ?? allocatePort();
  patchStudioMeta(slug, { editorStatus: "starting", editorPort: port });

  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["dev"], {
      cwd: projectDir,
      shell: true,
      env: { ...process.env, PORT: String(port) },
      detached: false,
    });

    editorProcesses.set(slug, child);
    let resolved = false;

    const tryResolve = () => {
      if (resolved) return;
      resolved = true;
      patchStudioMeta(slug, { editorStatus: "running", editorPort: port, editorPid: child.pid });
      resolve({ port, url: `http://localhost:${port}` });
    };

    const timer = setTimeout(tryResolve, 3500);

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("Local:") || text.includes(`localhost:${port}`)) {
        clearTimeout(timer);
        tryResolve();
      }
    });

    child.on("exit", (code) => {
      editorProcesses.delete(slug);
      releasePort(port);
      patchStudioMeta(slug, { editorStatus: "stopped", editorPid: undefined });
      if (!resolved && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Editor server exited (code ${code})`));
      }
    });

    child.on("error", (err) => {
      editorProcesses.delete(slug);
      releasePort(port);
      patchStudioMeta(slug, { editorStatus: "stopped", error: err.message });
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function stopScrape(slug: string): void {
  const child = scrapeProcesses.get(slug);
  if (child) {
    child.kill("SIGTERM");
    scrapeProcesses.delete(slug);
  }
}

export function stopEditor(slug: string, opts: { skipMeta?: boolean } = {}): void {
  const child = editorProcesses.get(slug);
  if (child) {
    child.kill("SIGTERM");
    editorProcesses.delete(slug);
  }
  const meta = readStudioMeta(slug);
  releasePort(meta?.editorPort);
  if (!opts.skipMeta && meta) {
    patchStudioMeta(slug, { editorStatus: "stopped", editorPid: undefined });
  }
}

function runCmd(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

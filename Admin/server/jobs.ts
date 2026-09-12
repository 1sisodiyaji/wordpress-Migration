import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { getProjectsRoot } from "../../Converter/shared/wp/sites";
import { getProjectDir } from "../../Converter/lib/scaffold";
import { assertValidAppTsx } from "../../Converter/lib/app-shell-template";
import { killProcessTree } from "../../Converter/shared/kill-dev-port";
import {
  explainWpAuthFailure,
  isLocalWpUrl,
  normalizeWpAppPassword,
  parseWpRestError,
  resolveWpRestBase,
  wpRestEndpoint,
  type WpWhoAmI,
} from "../../Converter/shared/wp-import/plugin-rest";
import { patchStudioMeta, getImportDir, readStudioMeta, type StudioMeta } from "./state";
import { LOCAL_WP_URL } from "../../Converter/shared/wp-import/sync-local-export";
import {
  pipelineBanner,
  pipelineDetail,
  pipelineFail,
  pipelineOk,
  pipelineStartMigrationLog,
  pipelineStep,
} from "../../Converter/shared/pipeline-log";
import {
  converterGenerate,
  converterImportLocal,
  converterImportPlugin,
  converterSyncLocal,
} from "./converter-client";

const editorProcesses = new Map<string, ChildProcess>();
const usedPorts = new Set<number>();

const EDITOR_PORT_START = 8000;
const EDITOR_PORT_END = 8080;

/** Public URL browsers use to open a project editor (outside Docker). */
export function editorUrlFor(port: number): string {
  let base = (process.env.EDITOR_PUBLIC_ORIGIN ?? "http://localhost").trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  try {
    const u = new URL(base);
    u.port = String(port);
    return u.toString().replace(/\/$/, "");
  } catch {
    return `http://localhost:${port}`;
  }
}

function parseViteLocalPort(text: string): number | null {
  const match = text.match(/Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isFinite(port) && port > 0 ? port : null;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function seedUsedPortsFromDisk(): void {
  const root = getProjectsRoot();
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    const meta = readStudioMeta(name);
    const live =
      editorProcesses.has(name) ||
      meta?.editorStatus === "running" ||
      meta?.editorStatus === "starting";
    if (live && meta?.editorPort) usedPorts.add(meta.editorPort);
  }
}

async function allocatePort(preferred?: number): Promise<number> {
  seedUsedPortsFromDisk();
  const order: number[] = [];
  if (preferred && preferred >= EDITOR_PORT_START && preferred <= EDITOR_PORT_END) {
    order.push(preferred);
  }
  for (let port = EDITOR_PORT_START; port <= EDITOR_PORT_END; port += 1) {
    if (port !== preferred) order.push(port);
  }
  for (const port of order) {
    if (usedPorts.has(port) && port !== preferred) continue;
    if (!(await isPortFree(port))) continue;
    usedPorts.add(port);
    return port;
  }
  throw new Error(`No free editor port in ${EDITOR_PORT_START}-${EDITOR_PORT_END}`);
}

function releasePort(port: number | undefined): void {
  if (port) usedPorts.delete(port);
}

export function isScrapeRunning(_slug: string): boolean {
  return false;
}

export function isEditorRunning(slug: string): boolean {
  return editorProcesses.has(slug);
}

export async function runImportFromFiles(slug: string, name: string): Promise<void> {
  const importDir = getImportDir(slug);
  if (!fs.existsSync(importDir)) {
    throw new Error("No files uploaded yet");
  }

  pipelineBanner(`IMPORT (WP files) — ${slug}`, slug);
  pipelineStartMigrationLog(slug, `files://${importDir}`);
  pipelineStep("import", `Importing WordPress dump from ${importDir}`, slug);
  patchStudioMeta(slug, { scrapeStatus: "running", error: undefined });

  try {
    await converterImportLocal({ slug, name, importPath: importDir });
    patchStudioMeta(slug, { scrapeStatus: "done" });
    pipelineOk(`Import complete → output/${slug}/data`, slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message });
    pipelineFail(message, slug);
    throw err;
  }
}

export async function runImportFromPluginExport(
  slug: string,
  name: string,
  source: string,
): Promise<void> {
  pipelineBanner(`IMPORT (plugin ZIP) — ${slug}`, slug);
  pipelineStartMigrationLog(slug, source);
  pipelineStep("unzip", `Reading plugin export: ${source}`, slug);
  patchStudioMeta(slug, { scrapeStatus: "running", error: undefined, sourceType: "plugin" });

  try {
    const result = await converterImportPlugin({ slug, name, source });
    patchStudioMeta(slug, { scrapeStatus: "done", hasPluginExport: true });
    pipelineOk(`Import complete → output/${slug}/data`, slug);
    pipelineDetail("pages", String(result.pageCount), slug);
    pipelineDetail("templates", String(result.templateCount), slug);
    pipelineDetail("menus", String(result.menuCount), slug);
    pipelineDetail("media", String(result.mediaCount), slug);
    if (result.assetsCopied) pipelineDetail("assets", `output/${slug}/public`, slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message });
    pipelineFail(message, slug);
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

    const whoamiUrl = wpRestEndpoint(restBase, "/wp-grape-export/v1/whoami");
    const whoamiRes = await fetch(whoamiUrl, { headers: { Authorization: auth } });
    const whoami = (await whoamiRes.json().catch(() => null)) as WpWhoAmI | null;
    if (whoami && whoami.ok !== false && (!whoami.loggedIn || !whoami.canExport)) {
      throw new Error(`Remote export failed: ${explainWpAuthFailure(whoami, local)}`);
    }

    const exportUrl = wpRestEndpoint(restBase, "/wp-grape-export/v1/export");

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

    const zipRes = await fetch(exportData.url, { headers: { Authorization: auth } });
    if (!zipRes.ok) {
      throw new Error(`Failed to download bundle: HTTP ${zipRes.status}`);
    }
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());

    const importDir = getImportDir(slug);
    fs.mkdirSync(importDir, { recursive: true });
    const zipPath = path.join(importDir, "plugin-export.zip");
    fs.writeFileSync(zipPath, zipBuffer);

    await converterImportPlugin({ slug, name, source: zipPath });
    patchStudioMeta(slug, { scrapeStatus: "done", hasPluginExport: true, url: base });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message });
    throw err;
  }
}

/**
 * Local inner loop: bind-mounted plugin → docker CLI export → import → generate.
 * No plugin ZIP upload and no Studio ZIP upload.
 */
export async function runSyncFromLocalWp(
  slug: string,
  name: string,
  opts: { copyMedia?: boolean; skipGenerate?: boolean } = {},
): Promise<void> {
  if (!opts.skipGenerate) {
    stopEditor(slug);
  }

  pipelineBanner(`SYNC (local WordPress) — ${slug}`, slug);
  pipelineStep("sync", `Local WP → export → import${opts.skipGenerate ? "" : " → convert"}`, slug);

  patchStudioMeta(slug, {
    scrapeStatus: "running",
    sourceType: "plugin",
    error: undefined,
    url: LOCAL_WP_URL,
  });

  try {
    const skipGenerate = Boolean(opts.skipGenerate);
    if (!skipGenerate) {
      patchStudioMeta(slug, { generateStatus: "running" });
    }

    const result = await converterSyncLocal({
      slug,
      name,
      copyMedia: opts.copyMedia !== false,
      skipGenerate,
    });

    const appPath = path.join(getProjectDir(slug), "src", "App.tsx");
    if (result.generated && fs.existsSync(appPath)) {
      assertValidAppTsx(fs.readFileSync(appPath, "utf8"));
    }

    patchStudioMeta(slug, {
      scrapeStatus: "done",
      hasPluginExport: true,
      url: LOCAL_WP_URL,
      generateStatus: result.generated ? "done" : readStudioMeta(slug)?.generateStatus,
    });
    pipelineOk(`Local sync finished (${result.method})`, slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { scrapeStatus: "failed", error: message, generateStatus: "failed" });
    pipelineFail(message, slug);
    throw err;
  }
}

export async function runGenerate(slug: string): Promise<StudioMeta> {
  stopEditor(slug);
  const port = await allocatePort();
  pipelineBanner(`CONVERT — ${slug}`, slug);
  pipelineStep("convert", `Codegen via Converter (editor port reserved: ${port})`, slug);
  patchStudioMeta(slug, { generateStatus: "running", error: undefined, editorPort: port });

  try {
    const generated = await converterGenerate({ slug, port });
    const projectDir = generated.projectDir || getProjectDir(slug);
    const appPath = path.join(projectDir, "src", "App.tsx");
    if (!fs.existsSync(appPath)) {
      throw new Error(`Generate did not create ${appPath}`);
    }
    assertValidAppTsx(fs.readFileSync(appPath, "utf8"));

    patchStudioMeta(slug, { generateStatus: "done", editorPort: port });
    pipelineOk(`Convert finished. Start editor with: pnpm dev (PORT=${port}) in output/${slug}`, slug);
    return readStudioMeta(slug)!;
  } catch (err) {
    releasePort(port);
    const message = err instanceof Error ? err.message : String(err);
    patchStudioMeta(slug, { generateStatus: "failed", error: message });
    pipelineFail(message, slug);
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
    pipelineStep("editor", `Already running at ${editorUrlFor(port)}`, slug);
    return { port, url: editorUrlFor(port) };
  }

  const port = await allocatePort(meta.editorPort);
  pipelineBanner(`EDITOR — ${slug}`, slug);
  pipelineStep("editor", `Executing: pnpm dev -- --port ${port} (cwd=${projectDir})`, slug);
  pipelineDetail("PORT", String(port), slug);
  pipelineDetail("url", editorUrlFor(port), slug);
  patchStudioMeta(slug, { editorStatus: "starting", editorPort: port });

  return new Promise((resolve, reject) => {
    // Bind 0.0.0.0 so the editor is reachable from outside the Admin container.
    const child = spawn(
      "pnpm",
      ["dev", "--", "--host", "0.0.0.0", "--port", String(port), "--strictPort"],
      {
        cwd: projectDir,
        shell: true,
        env: { ...process.env, PORT: String(port), HOST: "0.0.0.0" },
        detached: false,
      },
    );

    editorProcesses.set(slug, child);
    let resolved = false;
    let boundPort = port;

    const tryResolve = (detectedPort?: number) => {
      if (resolved) return;
      resolved = true;
      if (detectedPort && detectedPort !== boundPort) {
        releasePort(boundPort);
        usedPorts.add(detectedPort);
        boundPort = detectedPort;
      }
      patchStudioMeta(slug, { editorStatus: "running", editorPort: boundPort, editorPid: child.pid });
      pipelineOk(`Editor running at ${editorUrlFor(boundPort)}`, slug);
      resolve({ port: boundPort, url: editorUrlFor(boundPort) });
    };

    const timer = setTimeout(() => tryResolve(), 3500);

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(`[${slug}:vite] ${text}`);
      const detected = parseViteLocalPort(text);
      if (detected || text.includes("Local:") || text.includes(`localhost:${port}`)) {
        clearTimeout(timer);
        tryResolve(detected ?? undefined);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[${slug}:vite] ${chunk.toString()}`);
    });

    child.on("exit", (code) => {
      editorProcesses.delete(slug);
      releasePort(boundPort);
      patchStudioMeta(slug, { editorStatus: "stopped", editorPid: undefined });
      if (!resolved && code !== 0) {
        clearTimeout(timer);
        pipelineFail(`Editor exited (code ${code})`, slug);
        reject(new Error(`Editor server exited (code ${code})`));
      }
    });

    child.on("error", (err) => {
      editorProcesses.delete(slug);
      releasePort(boundPort);
      patchStudioMeta(slug, { editorStatus: "stopped", error: err.message });
      clearTimeout(timer);
      pipelineFail(err.message, slug);
      reject(err);
    });
  });
}

export function stopScrape(_slug: string): void {
  /* legacy no-op — external URL scrape removed */
}

export function stopEditor(slug: string, opts: { skipMeta?: boolean } = {}): void {
  const child = editorProcesses.get(slug);
  const meta = readStudioMeta(slug);
  // Windows: SIGTERM on the pnpm shell often leaves nested `node vite` locking the folder.
  killProcessTree(child?.pid);
  killProcessTree(meta?.editorPid);
  if (child) editorProcesses.delete(slug);
  releasePort(meta?.editorPort);
  if (!opts.skipMeta && meta) {
    patchStudioMeta(slug, { editorStatus: "stopped", editorPid: undefined });
  }
}


import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { importPluginExport } from "./import-plugin-export";

const ROOT = process.cwd();

const DEFAULT_WP_URL = process.env.WP_URL ?? "http://localhost:8084";
const DEFAULT_SLUG = process.env.SITE_SLUG ?? "radius-ois";
const COMPOSE_SERVICE = process.env.WP_COMPOSE_SERVICE ?? "radius_wordpress";
const CONTAINER_PLUGIN_CLI =
  "/var/www/html/wp-content/plugins/wp-grape-export/cli/export.php";

export interface SyncLocalExportOptions {
  siteSlug?: string;
  name?: string;
  copyMedia?: boolean;
  /** Skip GrapeJS generate (export + import only). */
  skipGenerate?: boolean;
}

export interface SyncLocalExportResult {
  siteSlug: string;
  source: string;
  method: "docker-cli" | "latest-on-disk";
  stats?: unknown;
  generated: boolean;
}

function hostLatestDir(): string {
  return path.join(ROOT, "try-data", "radius-ois", "www", "wp-content", "uploads", "wp-grape-export", "latest");
}

function hostLatestZip(): string {
  return path.join(ROOT, "try-data", "radius-ois", "www", "wp-content", "uploads", "wp-grape-export", "latest.zip");
}

function hostLatestResultFile(): string {
  return path.join(ROOT, "try-data", "radius-ois", "www", "wp-content", "uploads", "wp-grape-export", "latest-result.json");
}

function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; shell?: boolean },
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd ?? ROOT,
      shell: opts?.shell ?? false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stderr.write(text.includes("{") ? "" : "");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    const timer =
      opts?.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`Timed out after ${opts.timeoutMs}ms: ${cmd} ${args.join(" ")}`));
          }, opts.timeoutMs)
        : null;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function extractJsonObject(text: string): string | null {
  const marked = text.match(/__WPGE_JSON_START__\s*([\s\S]*?)\s*__WPGE_JSON_END__/);
  if (marked?.[1]) return marked[1].trim();

  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseCliJson(output: string): {
  ok?: boolean;
  latestDir?: string;
  latestZip?: string;
  zip?: string;
  stats?: unknown;
} {
  const raw = extractJsonObject(output);
  if (!raw) {
    throw new Error(`CLI export produced no JSON.\n${output.slice(-500)}`);
  }
  return JSON.parse(raw) as {
    ok?: boolean;
    latestDir?: string;
    latestZip?: string;
    zip?: string;
    stats?: unknown;
  };
}

function pickImportSource(): string {
  const dir = hostLatestDir();
  const zip = hostLatestZip();
  if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;
  if (fs.existsSync(zip)) return zip;
  throw new Error(
    `No export found at ${dir} or ${zip}. Is WordPress running (pnpm wp:up) and is wp-grape-export bind-mounted?`,
  );
}

async function exportViaDockerCli(copyMedia: boolean): Promise<{ stats?: unknown }> {
  const args = ["compose", "exec", "-T", COMPOSE_SERVICE, "php", CONTAINER_PLUGIN_CLI];
  if (copyMedia) args.push("--copy-media");

  console.log(`\n▶ docker ${args.join(" ")}\n`);
  const result = await run("docker", args, { timeoutMs: 15 * 60 * 1000 });
  if (result.code !== 0) {
    throw new Error(
      `Docker export failed (exit ${result.code}). Is the radius_wordpress container up?\n${result.stderr.slice(-800)}`,
    );
  }
  const resultFile = hostLatestResultFile();
  if (fs.existsSync(resultFile)) {
    try {
      const json = JSON.parse(fs.readFileSync(resultFile, "utf8")) as { ok?: boolean; stats?: unknown };
      if (json.ok !== false) {
        console.log("Export finished.\n");
        return { stats: json.stats };
      }
    } catch {
      /* fall through to stdout parse */
    }
  }

  try {
    const json = parseCliJson(`${result.stdout}\n${result.stderr}`);
    if (!json.ok) {
      throw new Error("CLI export returned ok=false");
    }
    return { stats: json.stats };
  } catch (err) {
    if (fs.existsSync(path.join(hostLatestDir(), "manifest.json"))) {
      console.log("Export finished; using latest/ on disk (CLI stdout was noisy).\n");
      return {};
    }
    throw err;
  }
}

async function generateSite(slug: string): Promise<void> {
  const projectDir = path.join(ROOT, "projects", slug);
  const hadModules = fs.existsSync(path.join(projectDir, "node_modules"));

  console.log(`\n▶ pnpm generate -- --site ${slug}\n`);
  const gen = await run("pnpm", ["generate", "--", "--site", slug], {
    timeoutMs: 10 * 60 * 1000,
    shell: true,
  });
  if (gen.code !== 0) {
    throw new Error(`Generate failed (exit ${gen.code})\n${gen.stderr.slice(-800)}`);
  }

  if (!hadModules) {
    console.log(`\n▶ pnpm install in projects/${slug}\n`);
    const install = await run("pnpm", ["install"], {
      cwd: projectDir,
      timeoutMs: 10 * 60 * 1000,
      shell: true,
    });
    if (install.code !== 0) {
      throw new Error(`pnpm install failed in projects/${slug}`);
    }
  } else {
    console.log(`\n⏭ node_modules already present — skipped pnpm install\n`);
  }
}

/**
 * Fast inner loop for plugin work:
 *   1. Plugin PHP is bind-mounted — no WP plugin ZIP upload.
 *   2. docker exec runs export inside WordPress (no REST password).
 *   3. Import latest/ folder from the bind-mounted uploads dir.
 *   4. Regenerate GrapeJS (keeps node_modules).
 */
export async function syncLocalPluginExport(
  opts: SyncLocalExportOptions = {},
): Promise<SyncLocalExportResult> {
  const siteSlug = opts.siteSlug ?? DEFAULT_SLUG;
  const name = opts.name ?? "RADIUS-OIS";
  const copyMedia = opts.copyMedia !== false;

  let method: SyncLocalExportResult["method"] = "docker-cli";
  let stats: unknown;

  try {
    const exported = await exportViaDockerCli(copyMedia);
    stats = exported.stats;
  } catch (err) {
    const dirReady = fs.existsSync(path.join(hostLatestDir(), "manifest.json"));
    const zipReady = fs.existsSync(hostLatestZip());
    if (!dirReady && !zipReady) throw err;
    console.warn(
      `\n⚠ Docker CLI export failed (${err instanceof Error ? err.message : String(err)}). Using existing latest export on disk.\n`,
    );
    method = "latest-on-disk";
  }

  const source = pickImportSource();
  console.log(`\n▶ Import ${source} → sites/${siteSlug}/\n`);
  await importPluginExport({ source, siteSlug, name });

  if (!opts.skipGenerate) {
    await generateSite(siteSlug);
  }

  return { siteSlug, source, method, stats, generated: !opts.skipGenerate };
}

export const LOCAL_WP_URL = DEFAULT_WP_URL;

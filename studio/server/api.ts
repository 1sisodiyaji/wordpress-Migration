import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import {
  deleteSite,
  getSite,
  readRegistry,
  siteExists,
  siteHasData,
  upsertSite,
  normalizeWordPressUrl,
} from "../../lib/wp/sites";
import { readMigrationLog } from "../../lib/wp/migration-log";
import { readMigrationStatus } from "../../lib/wp/migration-status";
import {
  isScrapeRunning,
  isEditorRunning,
  runGenerate,
  runImportFromFiles,
  runScrapeFromUrl,
  startEditor,
} from "./jobs";
import { getImportDir, createStudioMeta, patchStudioMeta, readStudioMeta } from "./state";
import { getWpImportStatus } from "../../lib/wp-import/store-parts";
import { registerUploadRoutes } from "./upload";
import { getMigratedDataDir } from "../../lib/wp/config";
import type { MigrationManifest, PluginExportAudit } from "../../lib/wp/types";
import { getProjectDir } from "../../generator/lib/scaffold";
import { runPullFromPluginRest } from "./jobs";
import { deleteProjectCompletely } from "./cleanup";

export interface ProjectAudit {
  unresolvedShortcodes: PluginExportAudit["unresolvedShortcodes"];
  warnings: string[];
  summary: {
    pages: number;
    templates: number;
    menus: number;
    media: number;
    hasLayout: boolean;
  } | null;
}

function readProjectAudit(slug: string): ProjectAudit | null {
  const dataDir = getMigratedDataDir(slug);
  const auditPath = path.join(dataDir, "audit", "report.json");
  const manifestPath = path.join(dataDir, "manifest.json");
  if (!fs.existsSync(auditPath) && !fs.existsSync(manifestPath)) return null;

  let unresolvedShortcodes: PluginExportAudit["unresolvedShortcodes"] = [];
  let warnings: string[] = [];
  if (fs.existsSync(auditPath)) {
    try {
      const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as PluginExportAudit;
      unresolvedShortcodes = audit.unresolvedShortcodes ?? [];
      warnings = audit.warnings ?? [];
    } catch {
      /* ignore malformed audit */
    }
  }

  let summary: ProjectAudit["summary"] = null;
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MigrationManifest;
      const px = manifest.pluginExport;
      summary = {
        pages: manifest.routes?.length ?? 0,
        templates: px?.templateCount ?? 0,
        menus: px?.menuCount ?? 0,
        media: manifest.media?.length ?? 0,
        hasLayout: px?.hasLayout ?? false,
      };
    } catch {
      /* ignore malformed manifest */
    }
  }

  return { unresolvedShortcodes, warnings, summary };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `project-${Date.now()}`;
}

function projectPayload(slug: string) {
  const meta = readStudioMeta(slug);
  const registry = getSite(slug);
  const hasData = siteHasData(slug);
  const logs = readMigrationLog(slug);
  const status = readMigrationStatus(slug);

  return {
    slug,
    meta,
    registry,
    hasData,
    logs,
    phase: status?.phase ?? null,
    progress: status?.progress ?? null,
    scrapeRunning: isScrapeRunning(slug),
    editorRunning: isEditorRunning(slug),
    editorUrl: meta?.editorPort ? `http://localhost:${meta.editorPort}` : null,
    audit: readProjectAudit(slug),
  };
}

export function registerApi(app: Express): void {
  registerUploadRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/projects", (_req, res) => {
    const registry = readRegistry();
    const slugs = new Set(registry.map((s) => s.slug));
    for (const meta of listAllStudioMeta()) slugs.add(meta.slug);
    res.json({ projects: [...slugs].map((slug) => projectPayload(slug)) });
  });

  app.post("/api/projects", (req, res) => {
    const { name, url, sourceType } = req.body as {
      name?: string;
      url?: string;
      sourceType?: "url" | "files" | "plugin";
    };

    const type = sourceType ?? (url ? "url" : "files");
    const displayName = name?.trim() || (url ? new URL(normalizeWordPressUrl(url)).hostname : "New project");
    let slug = slugify(displayName);
    while (readStudioMeta(slug) || getSite(slug)) {
      slug = `${slugify(displayName)}-${Date.now().toString(36).slice(-4)}`;
    }
    const normalizedUrl = url ? normalizeWordPressUrl(url) : undefined;

    const meta = createStudioMeta({
      slug,
      name: displayName,
      sourceType: type,
      url: normalizedUrl,
    });

    upsertSite({
      slug,
      url: normalizedUrl ?? `local://${slug}`,
      name: displayName,
      status: "migrating",
    });

    fs.mkdirSync(getImportDir(slug), { recursive: true });
    res.status(201).json({ project: projectPayload(slug), meta });
  });

  app.get("/api/projects/:slug", (req, res) => {
    const slug = String(req.params.slug);
    if (!readStudioMeta(slug) && !getSite(slug)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ project: projectPayload(slug) });
  });

  app.delete("/api/projects/:slug", (req, res) => {
    const slug = String(req.params.slug);
    const exists =
      siteExists(slug) ||
      Boolean(readStudioMeta(slug)) ||
      fs.existsSync(getProjectDir(slug));

    if (!exists) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const result = deleteProjectCompletely(slug);
    deleteSite(slug);

    res.json({ ok: true, deleted: result });
  });

  app.post("/api/projects/:slug/scrape", async (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (isScrapeRunning(slug)) {
      res.status(409).json({ error: "Scrape already running" });
      return;
    }

    if (meta.sourceType === "files") {
      const importStatus = getWpImportStatus(getImportDir(slug));
      if (!importStatus.readyToImport) {
        res.status(400).json({
          error: `Upload WordPress files first. Missing: ${importStatus.missing.join(", ")}`,
          missing: importStatus.missing,
        });
        return;
      }
    }

    res.json({ ok: true, started: true });

    try {
      if (meta.sourceType === "files") {
        await runImportFromFiles(slug, meta.name);
      } else if (meta.url) {
        await runScrapeFromUrl(slug, meta.url);
      } else {
        patchStudioMeta(slug, { scrapeStatus: "failed", error: "No URL or files configured" });
      }
    } catch {
      // status updated in jobs
    }
  });

  // Phase 5: pull an export directly from a live WordPress running the plugin.
  app.post("/api/projects/:slug/plugin-pull", async (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { wpUrl, username, appPassword, copyMedia } = req.body as {
      wpUrl?: string;
      username?: string;
      appPassword?: string;
      copyMedia?: boolean;
    };

    if (!wpUrl || !username || !appPassword) {
      res.status(400).json({ error: "wpUrl, username and appPassword are required" });
      return;
    }

    res.json({ ok: true, started: true });

    try {
      await runPullFromPluginRest(slug, meta.name, {
        wpUrl,
        username,
        appPassword,
        copyMedia: Boolean(copyMedia),
      });
    } catch {
      // status recorded in job
    }
  });

  app.post("/api/projects/:slug/generate", async (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (meta.scrapeStatus !== "done" && !siteHasData(slug)) {
      res.status(400).json({ error: "Scrape/import must complete first" });
      return;
    }

    try {
      const updated = await runGenerate(slug);
      res.json({ ok: true, meta: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/projects/:slug/editor/start", async (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (meta.generateStatus !== "done") {
      res.status(400).json({ error: "Generate GrapeJS project first" });
      return;
    }

    try {
      const { port, url } = await startEditor(slug);
      res.json({ ok: true, port, url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/projects/:slug/logs", (req, res) => {
    const slug = String(req.params.slug);
    res.json({
      logs: readMigrationLog(slug),
      status: readMigrationStatus(slug),
      scrapeRunning: isScrapeRunning(slug),
    });
  });
}

function listAllStudioMeta() {
  const sitesRoot = path.join(process.cwd(), "sites");
  if (!fs.existsSync(sitesRoot)) return [];
  const out = [];
  for (const entry of fs.readdirSync(sitesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = readStudioMeta(entry.name);
    if (meta) out.push(meta);
  }
  return out;
}

import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import {
  upsertSite,
  siteExists,
  siteHasData,
  deleteSite,
  getSite,
  readRegistry,
  getProjectsRoot,
} from "../../Converter/shared/wp/sites";
import { readMigrationLog } from "../../Converter/shared/wp/migration-log";
import { readMigrationStatus } from "../../Converter/shared/wp/migration-status";
import {
  isScrapeRunning,
  isEditorRunning,
  runGenerate,
  runImportFromFiles,
  runPullFromPluginRest,
  runSyncFromLocalWp,
  startEditor,
  stopEditor,
  editorUrlFor,
} from "./jobs";
import { getImportDir, createStudioMeta, patchStudioMeta, readStudioMeta, isSiteDirHealthy } from "./state";
import { getWpImportStatus } from "../../Converter/shared/wp-import/store-parts";
import { registerUploadRoutes } from "./upload";
import { getMigratedDataDir } from "../../Converter/shared/wp/config";
import type { MigrationManifest, PluginExportAudit } from "../../Converter/shared/wp/types";
import { getProjectDir } from "../../Converter/lib/scaffold";
import { deleteProjectCompletely } from "./cleanup";
import { comparisonSummary, fetchPageInsight } from "./page-insights";

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
    editorUrl: meta?.editorPort ? editorUrlFor(meta.editorPort) : null,
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
    const slugs = new Set(
      registry.map((s) => s.slug).filter((slug): slug is string => Boolean(slug)),
    );
    for (const meta of listAllStudioMeta()) {
      if (meta.slug) slugs.add(meta.slug);
    }
    res.json({ projects: [...slugs].map((slug) => projectPayload(slug)) });
  });

  app.post("/api/projects", (req, res) => {
    try {
      const { name, sourceType } = req.body as {
        name?: string;
        sourceType?: "files" | "plugin";
      };

      const type = sourceType ?? "plugin";
      const displayName = name?.trim() || "New project";
      let slug = slugify(displayName);
      // Skip taken or broken leftover folders (e.g. dangling junctions).
      while (readStudioMeta(slug) || getSite(slug) || isSiteDirHealthy(slug)) {
        slug = `${slugify(displayName)}-${Date.now().toString(36).slice(-4)}`;
      }
      const meta = createStudioMeta({
        slug,
        name: displayName,
        sourceType: type,
      });

      upsertSite({
        slug,
        url: `local://${slug}`,
        name: displayName,
        status: "migrating",
      });

      fs.mkdirSync(getImportDir(slug), { recursive: true });
      res.status(201).json({ project: projectPayload(slug), meta });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[create project]", err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/projects/:slug", (req, res) => {
    const slug = String(req.params.slug);
    if (!readStudioMeta(slug) && !getSite(slug)) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ project: projectPayload(slug) });
  });

  app.delete("/api/projects/:slug", async (req, res) => {
    const slug = String(req.params.slug);
    const exists =
      siteExists(slug) ||
      Boolean(readStudioMeta(slug)) ||
      fs.existsSync(getProjectDir(slug));

    if (!exists) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    try {
      const result = await deleteProjectCompletely(slug);
      deleteSite(slug);

      if (result.warning) {
        res.status(409).json({
          ok: false,
          error: result.warning,
          deleted: result,
        });
        return;
      }

      res.json({ ok: true, deleted: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
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
      } else if (meta.sourceType === "plugin" && meta.scrapeStatus !== "done") {
        patchStudioMeta(slug, {
          scrapeStatus: "failed",
          error: "Plugin export not imported yet. Upload a ZIP or pull from WordPress.",
        });
      } else if (meta.sourceType !== "plugin") {
        patchStudioMeta(slug, { scrapeStatus: "failed", error: "No import source configured" });
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

  // Local inner loop: bind-mounted plugin + docker exec export (no ZIP upload).
  app.post("/api/projects/:slug/plugin-sync", async (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { copyMedia, skipGenerate } = (req.body ?? {}) as {
      copyMedia?: boolean;
      skipGenerate?: boolean;
    };

    res.json({ ok: true, started: true });

    try {
      await runSyncFromLocalWp(slug, meta.name, {
        copyMedia: copyMedia !== false,
        skipGenerate: Boolean(skipGenerate),
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

  app.post("/api/projects/:slug/editor/stop", (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    stopEditor(slug);
    res.json({ ok: true, meta: readStudioMeta(slug) });
  });

  app.get("/api/projects/:slug/logs", (req, res) => {
    const slug = String(req.params.slug);
    res.json({
      logs: readMigrationLog(slug),
      status: readMigrationStatus(slug),
      scrapeRunning: isScrapeRunning(slug),
    });
  });

  app.get("/api/projects/:slug/compare-insights", async (req, res) => {
    const slug = String(req.params.slug);
    const meta = readStudioMeta(slug);
    if (!meta) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const originalUrl = String(req.query.originalUrl ?? meta.url ?? "").trim();
    const migratedUrl = String(
      req.query.migratedUrl ?? (meta.editorPort ? editorUrlFor(meta.editorPort) : ""),
    ).trim();

    if (!originalUrl && !migratedUrl) {
      res.status(400).json({
        error: "Set a WordPress URL and start the migrated editor to compare pages.",
      });
      return;
    }

    const [original, migrated] = await Promise.all([
      originalUrl
        ? fetchPageInsight(originalUrl)
        : Promise.resolve({ url: "", ok: false, error: "No original URL" }),
      migratedUrl
        ? fetchPageInsight(migratedUrl)
        : Promise.resolve({ url: "", ok: false, error: "Migrated site not running" }),
    ]);

    res.json({
      originalUrl: originalUrl || null,
      migratedUrl: migratedUrl || null,
      original,
      migrated,
      deltas: original.ok && migrated.ok ? comparisonSummary(original, migrated) : [],
      measuredAt: new Date().toISOString(),
      pageBuilder: readProjectPageBuilder(slug),
    });
  });
}

/** Detect Elementor / Gutenberg / Classic from the migrated export (route → page meta → heuristics). */
function readProjectPageBuilder(slug: string): {
  id: string;
  label: string;
  source: "manifest" | "route" | "page-meta" | "heuristic" | "unknown";
} {
  const dataDir = getMigratedDataDir(slug);
  const normalize = (raw: string | undefined | null): "elementor" | "gutenberg" | "classic" | null => {
    const v = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!v) return null;
    if (v === "elementor" || v.includes("elementor")) return "elementor";
    if (
      v === "gutenberg" ||
      v === "block" ||
      v === "blocks" ||
      v === "fse" ||
      v === "block-editor" ||
      v.includes("gutenberg")
    ) {
      return "gutenberg";
    }
    if (v === "classic" || v === "theme" || v === "php") return "classic";
    return null;
  };
  const labelFor = (id: string) =>
    id === "elementor"
      ? "Elementor"
      : id === "gutenberg"
        ? "Gutenberg"
        : id === "classic"
          ? "Classic / theme"
          : "Unknown";

  const manifestPath = path.join(dataDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        pageBuilder?: string;
        routes?: Array<{ pageBuilder?: string; path?: string; isElementor?: boolean; slug?: string }>;
      };

      const homeRoute =
        manifest.routes?.find((r) => r.path === "/" || r.path === "") ??
        manifest.routes?.find((r) => r.slug === "home") ??
        manifest.routes?.[0];

      const fromRoute = normalize(homeRoute?.pageBuilder);
      if (fromRoute) {
        return { id: fromRoute, label: labelFor(fromRoute), source: "route" };
      }
      if (homeRoute?.isElementor) {
        return { id: "elementor", label: labelFor("elementor"), source: "route" };
      }

      // Any route with a concrete builder beats a vague site-level "classic".
      for (const route of manifest.routes ?? []) {
        const id = normalize(route.pageBuilder);
        if (id && id !== "classic") {
          return { id, label: labelFor(id), source: "route" };
        }
        if (route.isElementor) {
          return { id: "elementor", label: labelFor("elementor"), source: "route" };
        }
      }

      const fromManifest = normalize(manifest.pageBuilder);
      if (fromManifest) {
        return { id: fromManifest, label: labelFor(fromManifest), source: "manifest" };
      }
    } catch {
      /* fall through */
    }
  }

  // Per-page meta (home / first page).
  const pagesDir = path.join(dataDir, "pages");
  if (fs.existsSync(pagesDir)) {
    const candidates = [
      path.join(pagesDir, "home", "meta.json"),
      path.join(pagesDir, "home.meta.json"),
    ];
    try {
      for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(pagesDir, entry.name, "meta.json"));
        } else if (entry.name.endsWith(".meta.json")) {
          candidates.push(path.join(pagesDir, entry.name));
        }
      }
    } catch {
      /* ignore */
    }
    for (const metaPath of candidates) {
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
          pageBuilder?: string;
          isElementor?: boolean;
        };
        const id = normalize(meta.pageBuilder);
        if (id) return { id, label: labelFor(id), source: "page-meta" };
        if (meta.isElementor) {
          return { id: "elementor", label: labelFor("elementor"), source: "page-meta" };
        }
      } catch {
        /* next */
      }
    }
  }

  // Heuristic from layout / rendered HTML.
  const sniffFiles = [
    path.join(dataDir, "layout.json"),
    path.join(dataDir, "pages", "home", "rendered.html"),
    path.join(dataDir, "pages", "home", "content.html"),
  ];
  for (const file of sniffFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, "utf8").slice(0, 80_000).toLowerCase();
      if (
        raw.includes("elementor") ||
        raw.includes("data-elementor") ||
        raw.includes("elementor-location-header")
      ) {
        return { id: "elementor", label: labelFor("elementor"), source: "heuristic" };
      }
      if (
        raw.includes("wp-block-") ||
        raw.includes("wp-block-template-part") ||
        raw.includes("wp-block-navigation")
      ) {
        return { id: "gutenberg", label: labelFor("gutenberg"), source: "heuristic" };
      }
    } catch {
      /* next */
    }
  }

  return { id: "unknown", label: "Unknown", source: "unknown" };
}

function listAllStudioMeta() {
  const sitesRoot = getProjectsRoot();
  if (!fs.existsSync(sitesRoot)) return [];
  const out = [];
  for (const entry of fs.readdirSync(sitesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = readStudioMeta(entry.name);
    if (meta) out.push(meta);
  }
  return out;
}

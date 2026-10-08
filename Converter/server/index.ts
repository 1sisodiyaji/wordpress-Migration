/**
 * Converter HTTP service — dump data → React + GrapeJS codegen.
 * Runs independently on port 5174.
 */
import "dotenv/config";
import express from "express";
import { installColorConsole, logger } from "../../shared/console-log";
import { generateReactGrapeProject, getProjectDir } from "../lib/scaffold";
import { importPluginExport } from "../shared/wp-import/import-plugin-export";
import { importLocalSource } from "../shared/wp-import/import-local";
import { syncLocalPluginExport } from "../shared/wp-import/sync-local-export";
import { installProjectDeps } from "../shared/install-project-deps";
import { getProjectsRoot, getTmpDir } from "../shared/paths";

installColorConsole();

const PORT = Number(process.env.CONVERTER_PORT ?? "5174");
const app = express();
app.use(express.json({ limit: "32mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "converter",
    port: PORT,
    projectsRoot: getProjectsRoot(),
    tmpDir: getTmpDir(),
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const slug = String(req.body?.slug ?? "").trim();
    if (!slug) {
      res.status(400).json({ error: "slug required" });
      return;
    }
    const port = Number(req.body?.port) || undefined;
    logger.info(`[converter] generate slug=${slug} port=${port ?? "default"}`);
    const projectDir = await generateReactGrapeProject({ siteSlug: slug, port });
    await installProjectDeps(projectDir);
    res.json({ ok: true, projectDir, slug });
  } catch (err) {
    logger.error("[converter] generate failed", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/import/plugin", async (req, res) => {
  try {
    const slug = String(req.body?.slug ?? "").trim();
    const name = String(req.body?.name ?? slug).trim();
    const source = String(req.body?.source ?? "").trim();
    if (!slug || !source) {
      res.status(400).json({ error: "slug and source required" });
      return;
    }
    const result = await importPluginExport({ source, siteSlug: slug, name });
    res.json({ ok: true, ...result, projectDir: getProjectDir(slug) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/import/local", async (req, res) => {
  try {
    const slug = String(req.body?.slug ?? "").trim();
    const name = String(req.body?.name ?? slug).trim();
    const importPath = String(req.body?.importPath ?? "").trim();
    if (!slug || !importPath) {
      res.status(400).json({ error: "slug and importPath required" });
      return;
    }
    await importLocalSource({ importPath, siteSlug: slug, name });
    res.json({ ok: true, slug, projectDir: getProjectDir(slug) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/sync-local", async (req, res) => {
  try {
    const slug = String(req.body?.slug ?? "").trim();
    const name = String(req.body?.name ?? slug).trim();
    if (!slug) {
      res.status(400).json({ error: "slug required" });
      return;
    }
    const result = await syncLocalPluginExport({
      siteSlug: slug,
      name,
      copyMedia: req.body?.copyMedia !== false,
      skipGenerate: Boolean(req.body?.skipGenerate),
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Converter listening on http://0.0.0.0:${PORT}`);
  logger.info(`PROJECTS_ROOT=${getProjectsRoot()}`);
  logger.info(`TMP_DIR=${getTmpDir()}`);
});

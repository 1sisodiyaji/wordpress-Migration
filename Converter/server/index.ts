/**
 * Converter HTTP service — dump data → React + GrapeJS codegen.
 * Runs independently on port 5174.
 */
import "dotenv/config";
import express from "express";
import { generateReactGrapeProject } from "../lib/scaffold";
import { importPluginExport } from "../shared/wp-import/import-plugin-export";
import { importLocalSource } from "../shared/wp-import/import-local";
import { syncLocalPluginExport } from "../shared/wp-import/sync-local-export";
import { getProjectDir } from "../lib/scaffold";

const PORT = Number(process.env.CONVERTER_PORT ?? "5174");
const app = express();
app.use(express.json({ limit: "32mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "converter", port: PORT });
});

app.post("/api/generate", async (req, res) => {
  try {
    const slug = String(req.body?.slug ?? "").trim();
    if (!slug) {
      res.status(400).json({ error: "slug required" });
      return;
    }
    const port = Number(req.body?.port) || undefined;
    console.log(`[converter] generate slug=${slug} port=${port ?? "default"}`);
    const projectDir = await generateReactGrapeProject({ siteSlug: slug, port });
    res.json({ ok: true, projectDir, slug });
  } catch (err) {
    console.error("[converter] generate failed", err);
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
    await importPluginExport({ source, siteSlug: slug, name });
    res.json({ ok: true, slug, projectDir: getProjectDir(slug) });
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
    res.json({ ok: true, slug });
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

app.listen(PORT, () => {
  console.log(`Converter listening on http://localhost:${PORT}`);
});

import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import multer from "multer";
import {
  getWpImportStatus,
  storeSqlFile,
  storeWpConfigFile,
  storeWpContentZip,
} from "../../lib/wp-import/store-parts";
import { runImportFromPluginExport } from "./jobs";
import { getImportDir, patchStudioMeta, readStudioMeta } from "./state";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 * 1024 },
});

export function registerUploadRoutes(app: Express): void {
  app.post(
    "/api/projects/:slug/upload",
    upload.fields([
      { name: "sql", maxCount: 1 },
      { name: "wpContent", maxCount: 1 },
      { name: "wpConfig", maxCount: 1 },
    ]),
    (req, res) => {
      const slug = String(req.params.slug);
      const meta = readStudioMeta(slug);
      if (!meta) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const files = req.files as {
        sql?: Express.Multer.File[];
        wpContent?: Express.Multer.File[];
        wpConfig?: Express.Multer.File[];
      };

      const sqlFile = files.sql?.[0];
      const wpContentFile = files.wpContent?.[0];
      const wpConfigFile = files.wpConfig?.[0];

      if (!sqlFile && !wpContentFile && !wpConfigFile) {
        res.status(400).json({
          error: "Upload at least one file: sql, wpContent (.zip), or wpConfig.",
        });
        return;
      }

      const importDir = getImportDir(slug);
      fs.mkdirSync(importDir, { recursive: true });

      const saved: string[] = [...(meta.uploadedFiles ?? [])];

      if (sqlFile) {
        if (!/\.sql$/i.test(sqlFile.originalname)) {
          res.status(400).json({ error: "SQL upload must be a .sql file" });
          return;
        }
        storeSqlFile(importDir, sqlFile.buffer, sqlFile.originalname);
        if (!saved.includes(sqlFile.originalname)) saved.push(sqlFile.originalname);
      }

      if (wpContentFile) {
        if (!/\.zip$/i.test(wpContentFile.originalname)) {
          res.status(400).json({ error: "wp-content must be uploaded as a .zip file" });
          return;
        }
        storeWpContentZip(importDir, wpContentFile.buffer);
        if (!saved.includes(wpContentFile.originalname)) saved.push(wpContentFile.originalname);
      }

      if (wpConfigFile) {
        if (path.basename(wpConfigFile.originalname) !== "wp-config.php") {
          res.status(400).json({ error: "Config file must be named wp-config.php" });
          return;
        }
        storeWpConfigFile(importDir, wpConfigFile.buffer);
        if (!saved.includes("wp-config.php")) saved.push("wp-config.php");
      }

      const status = getWpImportStatus(importDir);

      patchStudioMeta(slug, {
        uploadedFiles: saved,
        hasDbDump: status.hasSql,
        hasWpContent: status.hasWpContent,
        hasWpConfig: status.hasWpConfig,
        sourceType: "files",
      });

      res.json({
        ok: true,
        files: saved,
        hasDbDump: status.hasSql,
        hasWpContent: status.hasWpContent,
        hasWpConfig: status.hasWpConfig,
        missing: status.missing,
        readyToImport: status.readyToImport,
      });
    },
  );

  // Upload + import a wp-grape-export bundle (.zip) in one step.
  app.post(
    "/api/projects/:slug/plugin-export",
    upload.single("bundle"),
    async (req, res) => {
      const slug = String(req.params.slug);
      const meta = readStudioMeta(slug);
      if (!meta) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Upload a wp-grape-export .zip as 'bundle'." });
        return;
      }
      if (!/\.zip$/i.test(file.originalname)) {
        res.status(400).json({ error: "Plugin export must be a .zip file" });
        return;
      }

      const importDir = getImportDir(slug);
      fs.mkdirSync(importDir, { recursive: true });
      const zipPath = path.join(importDir, "plugin-export.zip");
      fs.writeFileSync(zipPath, file.buffer);

      patchStudioMeta(slug, { sourceType: "plugin", uploadedFiles: [file.originalname] });

      try {
        await runImportFromPluginExport(slug, meta.name, zipPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
        return;
      }

      res.json({ ok: true, imported: true });
    },
  );
}

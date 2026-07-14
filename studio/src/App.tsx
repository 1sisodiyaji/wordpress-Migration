import { useCallback, useEffect, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  pullPluginExport,
  startEditor,
  startGenerate,
  startScrape,
  uploadPluginExport,
  uploadWpParts,
  type Project,
  type SourceType,
} from "./api";
import { NewProjectPanel, type PluginPullCreds } from "./components/NewProjectPanel";
import { ProjectFlow } from "./components/ProjectFlow";
import { ProjectList } from "./components/ProjectList";
import type { WpUploadParts } from "./components/WpFileUploads";

type View = { kind: "home" } | { kind: "project"; slug: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);
    if (view.kind === "project") {
      const p = await fetchProject(view.slug);
      setActive(p);
    }
  }, [view]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (view.kind !== "project") return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [view, refresh]);

  async function openProject(slug: string) {
    setView({ kind: "project", slug });
    const p = await fetchProject(slug);
    setActive(p);
  }

  async function handleCreate(body: {
    name: string;
    url?: string;
    sourceType: SourceType;
    wpParts?: WpUploadParts;
    pluginZip?: File;
    pluginPull?: PluginPullCreds;
  }) {
    setError(null);
    const project = await createProject({ name: body.name, url: body.url, sourceType: body.sourceType });
    if (body.wpParts) {
      await uploadWpParts(project.slug, body.wpParts);
    }
    setShowNew(false);
    await openProject(project.slug);

    // Plugin export: kick off the import (upload or remote pull) after creation.
    if (body.pluginZip) {
      await uploadPluginExport(project.slug, body.pluginZip);
    } else if (body.pluginPull) {
      await pullPluginExport(project.slug, body.pluginPull);
    }
    await refresh();
  }

  async function handleScrape() {
    if (!active) return;
    setError(null);
    await startScrape(active.slug);
    await refresh();
  }

  async function handleGenerate() {
    if (!active) return;
    setError(null);
    await startGenerate(active.slug);
    await refresh();
  }

  async function handleOpenEditor() {
    if (!active) return;
    setError(null);
    const { url } = await startEditor(active.slug);
    window.open(url, "_blank", "noopener,noreferrer");
    await refresh();
  }

  async function handleUpload(parts: WpUploadParts) {
    if (!active) return;
    setError(null);
    await uploadWpParts(active.slug, parts);
    await refresh();
  }

  async function handleDelete(slug: string) {
    await deleteProject(slug);
    setView({ kind: "home" });
    setActive(null);
    await refresh();
  }

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => { setView({ kind: "home" }); setActive(null); }}>
          <span className="brand-mark">G</span>
          <span>
            <strong>WP → GrapeJS</strong>
            <small>Scrape · Convert · Edit</small>
          </span>
        </button>
        {view.kind === "home" && (
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            + New project
          </button>
        )}
      </header>

      <main className="main">
        {error && <div className="alert alert-error">{error}</div>}

        {loading && view.kind === "home" ? (
          <p className="muted">Loading projects…</p>
        ) : view.kind === "home" ? (
          <>
            {showNew && (
              <NewProjectPanel
                onClose={() => setShowNew(false)}
                onCreate={handleCreate}
              />
            )}
            <ProjectList
              projects={projects}
              onOpen={openProject}
              onDelete={handleDelete}
            />
          </>
        ) : active ? (
          <ProjectFlow
            project={active}
            onBack={() => { setView({ kind: "home" }); setActive(null); }}
            onScrape={handleScrape}
            onGenerate={handleGenerate}
            onOpenEditor={handleOpenEditor}
            onUpload={handleUpload}
            onDelete={() => handleDelete(active.slug)}
          />
        ) : (
          <p className="muted">Loading project…</p>
        )}
      </main>
    </div>
  );
}

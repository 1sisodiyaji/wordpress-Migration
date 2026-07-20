import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTheme } from "./hooks/useTheme";

type View = { kind: "home" } | { kind: "project"; slug: string };

function projectStats(projects: Project[]) {
  const total = projects.length;
  const live = projects.filter((p) => p.meta?.editorStatus === "running" || p.editorRunning).length;
  const ready = projects.filter((p) => p.meta?.generateStatus === "done").length;
  return { total, live, ready };
}

export default function App() {
  const { switchTheme, isDark } = useTheme();
  const [view, setView] = useState<View>({ kind: "home" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => projectStats(projects), [projects]);

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
    setError(null);
    try {
      await deleteProject(slug);
      setView({ kind: "home" });
      setActive(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function goHome() {
    setView({ kind: "home" });
    setActive(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand" onClick={goHome}>
            <span className="brand-mark">G</span>
            <span>
              <strong>Migration Studio</strong>
              <small>WordPress → GrapeJS</small>
            </span>
          </button>

          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={switchTheme}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? "☀" : "☾"}
            </button>
            {view.kind === "home" && (
              <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
                + New project
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <div className="shell">
          {error && <div className="alert alert-error">{error}</div>}

          {loading && view.kind === "home" ? (
            <p className="muted">Loading projects…</p>
          ) : view.kind === "home" ? (
            <>
              <section className="dashboard-hero">
                <h1>Your migration workspace</h1>
                <p>
                  Import WordPress sites, convert them to GrapeJS projects, and edit — all from one
                  centered dashboard.
                </p>
              </section>

              {projects.length > 0 && (
                <section className="stats-row" aria-label="Project statistics">
                  <article className="stat-card">
                    <strong>{stats.total}</strong>
                    <span>Total projects</span>
                  </article>
                  <article className="stat-card">
                    <strong>{stats.ready}</strong>
                    <span>Converted</span>
                  </article>
                  <article className="stat-card">
                    <strong>{stats.live}</strong>
                    <span>Editors running</span>
                  </article>
                </section>
              )}

              {showNew && (
                <NewProjectPanel onClose={() => setShowNew(false)} onCreate={handleCreate} />
              )}

              <ProjectList projects={projects} onOpen={openProject} onDelete={handleDelete} />
            </>
          ) : active ? (
            <ProjectFlow
              project={active}
              onBack={goHome}
              onScrape={handleScrape}
              onGenerate={handleGenerate}
              onOpenEditor={handleOpenEditor}
              onUpload={handleUpload}
              onDelete={() => handleDelete(active.slug)}
            />
          ) : (
            <p className="muted">Loading project…</p>
          )}
        </div>
      </main>
    </div>
  );
}

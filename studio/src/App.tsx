import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  pullPluginExport,
  startEditor,
  stopEditor,
  startGenerate,
  startScrape,
  uploadPluginExport,
  uploadWpParts,
  type Project,
  type SourceType,
} from "./api";
import { useTheme } from "./hooks/useTheme";
import { DashboardShell } from "./components/DashboardShell";
import { NewProjectPanel, type PluginPullCreds } from "./components/NewProjectPanel";
import { ProjectFlow } from "./components/ProjectFlow";
import { ProjectList } from "./components/ProjectList";
import type { WpUploadParts } from "./components/WpFileUploads";

type Route = { kind: "dashboard" } | { kind: "project"; slug: string };

function parsePath(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/project/")) {
    const slug = decodeURIComponent(path.slice("/project/".length).split("/")[0] ?? "");
    return slug ? { kind: "project", slug } : { kind: "dashboard" };
  }
  return { kind: "dashboard" };
}

function routeToPath(route: Route): string {
  if (route.kind === "project") {
    return `/project/${encodeURIComponent(route.slug)}`;
  }
  return "/";
}

/** Migrate old hash URLs (#/dashboard, #/project/x) to clean paths. */
function migrateLegacyHash(): void {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") {
    if (hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search || "/");
    }
    return;
  }
  const raw = hash.replace(/^#\/?/, "");
  const path = raw.split("?")[0] || "";
  if (path.startsWith("project/")) {
    const slug = path.slice("project/".length);
    if (slug) {
      window.history.replaceState(null, "", `/project/${encodeURIComponent(slug)}`);
      return;
    }
  }
  // #/dashboard and anything else → /
  window.history.replaceState(null, "", "/");
}

function projectStats(projects: Project[]) {
  const total = projects.length;
  const live = projects.filter((p) => p.meta?.editorStatus === "running" || p.editorRunning).length;
  const ready = projects.filter((p) => p.meta?.generateStatus === "done").length;
  return { total, live, ready };
}

export default function App() {
  const { switchTheme, isDark } = useTheme();
  const [route, setRouteState] = useState<Route>(() => {
    migrateLegacyHash();
    return parsePath();
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => projectStats(projects), [projects]);

  const navigate = useCallback((next: Route) => {
    const path = routeToPath(next);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setRouteState(next);
  }, []);

  useEffect(() => {
    const onPop = () => setRouteState(parsePath());
    window.addEventListener("popstate", onPop);
    migrateLegacyHash();
    setRouteState(parsePath());
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refresh = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);
    if (route.kind === "project") {
      const p = await fetchProject(route.slug);
      setActive(p);
    }
  }, [route]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (route.kind !== "project") return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [route, refresh]);

  async function openProject(slug: string) {
    navigate({ kind: "project", slug });
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
    if (body.wpParts) await uploadWpParts(project.slug, body.wpParts);
    setShowNew(false);
    await openProject(project.slug);
    if (body.pluginZip) await uploadPluginExport(project.slug, body.pluginZip);
    else if (body.pluginPull) await pullPluginExport(project.slug, body.pluginPull);
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

  async function handleStopEditor() {
    if (!active) return;
    setError(null);
    await stopEditor(active.slug);
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
      navigate({ kind: "dashboard" });
      setActive(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const dashTitle =
    route.kind === "project" ? active?.meta?.name ?? active?.slug ?? "Project" : "Projects";
  const dashSubtitle =
    route.kind === "project" ? "Import → convert → open editor" : "Your migration workspace";

  return (
    <DashboardShell
      title={dashTitle}
      subtitle={dashSubtitle}
      activeNav={route.kind === "project" ? "project" : "projects"}
      onHome={() => navigate({ kind: "dashboard" })}
      onTheme={switchTheme}
      isDark={isDark}
      actions={
        route.kind === "dashboard" ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            Create project
          </button>
        ) : undefined
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      {route.kind === "dashboard" && (
        <>
          {loading ? (
            <p className="muted">Loading projects…</p>
          ) : (
            <>
              {projects.length > 0 && (
                <section className="gcp-metrics" aria-label="Project statistics">
                  <article className="gcp-metric">
                    <span>Total projects</span>
                    <strong>{stats.total}</strong>
                  </article>
                  <article className="gcp-metric">
                    <span>Converted</span>
                    <strong>{stats.ready}</strong>
                  </article>
                  <article className="gcp-metric">
                    <span>Editors running</span>
                    <strong>{stats.live}</strong>
                  </article>
                </section>
              )}

              {showNew && (
                <NewProjectPanel onClose={() => setShowNew(false)} onCreate={handleCreate} />
              )}

              <ProjectList
                projects={projects}
                onOpen={openProject}
                onDelete={handleDelete}
                onCreate={() => setShowNew(true)}
              />
            </>
          )}
        </>
      )}

      {route.kind === "project" &&
        (active ? (
          <ProjectFlow
            project={active}
            onBack={() => navigate({ kind: "dashboard" })}
            onScrape={handleScrape}
            onGenerate={handleGenerate}
            onOpenEditor={handleOpenEditor}
            onStopEditor={handleStopEditor}
            onUpload={handleUpload}
            onDelete={() => handleDelete(active.slug)}
          />
        ) : (
          <p className="muted">Loading project…</p>
        ))}
    </DashboardShell>
  );
}

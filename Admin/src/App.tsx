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
  uploadPluginExport,
  type Project,
} from "./api";
import { useTheme } from "./hooks/useTheme";
import { DashboardShell } from "./components/DashboardShell";
import { NewProjectPanel } from "./components/NewProjectPanel";
import { ProjectFlow, type SyncFromWpCreds } from "./components/ProjectFlow";
import { ProjectList } from "./components/ProjectList";
import { CompareInsights } from "./components/CompareInsights";

type Route =
  | { kind: "dashboard" }
  | { kind: "project"; slug: string }
  | { kind: "compare"; slug: string };

function parsePath(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/project/")) {
    const rest = decodeURIComponent(path.slice("/project/".length));
    const [slug, sub] = rest.split("/");
    if (!slug) return { kind: "dashboard" };
    if (sub === "compare") return { kind: "compare", slug };
    return { kind: "project", slug };
  }
  return { kind: "dashboard" };
}

function routeToPath(route: Route): string {
  if (route.kind === "compare") {
    return `/project/${encodeURIComponent(route.slug)}/compare`;
  }
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
    if (route.kind === "project" || route.kind === "compare") {
      const p = await fetchProject(route.slug);
      setActive(p);
    }
  }, [route]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (route.kind !== "project" && route.kind !== "compare") return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [route, refresh]);

  async function openProject(slug: string) {
    navigate({ kind: "project", slug });
    const p = await fetchProject(slug);
    setActive(p);
  }

  async function handleCreate(body: { name: string }) {
    setError(null);
    const project = await createProject({ name: body.name, sourceType: "plugin" });
    setShowNew(false);
    await openProject(project.slug);
    await refresh();
  }

  async function handleSyncFromWp(creds: SyncFromWpCreds) {
    if (!active) return;
    setError(null);
    await pullPluginExport(active.slug, creds);
    await refresh();
  }

  async function handleUploadExport(bundle: File) {
    if (!active) return;
    setError(null);
    await uploadPluginExport(active.slug, bundle);
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
    setActive((prev) =>
      prev
        ? {
            ...prev,
            editorRunning: true,
            editorUrl: url,
            meta: prev.meta
              ? { ...prev.meta, editorStatus: "running", editorPort: Number(new URL(url).port) }
              : prev.meta,
          }
        : prev,
    );
    await refresh();
  }

  async function handleStopEditor() {
    if (!active) return;
    setError(null);
    await stopEditor(active.slug);
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
      throw err;
    }
  }

  const dashTitle =
    route.kind === "compare"
      ? `Compare · ${active?.meta?.name ?? active?.slug ?? "Project"}`
      : route.kind === "project"
        ? active?.meta?.name ?? active?.slug ?? "Project"
        : "Hey, ready to migrate? 👋";
  const dashSubtitle =
    route.kind === "compare"
      ? "Original homepage vs migrated GrapeJS · load & CLS insights"
      : route.kind === "project"
        ? "Upload a ZIP or sync a URL, convert, then open the editor"
        : new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
  const dashSubtitleClass =
    route.kind === "dashboard"
      ? "mt-2 inline-flex items-center rounded-full bg-studio-row px-3 py-1 text-[0.8rem] font-bold text-navy"
      : undefined;

  return (
    <DashboardShell
      title={dashTitle}
      subtitle={dashSubtitle}
      subtitleClassName={dashSubtitleClass}
      activeNav={route.kind === "dashboard" ? "projects" : "project"}
      onHome={() => navigate({ kind: "dashboard" })}
      onTheme={switchTheme}
      isDark={isDark}
      actions={
        route.kind === "dashboard" ? (
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-coral px-5 text-sm font-bold text-white transition hover:-translate-y-px hover:bg-coral-hover hover:shadow-[0_8px_18px_rgba(30,58,95,0.08)]"
            onClick={() => setShowNew(true)}
          >
            Create project
          </button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 rounded-[1.125rem] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger shadow-studio">
          {error}
        </div>
      )}

      {route.kind === "dashboard" && (
        <>
          {loading ? (
            <p className="text-studio-muted">Loading projects…</p>
          ) : (
            <>
              {projects.length > 0 && (
                <section className="mb-4.5 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Project statistics">
                  <article className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 shadow-studio">
                    <span className="relative z-1 text-[0.8125rem] font-semibold text-studio-muted">Total projects</span>
                    <strong className="relative z-1 mt-1.5 block text-[1.85rem] font-extrabold tracking-tight text-teal-ink">
                      {stats.total}
                    </strong>
                    <span className="absolute -right-4 -bottom-5 size-[5.5rem] rounded-full bg-teal-soft" aria-hidden="true" />
                  </article>
                  <article className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 shadow-studio">
                    <span className="relative z-1 text-[0.8125rem] font-semibold text-studio-muted">Converted</span>
                    <strong className="relative z-1 mt-1.5 block text-[1.85rem] font-extrabold tracking-tight text-coral">
                      {stats.ready}
                    </strong>
                    <span className="absolute -right-4 -bottom-5 size-[5.5rem] rounded-full bg-coral-soft" aria-hidden="true" />
                  </article>
                  <article className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 shadow-studio">
                    <span className="relative z-1 text-[0.8125rem] font-semibold text-studio-muted">Editors running</span>
                    <strong className="relative z-1 mt-1.5 block text-[1.85rem] font-extrabold tracking-tight text-navy">
                      {stats.live}
                    </strong>
                    <span className="absolute -right-4 -bottom-5 size-[5.5rem] rounded-full bg-navy-soft" aria-hidden="true" />
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

      {(route.kind === "project" || route.kind === "compare") &&
        (active ? (
          route.kind === "compare" ? (
            <CompareInsights
              project={active}
              onBack={() => navigate({ kind: "project", slug: active.slug })}
            />
          ) : (
            <ProjectFlow
              project={active}
              onBack={() => navigate({ kind: "dashboard" })}
              onCompare={() => navigate({ kind: "compare", slug: active.slug })}
              onSyncFromWp={handleSyncFromWp}
              onUploadExport={handleUploadExport}
              onGenerate={handleGenerate}
              onOpenEditor={handleOpenEditor}
              onStopEditor={handleStopEditor}
              onDelete={() => handleDelete(active.slug)}
            />
          )
        ) : (
          <p className="text-studio-muted">Loading project…</p>
        ))}
    </DashboardShell>
  );
}

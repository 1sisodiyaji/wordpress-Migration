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
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { useTheme } from "./hooks/useTheme";
import { LandingPage } from "./components/LandingPage";
import { LoginPage } from "./components/LoginPage";
import { RegisterPage } from "./components/RegisterPage";
import { VerifyPage } from "./components/VerifyPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./components/ResetPasswordPage";
import { DashboardShell } from "./components/DashboardShell";
import { NewProjectPanel, type PluginPullCreds } from "./components/NewProjectPanel";
import { ProjectFlow } from "./components/ProjectFlow";
import { ProjectList } from "./components/ProjectList";
import type { WpUploadParts } from "./components/WpFileUploads";

type Route =
  | { kind: "landing" }
  | { kind: "login" }
  | { kind: "register" }
  | { kind: "verify"; token?: string; verifyUrl?: string }
  | { kind: "forgot" }
  | { kind: "reset"; token: string }
  | { kind: "dashboard" }
  | { kind: "project"; slug: string };

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pathPart, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const path = pathPart || "landing";

  if (path === "login") return { kind: "login" };
  if (path === "register") return { kind: "register" };
  if (path === "verify") return { kind: "verify", token: params.get("token") ?? undefined };
  if (path === "forgot") return { kind: "forgot" };
  if (path === "reset-password") {
    const token = params.get("token") ?? "";
    return token ? { kind: "reset", token } : { kind: "forgot" };
  }
  if (path === "dashboard") return { kind: "dashboard" };
  if (path.startsWith("project/")) {
    const slug = path.slice("project/".length);
    return slug ? { kind: "project", slug } : { kind: "dashboard" };
  }
  return { kind: "landing" };
}

function routeToHash(route: Route): string {
  switch (route.kind) {
    case "landing":
      return "#/";
    case "login":
      return "#/login";
    case "register":
      return "#/register";
    case "verify":
      return route.token
        ? `#/verify?token=${encodeURIComponent(route.token)}`
        : "#/verify";
    case "forgot":
      return "#/forgot";
    case "reset":
      return `#/reset-password?token=${encodeURIComponent(route.token)}`;
    case "dashboard":
      return "#/dashboard";
    case "project":
      return `#/project/${encodeURIComponent(route.slug)}`;
  }
}

function projectStats(projects: Project[]) {
  const total = projects.length;
  const live = projects.filter((p) => p.meta?.editorStatus === "running" || p.editorRunning).length;
  const ready = projects.filter((p) => p.meta?.generateStatus === "done").length;
  return { total, live, ready };
}

function StudioApp() {
  const { user, loading: authLoading, logout } = useAuth();
  const { switchTheme, isDark } = useTheme();
  const [route, setRouteState] = useState<Route>(() => parseHash());
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerify, setPendingVerify] = useState<{ verifyToken: string; verifyUrl: string } | null>(
    null,
  );

  const stats = useMemo(() => projectStats(projects), [projects]);

  const navigate = useCallback((next: Route) => {
    const hash = routeToHash(next);
    if (window.location.hash !== hash) window.location.hash = hash;
    else setRouteState(next);
  }, []);

  useEffect(() => {
    const onHash = () => setRouteState(parseHash());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.hash = "#/";
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setActive(null);
      return;
    }
    const list = await fetchProjects();
    setProjects(list);
    if (route.kind === "project") {
      const p = await fetchProject(route.slug);
      setActive(p);
    }
  }, [user, route]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
  }, [refresh, user]);

  useEffect(() => {
    if (!user || route.kind !== "project") return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [user, route, refresh]);

  // Auth gates for protected routes
  useEffect(() => {
    if (authLoading) return;
    const protectedKinds = new Set(["dashboard", "project", "verify"]);
    if (!user && protectedKinds.has(route.kind) && route.kind !== "verify") {
      navigate({ kind: "login" });
    }
    if (user && (route.kind === "login" || route.kind === "register")) {
      navigate({ kind: "dashboard" });
    }
  }, [authLoading, user, route.kind, navigate]);

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

  async function handleLogout() {
    await logout();
    navigate({ kind: "landing" });
  }

  if (authLoading) {
    return (
      <div className="auth-screen">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (route.kind === "landing") {
    return (
      <LandingPage
        isAuthed={Boolean(user)}
        onLogin={() => navigate({ kind: "login" })}
        onRegister={() => navigate({ kind: "register" })}
        onDashboard={() => navigate({ kind: "dashboard" })}
        onTheme={switchTheme}
        isDark={isDark}
      />
    );
  }

  if (route.kind === "login") {
    return (
      <LoginPage
        onBack={() => navigate({ kind: "landing" })}
        onRegister={() => navigate({ kind: "register" })}
        onForgot={() => navigate({ kind: "forgot" })}
        onSuccess={() => navigate({ kind: "dashboard" })}
      />
    );
  }

  if (route.kind === "register") {
    return (
      <RegisterPage
        onBack={() => navigate({ kind: "landing" })}
        onLogin={() => navigate({ kind: "login" })}
        onSuccess={(verify) => {
          if (verify.verifyToken) {
            setPendingVerify(verify);
            navigate({ kind: "verify", token: verify.verifyToken, verifyUrl: verify.verifyUrl });
          } else {
            navigate({ kind: "dashboard" });
          }
        }}
      />
    );
  }

  if (route.kind === "verify") {
    return (
      <VerifyPage
        token={route.token ?? pendingVerify?.verifyToken}
        initialVerifyUrl={route.verifyUrl ?? pendingVerify?.verifyUrl}
        onBack={() => navigate({ kind: user ? "dashboard" : "login" })}
        onDone={() => navigate({ kind: "dashboard" })}
      />
    );
  }

  if (route.kind === "forgot") {
    return (
      <ForgotPasswordPage
        onBack={() => navigate({ kind: "login" })}
        onHaveToken={(token) => navigate({ kind: "reset", token })}
      />
    );
  }

  if (route.kind === "reset") {
    return (
      <ResetPasswordPage
        token={route.token}
        onBack={() => navigate({ kind: "login" })}
        onDone={() => navigate({ kind: "dashboard" })}
      />
    );
  }

  if (!user) {
    return (
      <LoginPage
        onBack={() => navigate({ kind: "landing" })}
        onRegister={() => navigate({ kind: "register" })}
        onForgot={() => navigate({ kind: "forgot" })}
        onSuccess={() => navigate({ kind: "dashboard" })}
      />
    );
  }

  const dashTitle =
    route.kind === "project"
      ? active?.meta?.name ?? active?.slug ?? "Project"
      : "Projects";
  const dashSubtitle =
    route.kind === "project"
      ? "Import → convert → open editor"
      : "Your migration workspace";

  return (
    <DashboardShell
      user={user}
      title={dashTitle}
      subtitle={dashSubtitle}
      onHome={() => navigate({ kind: "dashboard" })}
      onLogout={handleLogout}
      onTheme={switchTheme}
      isDark={isDark}
      actions={
        route.kind === "dashboard" ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            + New project
          </button>
        ) : undefined
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      {!user.emailVerified && user.provider === "email" && (
        <div className="alert alert-warn">
          Email not verified yet.{" "}
          <button type="button" className="link-btn" onClick={() => navigate({ kind: "verify" })}>
            Verify now
          </button>
        </div>
      )}

      {route.kind === "dashboard" && (
        <>
          {loading ? (
            <p className="muted">Loading projects…</p>
          ) : (
            <>
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

export default function App() {
  return (
    <AuthProvider>
      <StudioApp />
    </AuthProvider>
  );
}

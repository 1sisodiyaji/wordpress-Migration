export type JobStatus = "pending" | "running" | "done" | "failed";

export type SourceType = "files" | "plugin";

export interface StudioMeta {
  slug: string;
  name: string;
  sourceType: SourceType;
  url?: string;
  scrapeStatus: JobStatus;
  generateStatus: JobStatus;
  editorStatus: "stopped" | "starting" | "running";
  editorPort?: number;
  hasDbDump?: boolean;
  hasWpContent?: boolean;
  hasWpConfig?: boolean;
  hasPluginExport?: boolean;
  uploadedFiles?: string[];
  error?: string;
}

export interface UnresolvedShortcode {
  tag: string;
  postId: number;
  path: string;
}

export interface ProjectAudit {
  unresolvedShortcodes: UnresolvedShortcode[];
  warnings: string[];
  summary: {
    pages: number;
    templates: number;
    menus: number;
    media: number;
    hasLayout: boolean;
  } | null;
}

export interface Project {
  slug: string;
  meta: StudioMeta | null;
  hasData: boolean;
  logs: string;
  phase: string | null;
  scrapeRunning: boolean;
  editorRunning: boolean;
  editorUrl: string | null;
  audit: ProjectAudit | null;
}

async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(res.ok ? "Empty response from server" : `Request failed (${res.status})`);
  }
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new Error(
      `Server returned a web page instead of JSON (${res.status}). The API may have crashed — check the Studio terminal for errors.`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      res.ok
        ? "Server returned invalid JSON"
        : `Request failed (${res.status}): ${trimmed.slice(0, 180)}`,
    );
  }
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  const data = await readJson<{ projects: Project[] }>(res);
  return data.projects;
}

export async function fetchProject(slug: string): Promise<Project> {
  const res = await fetch(`/api/projects/${slug}`);
  const data = await readJson<{ project: Project; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Failed to load project");
  return data.project;
}

export async function createProject(body: {
  name: string;
  sourceType: SourceType;
}): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson<{ project: Project; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Failed to create project");
  return data.project;
}

export async function uploadWpParts(
  slug: string,
  parts: { sql?: File; wpContent?: File; wpConfig?: File },
): Promise<void> {
  const form = new FormData();
  if (parts.sql) form.append("sql", parts.sql);
  if (parts.wpContent) form.append("wpContent", parts.wpContent);
  if (parts.wpConfig) form.append("wpConfig", parts.wpConfig);

  if (!parts.sql && !parts.wpContent && !parts.wpConfig) {
    throw new Error("Select at least one file to upload");
  }

  const res = await fetch(`/api/projects/${slug}/upload`, { method: "POST", body: form });
  const data = await readJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
}

export async function uploadPluginExport(slug: string, bundle: File): Promise<void> {
  const form = new FormData();
  form.append("bundle", bundle);
  const res = await fetch(`/api/projects/${slug}/plugin-export`, { method: "POST", body: form });
  const data = await readJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Plugin export import failed");
}

export async function pullPluginExport(
  slug: string,
  body: { wpUrl: string; username: string; appPassword: string; copyMedia: boolean },
): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/plugin-pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Pull from WordPress failed");
}

export async function syncPluginFromLocalWp(
  slug: string,
  body: { copyMedia?: boolean; skipGenerate?: boolean } = {},
): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/plugin-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Local WordPress sync failed");
}

export async function startScrape(slug: string): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/scrape`, { method: "POST" });
  if (!res.ok) {
    const data = await readJson<{ error?: string }>(res);
    throw new Error(data.error ?? "Scrape failed to start");
  }
}

export async function startGenerate(slug: string): Promise<StudioMeta> {
  const res = await fetch(`/api/projects/${slug}/generate`, { method: "POST" });
  const data = await readJson<{ meta: StudioMeta; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Generate failed");
  return data.meta;
}

export async function startEditor(slug: string): Promise<{ url: string; port: number }> {
  const res = await fetch(`/api/projects/${slug}/editor/start`, { method: "POST" });
  const data = await readJson<{ url: string; port: number; error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Editor failed to start");
  return { url: data.url, port: data.port };
}

export async function stopEditor(slug: string): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/editor/stop`, { method: "POST" });
  const data = await readJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(data.error ?? "Editor failed to stop");
}

export async function deleteProject(slug: string): Promise<void> {
  const res = await fetch(`/api/projects/${slug}`, { method: "DELETE" });
  const data = await readJson<{ error?: string }>(res).catch(() => ({ error: undefined }));
  if (!res.ok) throw new Error(data.error ?? "Failed to delete project");
}

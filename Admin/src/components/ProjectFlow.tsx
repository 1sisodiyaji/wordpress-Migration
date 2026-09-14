import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "../api";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDeleteModal,
  Field,
  FileDrop,
  Hint,
  Input,
  Label,
} from "./ui";
import { cx } from "../lib/cx";

export interface SyncFromWpCreds {
  wpUrl: string;
  username: string;
  appPassword: string;
  copyMedia: boolean;
}

interface Props {
  project: Project;
  onBack: () => void;
  onCompare: () => void;
  onSyncFromWp: (creds: SyncFromWpCreds) => Promise<void>;
  onUploadExport: (bundle: File) => Promise<void>;
  onGenerate: () => Promise<void>;
  onOpenEditor: () => Promise<void>;
  onStopEditor: () => Promise<void>;
  onDelete: () => Promise<void> | void;
}

function stepState(
  status: string | undefined,
  running: boolean,
): "pending" | "active" | "done" | "failed" {
  if (status === "failed") return "failed";
  if (status === "done") return "done";
  if (running || status === "running") return "active";
  return "pending";
}

function isLocalUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

export function ProjectFlow({
  project,
  onBack,
  onCompare,
  onSyncFromWp,
  onUploadExport,
  onGenerate,
  onOpenEditor,
  onStopEditor,
  onDelete,
}: Props) {
  const meta = project.meta;
  const [wpUrl, setWpUrl] = useState(meta?.url ?? "");
  const [wpUser, setWpUser] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [copyMedia, setCopyMedia] = useState(true);
  const [pluginZip, setPluginZip] = useState<File | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (meta?.url) setWpUrl(meta.url);
  }, [meta?.url]);

  const scrapeStep = stepState(meta?.scrapeStatus, project.scrapeRunning);
  const generateStep = stepState(meta?.generateStatus, meta?.generateStatus === "running");
  const editorStep =
    meta?.editorStatus === "running"
      ? "done"
      : meta?.editorStatus === "starting"
        ? "active"
        : meta?.generateStatus === "done"
          ? "pending"
          : "pending";

  const canGenerate = scrapeStep === "done" && generateStep !== "active" && generateStep !== "done";
  const canOpenEditor = generateStep === "done";
  const editorRunning = project.editorRunning || meta?.editorStatus === "running";
  const editorStarting = meta?.editorStatus === "starting";
  const editorUrl =
    project.editorUrl ?? (meta?.editorPort ? `http://localhost:${meta.editorPort}` : null);
  const audit = project.audit;
  const syncRunning = scrapeStep === "active" || generateStep === "active" || syncBusy;
  const local = isLocalUrl(wpUrl);
  const displayName = meta?.name ?? project.slug;

  async function handleEditorAction(action: "open" | "stop") {
    setEditorBusy(true);
    try {
      if (action === "stop") await onStopEditor();
      else await onOpenEditor();
    } finally {
      setEditorBusy(false);
    }
  }

  async function submitSync() {
    setFormError(null);
    if (!wpUrl.trim() || !wpUser.trim() || !appPassword.trim()) {
      setFormError("Enter the WordPress URL, username, and password");
      return;
    }
    setSyncBusy(true);
    try {
      await onSyncFromWp({
        wpUrl: wpUrl.trim(),
        username: wpUser.trim(),
        appPassword: appPassword.trim(),
        copyMedia,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusy(false);
    }
  }

  async function submitZip() {
    setFormError(null);
    if (!pluginZip) {
      setFormError("Choose a wp-grape-export .zip to upload");
      return;
    }
    setUploadBusy(true);
    try {
      await onUploadExport(pluginZip);
      setPluginZip(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await onDelete();
      setShowDelete(false);
    } finally {
      setDeleteBusy(false);
    }
  }

  const stepShell = (state: string, numTone: string, children: ReactNode, num: number) => (
    <li
      className={cx(
        "flex gap-4 rounded-[1.625rem] bg-studio-surface p-5 shadow-studio",
        state === "active" && "shadow-[0_14px_34px_rgba(255,107,74,0.12)]",
      )}
    >
      <span
        className={cx(
          "grid size-9.5 shrink-0 place-items-center rounded-full text-[0.9rem] font-extrabold",
          state === "active" && "bg-coral text-white",
          state === "done" && "bg-ok-soft text-ok",
          state === "failed" && "bg-danger-soft text-danger",
          state === "pending" && numTone,
        )}
      >
        {num}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );

  return (
    <div>
      <div className="mb-4.5 flex flex-wrap items-center gap-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Projects
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="sr-only">{displayName}</h1>
          <p className="m-0 text-sm font-semibold text-studio-muted">
            {meta?.url ? meta.url : "No WordPress URL yet"} · <code>{project.slug}</code>
          </p>
        </div>
        <Button type="button" variant="ghost" className="!ml-auto !text-danger hover:!bg-danger-soft" onClick={() => setShowDelete(true)}>
          Delete
        </Button>
      </div>

      <ol className="m-0 mb-6 flex list-none flex-col gap-4.5 p-0">
        {stepShell(
          scrapeStep,
          "bg-teal-soft text-teal-ink",
          <>
            <h3 className="mt-0 mb-1.5 text-base font-extrabold tracking-tight">Import WordPress export</h3>
            <p className="mt-0 mb-3 text-sm text-studio-muted">
              Upload a <code>wp-grape-export</code> ZIP, or sync live from a site URL with credentials.
            </p>

            <div className="grid w-full grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
              <Card
                title="Upload export ZIP"
                description="Import an existing wp-grape-export bundle from your computer."
              >
                <div className="flex flex-col gap-3.5">
                  <FileDrop
                    accept=".zip"
                    file={pluginZip}
                    onFile={setPluginZip}
                    placeholder="Drop or choose export ZIP"
                    disabled={syncRunning || uploadBusy}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="default"
                      disabled={!pluginZip || uploadBusy || syncRunning}
                      onClick={submitZip}
                    >
                      {uploadBusy ? "Uploading…" : "Import ZIP"}
                    </Button>
                  </div>
                </div>
              </Card>

              <div
                className="flex items-center gap-3 px-1 text-xs font-semibold text-studio-muted lowercase lg:flex-col lg:justify-center"
                aria-hidden="true"
              >
                <span className="h-px flex-1 bg-studio-border lg:h-auto lg:w-px lg:flex-1" />
                <span>or</span>
                <span className="h-px flex-1 bg-studio-border lg:h-auto lg:w-px lg:flex-1" />
              </div>

              <Card
                title="Sync from URL"
                description="Connect to any WordPress install running wp-grape-export."
              >
                <div className="flex flex-col gap-3.5">
                  <Field>
                    <Label htmlFor="wp-url">WordPress URL</Label>
                    <Input
                      id="wp-url"
                      type="url"
                      value={wpUrl}
                      onChange={(e) => setWpUrl(e.target.value)}
                      placeholder="http://localhost:5001"
                      autoComplete="url"
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="wp-user">Username</Label>
                    <Input
                      id="wp-user"
                      type="text"
                      value={wpUser}
                      onChange={(e) => setWpUser(e.target.value)}
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="wp-pass">{local ? "Password" : "App password"}</Label>
                    <Input
                      id="wp-pass"
                      type="password"
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      placeholder={local ? "wp-admin password" : "xxxx xxxx xxxx xxxx"}
                      autoComplete="current-password"
                    />
                  </Field>

                  <Hint>
                    {local
                      ? "Localhost: use your normal wp-admin password."
                      : "Remote: create an Application Password under Users → Profile."}
                  </Hint>

                  <Checkbox
                    id="copy-media"
                    checked={copyMedia}
                    onChange={setCopyMedia}
                    label="Include media files"
                    disabled={syncRunning || uploadBusy}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="default" disabled={syncRunning || uploadBusy} onClick={submitSync}>
                      {syncRunning ? "Syncing…" : scrapeStep === "done" ? "Resync" : "Sync from URL"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {formError && (
              <div className="mt-3 rounded-[1.125rem] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
                {formError}
              </div>
            )}
          </>,
          1,
        )}

        {stepShell(
          generateStep,
          "bg-coral-soft text-coral",
          <>
            <h3 className="mt-0 mb-1.5 text-base font-extrabold tracking-tight">Convert to GrapeJS</h3>
            <p className="mt-0 mb-3 text-sm text-studio-muted">
              Build a React project with GrapeJS components from imported HTML.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                disabled={!canGenerate && generateStep !== "done"}
                onClick={onGenerate}
              >
                {generateStep === "active" ? "Converting…" : generateStep === "done" ? "Re-convert" : "Convert"}
              </Button>
            </div>
          </>,
          2,
        )}

        {stepShell(
          editorStep,
          "bg-navy-soft text-navy",
          <>
            <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
              <h3 className="m-0 text-base font-extrabold tracking-tight">Open editor</h3>
              {editorRunning && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-[0.72rem] font-semibold text-coral">
                  <span className="studio-live-dot size-1.5 rounded-full bg-ok" aria-hidden="true" />
                  Live
                </span>
              )}
              {editorStarting && (
                <span className="rounded-full bg-teal-soft px-2.5 py-1 text-[0.7rem] font-bold text-teal-ink">
                  Starting…
                </span>
              )}
            </div>
            <p className="mt-0 mb-3 text-sm text-studio-muted">
              Launch the GrapeJS editor. The URL below is the live listen address
              {meta?.editorPort ? ` (port ${meta.editorPort})` : ""}, not a fixed default.
            </p>

            {(editorRunning || editorStarting) && editorUrl && (
              <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-full bg-teal-soft px-4 py-2.5 text-sm">
                <span className="text-xs tracking-wide text-studio-muted uppercase">
                  {editorStarting ? "Starting at" : "Running at"}
                </span>
                <a className="font-bold break-all text-teal-ink hover:underline" href={editorUrl} target="_blank" rel="noopener noreferrer">
                  {editorUrl}
                </a>
                {meta?.editorPort ? (
                  <span className="ml-auto rounded-full bg-studio-surface px-2.5 py-0.5 text-xs font-bold text-navy">
                    port {meta.editorPort}
                  </span>
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                disabled={!canOpenEditor || editorBusy || editorStarting}
                onClick={() => handleEditorAction("open")}
              >
                {editorStarting ? "Starting…" : editorRunning ? "Open in new tab" : "Start & open"}
              </Button>

              {(editorRunning || editorStarting) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={editorBusy || editorStarting}
                  onClick={() => handleEditorAction("stop")}
                >
                  {editorBusy ? "Stopping…" : "Stop editor"}
                </Button>
              )}

              {canOpenEditor && (
                <Button type="button" variant="ghost" onClick={onCompare}>
                  Compare & insights
                </Button>
              )}
            </div>
          </>,
          3,
        )}
      </ol>

      {audit &&
        (audit.summary || audit.unresolvedShortcodes.length > 0 || audit.warnings.length > 0) && (
          <section className="mb-6 overflow-hidden rounded-3xl bg-studio-surface px-4 pb-4 shadow-studio">
            <div className="flex items-center justify-between border-b border-studio-border px-0 py-3">
              <h3 className="m-0 text-sm font-bold">Import audit</h3>
              {audit.unresolvedShortcodes.length === 0 && audit.warnings.length === 0 ? (
                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[0.7rem] font-bold text-ok">Clean</span>
              ) : (
                <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[0.7rem] font-bold text-danger">
                  {audit.unresolvedShortcodes.length + audit.warnings.length} issue(s)
                </span>
              )}
            </div>

            {audit.summary && (
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-3 p-0 pt-3 text-sm text-studio-muted">
                <li className="rounded-2xl bg-studio-row px-3.5 py-3">
                  <strong className="text-studio-text">{audit.summary.pages}</strong> pages
                </li>
                <li className="rounded-2xl bg-studio-row px-3.5 py-3">
                  <strong className="text-studio-text">{audit.summary.templates}</strong> templates
                </li>
                <li className="rounded-2xl bg-studio-row px-3.5 py-3">
                  <strong className="text-studio-text">{audit.summary.menus}</strong> menus
                </li>
                <li className="rounded-2xl bg-studio-row px-3.5 py-3">
                  <strong className="text-studio-text">{audit.summary.media}</strong> media
                </li>
                <li className="rounded-2xl bg-studio-row px-3.5 py-3">
                  {audit.summary.hasLayout ? "Header/footer ✓" : "No layout"}
                </li>
              </ul>
            )}

            {audit.warnings.length > 0 && (
              <div className="mt-3">
                <h4 className="mt-0 mb-2 text-xs font-semibold tracking-wide text-studio-muted uppercase">Warnings</h4>
                <ul className="m-0 list-disc pl-5 text-sm text-studio-muted">
                  {audit.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {audit.unresolvedShortcodes.length > 0 && (
              <div className="mt-3">
                <h4 className="mt-0 mb-2 text-xs font-semibold tracking-wide text-studio-muted uppercase">
                  Unresolved shortcodes
                </h4>
                <table className="w-full border-collapse text-[0.82rem]">
                  <thead>
                    <tr>
                      <th className="border-b border-studio-border px-2 py-2 text-left font-medium text-studio-muted">
                        Shortcode
                      </th>
                      <th className="border-b border-studio-border px-2 py-2 text-left font-medium text-studio-muted">
                        Page
                      </th>
                      <th className="border-b border-studio-border px-2 py-2 text-left font-medium text-studio-muted">
                        Post ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.unresolvedShortcodes.map((s, i) => (
                      <tr key={i}>
                        <td className="border-b border-studio-border px-2 py-2">
                          <code>[{s.tag}]</code>
                        </td>
                        <td className="border-b border-studio-border px-2 py-2">{s.path}</td>
                        <td className="border-b border-studio-border px-2 py-2">{s.postId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      {(project.phase || project.logs) && (
        <section className="mb-6 overflow-hidden rounded-3xl bg-studio-surface shadow-studio">
          <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
            <h3 className="m-0 text-sm font-bold">Activity log</h3>
            {project.phase && (
              <span className="rounded-full bg-studio-row px-2.5 py-1 text-[0.7rem] font-bold text-studio-muted">
                {project.phase}
              </span>
            )}
          </div>
          <pre className="m-0 max-h-[17.5rem] overflow-auto rounded-b-3xl bg-studio-row p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-studio-text">
            {project.logs || "Waiting for activity…"}
          </pre>
        </section>
      )}

      {meta?.error && (
        <div className="rounded-[1.125rem] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger shadow-studio">
          {meta.error}
        </div>
      )}

      {showDelete && (
        <ConfirmDeleteModal
          name={displayName}
          detail={`Removes site data (Projects/${project.slug}) and the generated project (Projects/${project.slug}).`}
          busy={deleteBusy}
          onCancel={() => !deleteBusy && setShowDelete(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

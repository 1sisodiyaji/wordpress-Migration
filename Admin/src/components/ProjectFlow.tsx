import { useEffect, useState } from "react";
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

export interface SyncFromWpCreds {
  wpUrl: string;
  username: string;
  appPassword: string;
  copyMedia: boolean;
}

interface Props {
  project: Project;
  onBack: () => void;
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

  return (
    <div className="flow">
      <div className="flow-header">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Projects
        </Button>
        <div>
          <h1>{displayName}</h1>
          <p className="muted">
            {meta?.url ? meta.url : "No WordPress URL yet"} · <code>{project.slug}</code>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="ui-btn-danger-text"
          onClick={() => setShowDelete(true)}
        >
          Delete
        </Button>
      </div>

      <ol className="stepper">
        <li className={`step step-${scrapeStep}`}>
          <span className="step-num">1</span>
          <div className="step-body">
            <h3>Import WordPress export</h3>
            <p>
              Upload a <code>wp-grape-export</code> ZIP, or sync live from a site URL with credentials.
            </p>

            <div className="sync-panel">
              <Card
                title="Upload export ZIP"
                description="Import an existing wp-grape-export bundle from your computer."
              >
                <div className="ui-stack sync-upload-stack">
                  <FileDrop
                    accept=".zip"
                    file={pluginZip}
                    onFile={setPluginZip}
                    placeholder="Drop or choose export ZIP"
                    disabled={syncRunning || uploadBusy}
                  />
                  <div className="ui-actions">
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

              <div className="sync-panel-divider" aria-hidden="true">
                <span>or</span>
              </div>

              <Card
                title="Sync from URL"
                description="Connect to any WordPress install running wp-grape-export."
              >
                <div className="ui-stack">
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

                  <div className="ui-actions">
                    <Button
                      type="button"
                      variant="default"
                      disabled={syncRunning || uploadBusy}
                      onClick={submitSync}
                    >
                      {syncRunning
                        ? "Syncing…"
                        : scrapeStep === "done"
                          ? "Resync"
                          : "Sync from URL"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {formError && <div className="alert alert-error">{formError}</div>}
          </div>
        </li>

        <li className={`step step-${generateStep}`}>
          <span className="step-num">2</span>
          <div className="step-body">
            <h3>Convert to GrapeJS</h3>
            <p>Build a React project with GrapeJS components from imported HTML.</p>
            <div className="ui-actions">
              <Button
                type="button"
                variant="default"
                disabled={!canGenerate && generateStep !== "done"}
                onClick={onGenerate}
              >
                {generateStep === "active"
                  ? "Converting…"
                  : generateStep === "done"
                    ? "Re-convert"
                    : "Convert"}
              </Button>
            </div>
          </div>
        </li>

        <li className={`step step-${editorStep}`}>
          <span className="step-num">3</span>
          <div className="step-body">
            <div className="step-title-row">
              <h3>Open editor</h3>
              {editorRunning && (
                <span className="live-badge">
                  <span className="live-dot" aria-hidden="true" />
                  Live
                </span>
              )}
              {editorStarting && <span className="badge badge-scraping">Starting…</span>}
            </div>
            <p>
              Launch the GrapeJS editor. The URL below is the live listen address
              {meta?.editorPort ? ` (port ${meta.editorPort})` : ""}, not a fixed default.
            </p>

            {(editorRunning || editorStarting) && editorUrl && (
              <div className="editor-url-chip">
                <span className="editor-url-label">{editorStarting ? "Starting at" : "Running at"}</span>
                <a href={editorUrl} target="_blank" rel="noopener noreferrer">
                  {editorUrl}
                </a>
                {meta?.editorPort ? <span className="editor-url-port">port {meta.editorPort}</span> : null}
              </div>
            )}

            <div className="ui-actions">
              <Button
                type="button"
                variant="default"
                disabled={!canOpenEditor || editorBusy || editorStarting}
                onClick={() => handleEditorAction("open")}
              >
                {editorStarting
                  ? "Starting…"
                  : editorRunning
                    ? "Open in new tab"
                    : "Start & open"}
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
            </div>
          </div>
        </li>
      </ol>

      {audit &&
        (audit.summary || audit.unresolvedShortcodes.length > 0 || audit.warnings.length > 0) && (
          <section className="audit-panel">
            <div className="log-panel-header">
              <h3>Import audit</h3>
              {audit.unresolvedShortcodes.length === 0 && audit.warnings.length === 0 ? (
                <span className="badge badge-ok">Clean</span>
              ) : (
                <span className="badge badge-warn">
                  {audit.unresolvedShortcodes.length + audit.warnings.length} issue(s)
                </span>
              )}
            </div>

            {audit.summary && (
              <ul className="audit-summary">
                <li>
                  <strong>{audit.summary.pages}</strong> pages
                </li>
                <li>
                  <strong>{audit.summary.templates}</strong> templates
                </li>
                <li>
                  <strong>{audit.summary.menus}</strong> menus
                </li>
                <li>
                  <strong>{audit.summary.media}</strong> media
                </li>
                <li>{audit.summary.hasLayout ? "Header/footer ✓" : "No layout"}</li>
              </ul>
            )}

            {audit.warnings.length > 0 && (
              <div className="audit-block">
                <h4>Warnings</h4>
                <ul className="audit-warnings">
                  {audit.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {audit.unresolvedShortcodes.length > 0 && (
              <div className="audit-block">
                <h4>Unresolved shortcodes</h4>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Shortcode</th>
                      <th>Page</th>
                      <th>Post ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.unresolvedShortcodes.map((s, i) => (
                      <tr key={i}>
                        <td>
                          <code>[{s.tag}]</code>
                        </td>
                        <td>{s.path}</td>
                        <td>{s.postId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      {(project.phase || project.logs) && (
        <section className="log-panel">
          <div className="log-panel-header">
            <h3>Activity log</h3>
            {project.phase && <span className="badge">{project.phase}</span>}
          </div>
          <pre className="log-output">{project.logs || "Waiting for activity…"}</pre>
        </section>
      )}

      {meta?.error && <div className="alert alert-error">{meta.error}</div>}

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

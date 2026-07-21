import { useState } from "react";
import type { Project } from "../api";
import { WpFileUploads, type WpUploadParts } from "./WpFileUploads";

interface Props {
  project: Project;
  onBack: () => void;
  onScrape: () => Promise<void>;
  onGenerate: () => Promise<void>;
  onOpenEditor: () => Promise<void>;
  onStopEditor: () => Promise<void>;
  onUpload: (parts: WpUploadParts) => Promise<void>;
  onDelete: () => void;
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

export function ProjectFlow({
  project,
  onBack,
  onScrape,
  onGenerate,
  onOpenEditor,
  onStopEditor,
  onUpload,
  onDelete,
}: Props) {
  const meta = project.meta;
  const [sql, setSql] = useState<File | null>(null);
  const [wpContent, setWpContent] = useState<File | null>(null);
  const [wpConfig, setWpConfig] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);

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

  const filesReady = Boolean(meta?.hasDbDump || meta?.hasWpContent);
  const isPlugin = meta?.sourceType === "plugin";
  const canGenerate = scrapeStep === "done" && generateStep !== "active" && generateStep !== "done";
  const canOpenEditor = generateStep === "done";
  const editorRunning = project.editorRunning || meta?.editorStatus === "running";
  const editorStarting = meta?.editorStatus === "starting";
  const audit = project.audit;

  async function handleEditorAction(action: "open" | "stop") {
    setEditorBusy(true);
    try {
      if (action === "stop") await onStopEditor();
      else await onOpenEditor();
    } finally {
      setEditorBusy(false);
    }
  }

  async function submitUpload() {
    if (!sql && !wpContent && !wpConfig) return;
    setUploadBusy(true);
    try {
      await onUpload({
        sql: sql ?? undefined,
        wpContent: wpContent ?? undefined,
        wpConfig: wpConfig ?? undefined,
      });
      setSql(null);
      setWpContent(null);
      setWpConfig(null);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="flow">
      <div className="flow-header">
        <button type="button" className="btn btn-ghost" onClick={onBack}>← Projects</button>
        <div>
          <h1>{meta?.name ?? project.slug}</h1>
          <p className="muted">{meta?.url ?? "WordPress file import"} · <code>{project.slug}</code></p>
        </div>
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => {
          const name = meta?.name ?? project.slug;
          if (confirm(`Delete "${name}"? All site and project files will be removed permanently.`)) onDelete();
        }}>
          Delete
        </button>
      </div>

      <ol className="stepper">
        <li className={`step step-${scrapeStep}`}>
          <span className="step-num">1</span>
          <div className="step-body">
            <h3>Upload &amp; import</h3>
            <p>
              {isPlugin
                ? "Imported from a wp-grape-export bundle (shortcodes, Elementor & Theme Builder resolved inside WordPress)."
                : meta?.sourceType === "files"
                  ? "Upload SQL, wp-content (.zip), and wp-config.php as separate files."
                  : "Crawl the live website and save HTML, CSS, and assets."}
            </p>

            {meta?.sourceType === "files" && (
              <>
                <ul className="wp-checklist">
                  <li className={meta.hasDbDump ? "ok" : ""}>Database (.sql) {meta.hasDbDump ? "✓" : "—"}</li>
                  <li className={meta.hasWpContent ? "ok" : ""}>wp-content (.zip) {meta.hasWpContent ? "✓" : "—"}</li>
                  <li className={meta.hasWpConfig ? "ok" : ""}>wp-config.php {meta.hasWpConfig ? "✓" : "optional"}</li>
                </ul>

                <WpFileUploads
                  compact
                  sql={sql}
                  wpContent={wpContent}
                  wpConfig={wpConfig}
                  onSqlChange={setSql}
                  onWpContentChange={setWpContent}
                  onWpConfigChange={setWpConfig}
                />

                <div className="step-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={uploadBusy || (!sql && !wpContent && !wpConfig)}
                    onClick={submitUpload}
                  >
                    {uploadBusy ? "Uploading…" : "Save uploads"}
                  </button>
                </div>
              </>
            )}

            {!isPlugin && (
              <div className="step-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={scrapeStep === "active" || (meta?.sourceType === "files" && !filesReady && scrapeStep !== "done")}
                  onClick={onScrape}
                >
                  {scrapeStep === "active"
                    ? "Importing…"
                    : scrapeStep === "done"
                      ? "Re-import"
                      : meta?.sourceType === "files"
                        ? "Start import"
                        : "Start scrape"}
                </button>
              </div>
            )}

            {isPlugin && scrapeStep === "active" && <p className="muted">Importing bundle…</p>}
          </div>
        </li>

        <li className={`step step-${generateStep}`}>
          <span className="step-num">2</span>
          <div className="step-body">
            <h3>Convert to GrapeJS</h3>
            <p>Build a React project with GrapeJS components from imported HTML.</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canGenerate && generateStep !== "done"}
              onClick={onGenerate}
            >
              {generateStep === "active" ? "Converting…" : generateStep === "done" ? "Re-convert" : "Convert"}
            </button>
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
              {editorStarting && (
                <span className="badge badge-scraping">Starting…</span>
              )}
            </div>
            <p>
              Launch the GrapeJS app on another port
              {meta?.editorPort ? ` (port ${meta.editorPort})` : ""} and open it in a new tab.
            </p>

            {editorRunning && project.editorUrl && (
              <div className="editor-url-chip">
                <span className="editor-url-label">Running at</span>
                <a href={project.editorUrl} target="_blank" rel="noopener noreferrer">
                  {project.editorUrl}
                </a>
              </div>
            )}

            <div className="step-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canOpenEditor || editorBusy || editorStarting}
                onClick={() => handleEditorAction("open")}
              >
                {editorStarting
                  ? "Starting…"
                  : editorRunning
                    ? "Open in new tab"
                    : "Start & open"}
              </button>

              {(editorRunning || editorStarting) && (
                <button
                  type="button"
                  className="btn btn-stop"
                  disabled={editorBusy || editorStarting}
                  onClick={() => handleEditorAction("stop")}
                >
                  {editorBusy ? "Stopping…" : "Stop editor"}
                </button>
              )}
            </div>
          </div>
        </li>
      </ol>

      {audit && (audit.summary || audit.unresolvedShortcodes.length > 0 || audit.warnings.length > 0) && (
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
              <li><strong>{audit.summary.pages}</strong> pages</li>
              <li><strong>{audit.summary.templates}</strong> templates</li>
              <li><strong>{audit.summary.menus}</strong> menus</li>
              <li><strong>{audit.summary.media}</strong> media</li>
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
                  <tr><th>Shortcode</th><th>Page</th><th>Post ID</th></tr>
                </thead>
                <tbody>
                  {audit.unresolvedShortcodes.map((s, i) => (
                    <tr key={i}>
                      <td><code>[{s.tag}]</code></td>
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
    </div>
  );
}

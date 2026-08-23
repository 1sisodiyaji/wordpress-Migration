import { useState } from "react";
import type { SourceType } from "../api";
import { WpFileUploads, type WpUploadParts } from "./WpFileUploads";

export interface PluginPullCreds {
  wpUrl: string;
  username: string;
  appPassword: string;
  copyMedia: boolean;
}

interface Props {
  onClose: () => void;
  onCreate: (body: {
    name: string;
    sourceType: SourceType;
    wpParts?: WpUploadParts;
    pluginZip?: File;
    pluginPull?: PluginPullCreds;
  }) => Promise<void>;
}

export function NewProjectPanel({ onClose, onCreate }: Props) {
  const [tab, setTab] = useState<SourceType>("plugin");
  const [name, setName] = useState("");
  const [sql, setSql] = useState<File | null>(null);
  const [wpContent, setWpContent] = useState<File | null>(null);
  const [wpConfig, setWpConfig] = useState<File | null>(null);

  const [pluginMode, setPluginMode] = useState<"zip" | "pull">("zip");
  const [pluginZip, setPluginZip] = useState<File | null>(null);
  const [wpUrl, setWpUrl] = useState("http://localhost:8084");
  const [wpUser, setWpUser] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [copyMedia, setCopyMedia] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === "files" && !sql && !wpContent && !wpConfig) {
        setError("Upload at least one WordPress file (SQL, wp-content zip, or wp-config.php)");
        return;
      }
      if (tab === "plugin" && pluginMode === "zip" && !pluginZip) {
        setError("Choose a wp-grape-export .zip bundle");
        return;
      }
      if (tab === "plugin" && pluginMode === "pull" && (!wpUrl.trim() || !wpUser.trim() || !appPassword.trim())) {
        setError("Enter the WordPress URL, username and application password");
        return;
      }

      const fallbackName =
        tab === "plugin" && pluginMode === "pull"
          ? wpUrl
          : tab === "plugin" && pluginZip
            ? pluginZip.name.replace(/\.zip$/i, "")
            : "New project";

      await onCreate({
        name: name.trim() || fallbackName,
        sourceType: tab,
        wpParts:
          tab === "files"
            ? { sql: sql ?? undefined, wpContent: wpContent ?? undefined, wpConfig: wpConfig ?? undefined }
            : undefined,
        pluginZip: tab === "plugin" && pluginMode === "zip" ? (pluginZip ?? undefined) : undefined,
        pluginPull:
          tab === "plugin" && pluginMode === "pull"
            ? {
                wpUrl: wpUrl.trim(),
                username: wpUser.trim(),
                appPassword: appPassword.trim(),
                copyMedia,
              }
            : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New project</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="tabs">
          <button type="button" className={tab === "plugin" ? "active" : ""} onClick={() => setTab("plugin")}>
            Plugin export
          </button>
          <button type="button" className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
            WordPress files
          </button>
        </div>

        <form onSubmit={submit} className="modal-body">
          <label>
            Project name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My website"
              autoComplete="off"
            />
          </label>

          {tab === "files" && (
            <WpFileUploads
              sql={sql}
              wpContent={wpContent}
              wpConfig={wpConfig}
              onSqlChange={setSql}
              onWpContentChange={setWpContent}
              onWpConfigChange={setWpConfig}
            />
          )}

          {tab === "plugin" && (
            <div className="plugin-source">
              <p className="muted">
                Best fidelity: shortcodes, Elementor &amp; Theme Builder templates are resolved inside WordPress
                by the <code>wp-grape-export</code> plugin.
              </p>
              <div className="tabs tabs-sub">
                <button type="button" className={pluginMode === "zip" ? "active" : ""} onClick={() => setPluginMode("zip")}>
                  Upload ZIP
                </button>
                <button type="button" className={pluginMode === "pull" ? "active" : ""} onClick={() => setPluginMode("pull")}>
                  Pull from WordPress
                </button>
              </div>

              {pluginMode === "zip" ? (
                <label className="file-drop">
                  wp-grape-export bundle (.zip)
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => setPluginZip(e.target.files?.[0] ?? null)}
                  />
                  {pluginZip && <span className="file-name">{pluginZip.name}</span>}
                </label>
              ) : (
                <>
                  <label>
                    WordPress URL
                    <input
                      type="url"
                      value={wpUrl}
                      onChange={(e) => setWpUrl(e.target.value)}
                      placeholder="http://localhost:8084"
                      autoComplete="url"
                    />
                  </label>
                  <label>
                    Admin username
                    <input
                      type="text"
                      value={wpUser}
                      onChange={(e) => setWpUser(e.target.value)}
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </label>
                  <label>
                    {/localhost|127\.0\.0\.1/i.test(wpUrl)
                      ? "Password (wp-admin)"
                      : "Application Password"}
                    <input
                      type="password"
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      placeholder={
                        /localhost|127\.0\.0\.1/i.test(wpUrl)
                          ? "Normal wp-admin password"
                          : "xxxx xxxx xxxx xxxx xxxx xxxx"
                      }
                      autoComplete="off"
                    />
                  </label>
                  <p className="muted">
                    <strong>Live / remote sites:</strong> use an Application Password from{" "}
                    <em>Users → Profile → Application Passwords</em>.
                    <br />
                    <strong>Localhost:</strong> normal wp-admin username + password works.
                  </p>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={copyMedia} onChange={(e) => setCopyMedia(e.target.checked)} />
                    Include media files (larger, self-contained preview)
                  </label>
                </>
              )}
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import type { Project } from "../api";

interface Props {
  projects: Project[];
  onOpen: (slug: string) => void;
  onDelete: (slug: string) => void;
  onCreate?: () => void;
}

function statusBadge(project: Project): string {
  const m = project.meta;
  if (!m) return "new";
  if (m.editorStatus === "running") return "editor live";
  if (m.generateStatus === "done") return "converted";
  if (m.scrapeStatus === "done") return "scraped";
  if (m.scrapeStatus === "running" || project.scrapeRunning) return "scraping";
  if (m.scrapeStatus === "failed") return "failed";
  return "draft";
}

function sourceLabel(project: Project): string {
  const m = project.meta;
  if (!m) return project.slug;
  if (m.sourceType === "plugin") return "Plugin export";
  if (m.sourceType === "files") return "WordPress files";
  return m.url ?? "Website URL";
}

export function ProjectList({ projects, onOpen, onDelete, onCreate }: Props) {
  if (projects.length === 0) {
    return (
      <section className="gcp-empty">
        <div className="gcp-empty-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
          </svg>
        </div>
        <h2>No projects yet</h2>
        <p>Create a project from a URL, WordPress files, or a wp-grape-export bundle.</p>
        {onCreate ? (
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            Create project
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="gcp-resource-panel">
      <div className="gcp-resource-toolbar">
        <h2 className="gcp-resource-heading">All projects</h2>
        <span className="gcp-resource-count">{projects.length} resources</span>
      </div>

      <div className="gcp-table-wrap">
        <table className="gcp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Status</th>
              <th>Pages</th>
              <th className="gcp-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const badge = statusBadge(p);
              const pages = p.audit?.summary?.pages;
              const name = p.meta?.name ?? p.slug;

              return (
                <tr key={p.slug} className="gcp-row" onClick={() => onOpen(p.slug)}>
                  <td>
                    <div className="gcp-name-cell">
                      <span className="gcp-name-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
                        </svg>
                      </span>
                      <div>
                        <strong>{name}</strong>
                        <small>{p.slug}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="gcp-chip">{sourceLabel(p)}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${badge.replace(/\s+/g, "-")}`}>
                      {badge === "editor live" && <span className="live-dot" aria-hidden="true" />}
                      {badge}
                    </span>
                  </td>
                  <td>{typeof pages === "number" ? pages : "—"}</td>
                  <td className="gcp-col-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(p.slug)}>
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn btn-text btn-danger btn-sm"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${name}"?\n\nThis removes all site data (sites/${p.slug}) and the generated project (projects/${p.slug}). This cannot be undone.`,
                          )
                        ) {
                          onDelete(p.slug);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

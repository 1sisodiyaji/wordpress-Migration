import type { Project } from "../api";

interface Props {
  projects: Project[];
  onOpen: (slug: string) => void;
  onDelete: (slug: string) => void;
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

export function ProjectList({ projects, onOpen, onDelete }: Props) {
  if (projects.length === 0) {
    return (
      <section className="empty-state">
        <h2>No projects yet</h2>
        <p>Create a project from a URL, WordPress files, or a wp-grape-export bundle.</p>
      </section>
    );
  }

  return (
    <section className="card-grid">
      {projects.map((p) => {
        const badge = statusBadge(p);
        const pages = p.audit?.summary?.pages;

        return (
          <article key={p.slug} className="project-card">
            <div className="project-card-top">
              <h3>{p.meta?.name ?? p.slug}</h3>
              <span className={`badge badge-${badge.replace(/\s+/g, "-")}`}>
                {badge === "editor live" && <span className="live-dot" aria-hidden="true" />}
                {badge}
              </span>
            </div>

            <p className="muted project-url">{sourceLabel(p)}</p>

            <div className="project-meta">
              <span>{p.meta?.sourceType ?? "unknown"}</span>
              {typeof pages === "number" && <span>{pages} pages</span>}
              {p.hasData && <span>Data imported</span>}
            </div>

            <div className="project-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => onOpen(p.slug)}>
                Open
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={() => {
                  const name = p.meta?.name ?? p.slug;
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
            </div>
          </article>
        );
      })}
    </section>
  );
}

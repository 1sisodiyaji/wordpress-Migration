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

export function ProjectList({ projects, onOpen, onDelete }: Props) {
  if (projects.length === 0) {
    return (
      <section className="empty-state">
        <h2>No projects yet</h2>
        <p>Create a project from a URL or upload HTML / database files to get started.</p>
      </section>
    );
  }

  return (
    <section className="card-grid">
      {projects.map((p) => (
        <article key={p.slug} className="project-card">
          <div className="project-card-top">
            <h3>{p.meta?.name ?? p.slug}</h3>
            <span className={`badge badge-${statusBadge(p).replace(/\s+/g, "-")}`}>
              {statusBadge(p)}
            </span>
          </div>
          <p className="muted project-url">
            {p.meta?.url ?? (p.meta?.sourceType === "files" ? "Local files" : p.slug)}
          </p>
          <div className="project-card-actions">
            <button type="button" className="btn btn-primary" onClick={() => onOpen(p.slug)}>
              Open
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                if (confirm(`Delete project "${p.meta?.name ?? p.slug}"?`)) onDelete(p.slug);
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

import { useEffect, useState } from "react";
import type { Project } from "../api";
import { ConfirmDeleteModal } from "./ui";
import { cx } from "../lib/cx";

interface Props {
  projects: Project[];
  onOpen: (slug: string) => void;
  onDelete: (slug: string) => Promise<void> | void;
  onCreate?: () => void;
}

function statusBadge(project: Project): string {
  const m = project.meta;
  if (!m) return "new";
  if (m.editorStatus === "running") return "editor live";
  if (m.generateStatus === "done") return "converted";
  if (m.scrapeStatus === "done") return "imported";
  if (m.scrapeStatus === "running" || project.scrapeRunning) return "importing";
  if (m.scrapeStatus === "failed") return "failed";
  return "draft";
}

function sourceLabel(project: Project): string {
  const m = project.meta;
  if (!m) return project.slug;
  if (m.url) return m.url;
  if (m.sourceType === "plugin") return "WordPress plugin";
  return "Project";
}

const badgeClass: Record<string, string> = {
  new: "bg-navy-soft text-navy",
  draft: "bg-navy-soft text-navy",
  imported: "bg-ok-soft text-ok",
  converted: "bg-ok-soft text-ok",
  importing: "bg-teal-soft text-teal-ink",
  scraping: "bg-teal-soft text-teal-ink",
  "editor-live": "bg-coral-soft text-coral",
  failed: "bg-danger-soft text-danger",
};

const iconTone = [
  "bg-teal-soft text-teal-ink",
  "bg-coral-soft text-coral",
  "bg-navy-soft text-navy",
];

export function ProjectList({ projects, onOpen, onDelete, onCreate }: Props) {
  const [pending, setPending] = useState<{ slug: string; name: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const live = new Set(projects.map((p) => p.slug));
    setSelected((prev) => {
      const next = new Set([...prev].filter((slug) => live.has(slug)));
      return next.size === prev.size ? prev : next;
    });
  }, [projects]);

  const selectedCount = selected.size;
  const allSelected = projects.length > 0 && selectedCount === projects.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleOne(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(projects.map((p) => p.slug)));
  }

  async function confirmDelete() {
    if (!pending) return;
    setDeleteBusy(true);
    try {
      await onDelete(pending.slug);
      setSelected((prev) => {
        if (!prev.has(pending.slug)) return prev;
        const next = new Set(prev);
        next.delete(pending.slug);
        return next;
      });
      setPending(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmBulkDelete() {
    const slugs = [...selected];
    if (!slugs.length) return;
    setDeleteBusy(true);
    try {
      for (const slug of slugs) {
        await onDelete(slug);
        setSelected((prev) => {
          if (!prev.has(slug)) return prev;
          const next = new Set(prev);
          next.delete(slug);
          return next;
        });
      }
      setBulkOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (projects.length === 0) {
    return (
      <section className="grid justify-items-center gap-2.5 rounded-[1.75rem] bg-studio-surface px-6 py-12 text-center shadow-studio">
        <div className="mb-1.5 grid size-[4.75rem] place-items-center rounded-full bg-coral-soft text-coral" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
          </svg>
        </div>
        <h2 className="m-0 text-[1.35rem] font-extrabold tracking-tight">No projects yet</h2>
        <p className="mb-3 max-w-md text-studio-muted">
          Create a project, upload an export ZIP, or sync from a WordPress URL.
        </p>
        {onCreate ? (
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-coral px-5 text-sm font-bold text-white hover:bg-coral-hover"
            onClick={onCreate}
          >
            Create project
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.625rem] bg-studio-surface shadow-studio">
      <div className="flex items-center justify-between gap-4 border-b border-studio-border px-5 pt-4 pb-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-coral"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all projects"
          />
          <h2 className="m-0 text-[1.05rem] font-extrabold">All projects</h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {selectedCount > 0 ? (
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-full px-3.5 text-[0.8125rem] font-bold text-danger hover:bg-danger-soft"
              onClick={() => setBulkOpen(true)}
            >
              Delete {selectedCount}
            </button>
          ) : null}
          <span className="text-[0.8125rem] font-semibold text-studio-muted">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Name", "Source", "Status", "Pages"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-studio-border px-5 py-3 text-left text-xs font-bold text-studio-muted"
                >
                  {h}
                </th>
              ))}
              <th className="whitespace-nowrap border-b border-studio-border px-5 py-3 text-right text-xs font-bold text-studio-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => {
              const badge = statusBadge(p);
              const badgeKey = badge.replace(/\s+/g, "-");
              const pages = p.audit?.summary?.pages;
              const name = p.meta?.name ?? p.slug;

              return (
                <tr
                  key={p.slug}
                  className="cursor-pointer border-b border-studio-border last:border-b-0 transition hover:bg-studio-row"
                  onClick={() => onOpen(p.slug)}
                >
                  <td className="px-5 py-4 align-middle">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-coral"
                        checked={selected.has(p.slug)}
                        aria-label={`Select ${name}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleOne(p.slug)}
                      />
                      <span
                        className={cx("grid size-10 shrink-0 place-items-center rounded-full", iconTone[i % 3])}
                        aria-hidden="true"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
                        </svg>
                      </span>
                      <div>
                        <strong className="block font-bold text-studio-text">{name}</strong>
                        <small className="mt-0.5 block text-xs text-studio-muted">{p.slug}</small>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <span className="inline-flex max-w-60 items-center overflow-hidden rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-bold text-ellipsis whitespace-nowrap text-teal-ink">
                      {sourceLabel(p)}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <span
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold",
                        badgeClass[badgeKey] ?? "bg-studio-row text-studio-muted",
                      )}
                    >
                      {badge === "editor live" && (
                        <span className="studio-live-dot size-1.5 rounded-full bg-ok" aria-hidden="true" />
                      )}
                      {badge}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-middle">{typeof pages === "number" ? pages : "—"}</td>
                  <td className="px-5 py-4 text-right align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="ml-1 inline-flex h-8 items-center rounded-full bg-teal-soft px-3.5 text-[0.8125rem] font-bold text-teal-ink hover:bg-[color-mix(in_srgb,var(--color-teal)_18%,white)]"
                      onClick={() => onOpen(p.slug)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="ml-1 inline-flex h-8 items-center rounded-full px-3 text-[0.8125rem] font-bold text-danger hover:bg-danger-soft"
                      onClick={() => setPending({ slug: p.slug, name })}
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

      {pending && (
        <ConfirmDeleteModal
          name={pending.name}
          detail={`Removes site data and the generated project for ${pending.slug}.`}
          busy={deleteBusy}
          onCancel={() => !deleteBusy && setPending(null)}
          onConfirm={confirmDelete}
        />
      )}
      {bulkOpen && (
        <ConfirmDeleteModal
          title={selectedCount === 1 ? "Delete project?" : `Delete ${selectedCount} projects?`}
          name={
            selectedCount === 1
              ? projects.find((p) => selected.has(p.slug))?.meta?.name ?? [...selected][0] ?? "this project"
              : `${selectedCount} selected projects`
          }
          detail="Removes each selected site and its generated project. This cannot be undone."
          busy={deleteBusy}
          onCancel={() => !deleteBusy && setBulkOpen(false)}
          onConfirm={confirmBulkDelete}
        />
      )}
    </section>
  );
}

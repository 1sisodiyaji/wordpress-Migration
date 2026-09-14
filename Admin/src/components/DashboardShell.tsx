import type { ReactNode } from "react";
import { StudioLogo } from "./StudioLogo";
import { cx } from "../lib/cx";

interface Props {
  title?: string;
  subtitle?: string;
  subtitleClassName?: string;
  activeNav?: "projects" | "project";
  onHome: () => void;
  onTheme: () => void;
  isDark: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

function IconProjects() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
    </svg>
  );
}

function IconTheme({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zm10.48 0l1.79-1.8 1.41 1.41-1.79 1.8-1.41-1.41zM12 2h0v3h0V2zm0 17h0v3h0v-3zM4 11H1v2h3v-2zm19 0h-3v2h3v-2zM6.76 19.16l-1.42 1.42-1.79-1.8 1.41-1.41 1.8 1.79zm10.48 0l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8zM12 6a6 6 0 100 12A6 6 0 0012 6z" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3a9 9 0 108.95 10.03A7 7 0 0112 3z" />
    </svg>
  );
}

export function DashboardShell({
  title,
  subtitle,
  subtitleClassName,
  activeNav = "projects",
  onHome,
  onTheme,
  isDark,
  actions,
  children,
}: Props) {
  const projectsActive = activeNav === "projects" || activeNav === "project";

  return (
    <div
      className={cx(
        "grid min-h-screen grid-cols-1 gap-4 p-4 font-sans text-studio-text",
        "bg-[radial-gradient(900px_420px_at_12%_-10%,rgba(46,182,217,0.16),transparent_55%),radial-gradient(700px_380px_at_100%_0%,rgba(255,107,74,0.12),transparent_50%),var(--color-studio-bg)]",
        "md:grid-cols-[15.5rem_1fr] md:gap-5",
      )}
    >
      <aside
        className={cx(
          "flex flex-col gap-2.5 rounded-[1.75rem] bg-studio-surface p-3 shadow-studio",
          "md:sticky md:top-4 md:h-[calc(100vh-2rem)]",
        )}
      >
        <button
          type="button"
          className="mx-1 mt-1 mb-2 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-2xl border-0 bg-transparent p-2 text-left font-inherit text-inherit hover:bg-studio-row"
          onClick={onHome}
        >
          <StudioLogo size={32} markClassName="!rounded-full !shadow-none" />
          <span className="flex min-w-0 flex-col leading-tight">
            <strong className="text-[0.95rem] font-bold">Migration Studio</strong>
            <small className="text-xs text-studio-muted">Workspace</small>
          </span>
        </button>

        <nav className="flex flex-1 flex-col gap-1 px-1" aria-label="Console">
          <p className="mx-3 mb-1 text-[0.7rem] font-medium tracking-[0.06em] text-studio-muted uppercase">
            Navigation
          </p>
          <button
            type="button"
            className={cx(
              "flex w-full items-center gap-3.5 rounded-full border-0 px-3.5 py-3 text-left font-inherit text-[0.9rem] font-semibold transition",
              projectsActive
                ? "bg-coral-soft text-coral shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-coral)_18%,transparent)]"
                : "bg-transparent text-studio-text hover:bg-studio-row",
            )}
            onClick={onHome}
          >
            <span className="grid size-5 shrink-0 place-items-center">
              <IconProjects />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span>Projects</span>
              <small
                className={cx("text-[0.72rem] font-normal", projectsActive ? "opacity-80" : "text-studio-muted")}
              >
                Sites & editors
              </small>
            </span>
          </button>
        </nav>

        <div className="border-t border-studio-border px-1 pt-2.5">
          <button
            type="button"
            className="flex w-full items-center gap-3.5 rounded-full border-0 bg-transparent px-3.5 py-3 text-left font-inherit text-[0.9rem] font-normal text-studio-muted hover:bg-studio-row"
            onClick={onTheme}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            <span className="grid size-5 shrink-0 place-items-center">
              <IconTheme dark={isDark} />
            </span>
            <span>{isDark ? "Light theme" : "Dark theme"}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-3.5">
        <header className="relative z-1 flex min-h-16 items-center justify-between gap-4 rounded-3xl bg-studio-surface px-5 py-4 shadow-studio">
          <div className="hidden shrink-0" aria-hidden={!title}>
            <StudioLogo size={22} />
          </div>
          <div className="min-w-0 flex-1">
            {title ? (
              <h1 className="m-0 text-[1.65rem] font-extrabold tracking-[-0.03em] text-studio-text">{title}</h1>
            ) : null}
            {subtitle ? (
              <p className={cx("mt-0.5 mb-0 text-sm text-studio-muted", subtitleClassName)}>{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>

        <main className="flex-1 pb-10">{children}</main>
      </div>
    </div>
  );
}

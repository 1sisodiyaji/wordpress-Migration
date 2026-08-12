import type { ReactNode } from "react";
import type { AuthUser } from "../auth-api";
import { StudioLogo } from "./StudioLogo";
import { useScrolled } from "../hooks/useScrolled";

interface Props {
  user: AuthUser;
  title?: string;
  subtitle?: string;
  activeNav?: "projects" | "project";
  onHome: () => void;
  onLogout: () => void;
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
  user,
  title,
  subtitle,
  activeNav = "projects",
  onHome,
  onLogout,
  onTheme,
  isDark,
  actions,
  children,
}: Props) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const topbarScrolled = useScrolled(10);

  return (
    <div className="app dash-app">
      <aside className="dash-sidebar">
        <button type="button" className="dash-brand" onClick={onHome}>
          <StudioLogo size={32} markClassName="dash-brand-logo" />
          <span className="dash-brand-text">
            <strong>Migration Studio</strong>
            <small>Console</small>
          </span>
        </button>

        <nav className="dash-nav" aria-label="Console">
          <p className="dash-nav-label">Navigation</p>
          <button
            type="button"
            className={`dash-nav-item${activeNav === "projects" || activeNav === "project" ? " is-active" : ""}`}
            onClick={onHome}
          >
            <span className="dash-nav-icon">
              <IconProjects />
            </span>
            <span className="dash-nav-copy">
              <span>Projects</span>
              <small>Sites & editors</small>
            </span>
          </button>
        </nav>

        <div className="dash-sidebar-foot">
          <button
            type="button"
            className="dash-nav-item dash-nav-quiet"
            onClick={onTheme}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            <span className="dash-nav-icon">
              <IconTheme dark={isDark} />
            </span>
            <span>{isDark ? "Light theme" : "Dark theme"}</span>
          </button>

          <div className="dash-user-card">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="dash-avatar" />
            ) : (
              <span className="dash-avatar dash-avatar-fallback">{initials}</span>
            )}
            <div className="dash-user-meta">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button type="button" className="btn btn-text btn-sm" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="dash-main">
        <header className={`dash-topbar${topbarScrolled ? " is-scrolled" : ""}`}>
          <div className="dash-topbar-brand" aria-hidden={!title}>
            <StudioLogo size={22} className="dash-topbar-logo" />
          </div>
          <div className="dash-topbar-title">
            {title ? <h1 className="dash-title">{title}</h1> : null}
            {subtitle ? <p className="dash-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="dash-topbar-actions">{actions}</div> : null}
        </header>

        <main className="dash-content">{children}</main>
      </div>
    </div>
  );
}

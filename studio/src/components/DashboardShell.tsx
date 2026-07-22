import type { ReactNode } from "react";
import type { AuthUser } from "../auth-api";

interface Props {
  user: AuthUser;
  title?: string;
  subtitle?: string;
  onHome: () => void;
  onLogout: () => void;
  onTheme: () => void;
  isDark: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  user,
  title,
  subtitle,
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

  return (
    <div className="app dash-app">
      <aside className="dash-sidebar">
        <button type="button" className="brand dash-brand" onClick={onHome}>
          <span className="brand-mark">M</span>
          <span>
            <strong>Migration</strong>
            <small>Studio</small>
          </span>
        </button>

        <nav className="dash-nav">
          <button type="button" className="dash-nav-item is-active" onClick={onHome}>
            <span className="dash-nav-icon" aria-hidden="true">
              ▦
            </span>
            Projects
          </button>
        </nav>

        <div className="dash-sidebar-foot">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onTheme}
            title={isDark ? "Light mode" : "Dark mode"}
            aria-label={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? "☀" : "☾"}
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div>
            {title ? <h1 className="dash-title">{title}</h1> : null}
            {subtitle ? <p className="muted dash-subtitle">{subtitle}</p> : null}
          </div>
          <div className="dash-topbar-actions">
            {actions}
            <div className="dash-user">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="dash-avatar" />
              ) : (
                <span className="dash-avatar dash-avatar-fallback">{initials}</span>
              )}
              <div className="dash-user-meta">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="dash-content">{children}</main>
      </div>
    </div>
  );
}

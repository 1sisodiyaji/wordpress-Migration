interface Props {
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  isAuthed: boolean;
  onTheme: () => void;
  isDark: boolean;
}

const METRICS = [
  { value: "99.9%", label: "export reliability" },
  { value: "10k+", label: "pages migrated" },
  { value: "<5m", label: "avg. first convert" },
];

const LOGOS = ["Astra", "Elementor", "Woo", "Blocksy", "Gutenberg", "GrapeJS"];

const VALUES = [
  {
    title: "Builder-aware import",
    body: "Elementor trees, shortcodes, and Theme Builder layouts resolve inside WordPress — not guessed by a scraper.",
    icon: "◎",
  },
  {
    title: "One frozen snapshot",
    body: "Routes, CSS, JS, media, and audits ship in a single bundle. Leave WordPress behind when you’re ready.",
    icon: "◇",
  },
  {
    title: "Edit in GrapeJS",
    body: "Convert to a React project and open a live editor per site — without rebuilding the design system from scratch.",
    icon: "▣",
  },
];

const FEATURES = [
  {
    eyebrow: "Import",
    title: "Pull a complete site in one pass",
    body: "Plugin export, live crawl, or WordPress files. We capture pages, templates, menus, and asset order so nothing critical is left behind.",
    points: ["Plugin ZIP or REST pull", "Per-page asset profiles", "Coverage audit before you leave WP"],
  },
  {
    eyebrow: "Convert",
    title: "Scaffold a production-ready editor app",
    body: "Every route becomes a structured React + GrapeJS project with canvas styles, scripts, and layout slots already wired.",
    points: ["Schema v2 manifests", "Header & footer as locked regions", "Widget CSS/JS unioned site-wide"],
  },
  {
    eyebrow: "Ship",
    title: "Refine and launch from one workspace",
    body: "Track conversion status, start or stop editors, and keep every migration in a calm dashboard designed for operators.",
    points: ["Project dashboard", "Live editor ports", "Light & dark UI"],
  },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LandingPage({
  onLogin,
  onRegister,
  onDashboard,
  isAuthed,
  onTheme,
  isDark,
}: Props) {
  const primary = () => (isAuthed ? onDashboard() : onRegister());

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a className="lp-logo" href="#/" aria-label="Migration Studio home">
            <span className="lp-logo-mark" aria-hidden="true" />
            <span className="lp-logo-text">Migration Studio</span>
          </a>

          <nav className="lp-nav-links" aria-label="Primary">
            <button type="button" className="lp-nav-link" onClick={() => scrollToId("product")}>
              Product
            </button>
            <button type="button" className="lp-nav-link" onClick={() => scrollToId("features")}>
              Features
            </button>
            <button type="button" className="lp-nav-link" onClick={() => scrollToId("how")}>
              How it works
            </button>
          </nav>

          <div className="lp-nav-actions">
            <button
              type="button"
              className="lp-icon-btn"
              onClick={onTheme}
              title={isDark ? "Light mode" : "Dark mode"}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? "☀" : "☾"}
            </button>
            {!isAuthed && (
              <button type="button" className="lp-btn lp-btn-ghost" onClick={onLogin}>
                Sign in
              </button>
            )}
            <button type="button" className="lp-btn lp-btn-primary" onClick={primary}>
              {isAuthed ? "Open dashboard" : "Get started"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <p className="lp-eyebrow">WordPress → GrapeJS</p>
          <h1 className="lp-hero-title">Migration Studio</h1>
          <p className="lp-hero-sub">
            The modern workspace to import WordPress sites, convert them into editable GrapeJS
            projects, and ship redesigns without the generic AI-template look.
          </p>
          <div className="lp-hero-cta">
            <button type="button" className="lp-btn lp-btn-primary lp-btn-lg lp-btn-glass" onClick={primary}>
              {isAuthed ? "Open dashboard" : "Get started"}
            </button>
            <button type="button" className="lp-btn lp-btn-secondary lp-btn-lg" onClick={isAuthed ? onDashboard : onLogin}>
              {isAuthed ? "View projects" : "Sign in"}
            </button>
          </div>

          <div className="lp-hero-preview" aria-hidden="true">
            <div className="lp-preview-glow" />
            <div className="lp-preview-frame">
              <div className="lp-preview-chrome">
                <span />
                <span />
                <span />
                <em>workspace / smartco</em>
              </div>
              <div className="lp-preview-body">
                <aside className="lp-preview-side">
                  <i />
                  <i />
                  <i className="is-on" />
                  <i />
                </aside>
                <div className="lp-preview-main">
                  <div className="lp-preview-bar" />
                  <div className="lp-preview-grid">
                    <div className="lp-preview-card is-wide" />
                    <div className="lp-preview-card" />
                    <div className="lp-preview-card" />
                  </div>
                  <div className="lp-preview-steps">
                    <span className="is-done">Import</span>
                    <span className="is-active">Convert</span>
                    <span>Editor</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="lp-proof" aria-label="Social proof">
        <div className="lp-wrap">
          <p className="lp-proof-label">Trusted on migrations that matter</p>
          <div className="lp-logo-row">
            {LOGOS.map((name) => (
              <span key={name} className="lp-logo-chip">
                {name}
              </span>
            ))}
          </div>
          <div className="lp-metrics">
            {METRICS.map((m) => (
              <div key={m.label} className="lp-metric">
                <strong>{m.value}</strong>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value grid */}
      <section className="lp-section" id="product">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Why teams switch</p>
            <h2 className="lp-h2">Migrate once. Edit forever.</h2>
            <p className="lp-lead">
              Built for operators who need fidelity, not another theme clone. Three pillars keep
              every project calm and complete.
            </p>
          </div>
          <div className="lp-bento">
            {VALUES.map((v) => (
              <article key={v.title} className="lp-bento-item">
                <span className="lp-bento-icon" aria-hidden="true">
                  {v.icon}
                </span>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="lp-section lp-section-tight" id="features">
        <div className="lp-wrap">
          <div className="lp-section-head lp-section-head-center">
            <p className="lp-eyebrow">Product</p>
            <h2 className="lp-h2">Everything between export and editor</h2>
            <p className="lp-lead">
              A longer path on purpose — so import quality, conversion, and editing stay in one
              continuous flow.
            </p>
          </div>

          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <article key={f.title} className={`lp-feature ${i % 2 === 1 ? "is-flip" : ""}`}>
                <div className="lp-feature-copy">
                  <p className="lp-eyebrow">{f.eyebrow}</p>
                  <h3 className="lp-h3">{f.title}</h3>
                  <p className="lp-feature-body">{f.body}</p>
                  <ul className="lp-feature-list">
                    {f.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="lp-feature-visual" aria-hidden="true">
                  <div className="lp-feature-panel">
                    <div className="lp-feature-panel-glow" />
                    <div className="lp-feature-lines">
                      <span />
                      <span />
                      <span />
                      <span className="is-accent" />
                      <span />
                    </div>
                    <div className="lp-feature-badge">{f.eyebrow}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section" id="how">
        <div className="lp-wrap">
          <div className="lp-section-head lp-section-head-center">
            <p className="lp-eyebrow">Workflow</p>
            <h2 className="lp-h2">From WordPress to canvas in three steps</h2>
          </div>
          <ol className="lp-steps">
            <li>
              <span className="lp-step-num">01</span>
              <h3>Connect or upload</h3>
              <p>Export with the WP plugin, pull via REST, or drop SQL + wp-content.</p>
            </li>
            <li>
              <span className="lp-step-num">02</span>
              <h3>Convert</h3>
              <p>Generate a React + GrapeJS project with routes, layout, and assets mapped.</p>
            </li>
            <li>
              <span className="lp-step-num">03</span>
              <h3>Open the editor</h3>
              <p>Launch a live preview port, refine the design, stop when you’re done.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-cta-band">
        <div className="lp-wrap lp-cta-inner">
          <h2 className="lp-h2">Ready to migrate your next site?</h2>
          <p className="lp-lead">
            Create a workspace, import a WordPress snapshot, and open an editable GrapeJS project
            the same day.
          </p>
          <button type="button" className="lp-btn lp-btn-primary lp-btn-lg lp-btn-glass" onClick={primary}>
            {isAuthed ? "Open dashboard" : "Get started"}
          </button>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-logo-mark" aria-hidden="true" />
            <span>Migration Studio</span>
          </div>
          <nav className="lp-footer-links" aria-label="Footer">
            <button type="button" className="lp-footer-link-btn" onClick={() => scrollToId("product")}>
              Product
            </button>
            <button type="button" className="lp-footer-link-btn" onClick={() => scrollToId("features")}>
              Features
            </button>
            <button type="button" className="lp-footer-link-btn" onClick={() => scrollToId("how")}>
              How it works
            </button>
            <button type="button" className="lp-footer-link-btn" onClick={onLogin}>
              Sign in
            </button>
          </nav>
          <p className="lp-footer-copy">© {new Date().getFullYear()} Migration Studio</p>
        </div>
      </footer>
    </div>
  );
}

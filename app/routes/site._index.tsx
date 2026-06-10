import { Link } from "react-router";
import { WpHomeShell } from "@/components/wp/WpHomeShell";
import { WpShell } from "@/components/wp/WpShell";
import { useSiteSlug } from "@/lib/wp/site-context";
import { getManifest } from "@/api/wp/load-migrated";
import { hasPageShell } from "@/api/wp/page-shell";

export default function SiteHomeRoute() {
  const site = useSiteSlug();
  const manifest = getManifest(site);

  return (
    <WpShell>
      <div className="site-nav-bar">
        <Link to="/" className="site-back">← All projects</Link>
      </div>
      <WpHomeShell />
      {manifest && !hasPageShell("/", site) && (
        <nav className="wp-migrated-routes" aria-label="Migrated routes">
          <ul>
            {manifest.routes
              .filter((r) => r.path !== "/")
              .slice(0, 200)
              .map((r) => (
                <li key={r.path}>
                  <Link to={`/${site}${r.path}`}>{r.slug ?? r.path}</Link>
                </li>
              ))}
          </ul>
          {manifest.routes.length > 201 ? (
            <p className="wp-routes-more">
              + {manifest.routes.length - 201} more routes (use URL bar)
            </p>
          ) : null}
          <style>{`
            .site-nav-bar { padding: 0.5rem 1rem; font-family: system-ui, sans-serif; }
            .site-back { color: #8ab4f8; text-decoration: none; font-size: 0.9rem; }
            .wp-migrated-routes {
              max-width: 40rem; margin: 2rem auto; padding: 0 1rem;
              font-family: system-ui, sans-serif;
            }
            .wp-migrated-routes ul { list-style: disc; padding-left: 1.25rem; }
            .wp-routes-more { color: #9aa0a6; font-size: 0.9rem; margin-top: 1rem; }
          `}</style>
        </nav>
      )}
    </WpShell>
  );
}

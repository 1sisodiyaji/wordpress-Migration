import { getManifest } from "@/api/wp/load-migrated";

export function MigrationBanner() {
  const manifest = getManifest();

  if (manifest) return null;

  return (
    <div className="migration-banner">
      <p>
        No migrated data yet. With WordPress running on port 8080, run{" "}
        <code>npm run migrate</code> then refresh.
      </p>
      <p>
        <a
          href="https://github.com/wp-graphql/wp-graphql"
          target="_blank"
          rel="noreferrer"
        >
          WPGraphQL
        </a>{" "}
        is optional but improves content sync.
      </p>
      <style>{`
        .migration-banner {
          background: #1e3a5f;
          color: #fff;
          padding: 1rem 1.5rem;
          font-size: 0.9rem;
        }
        .migration-banner code {
          background: rgba(255,255,255,0.15);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}

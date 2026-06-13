import { Link } from "react-router";
import { hasPuckDatabase } from "@/puck/load-puck-database";
import { readRegistry } from "@/api/wp/sites";

export default function PuckHubIndex() {
  const sites = readRegistry().filter((s) => hasPuckDatabase(s.slug));

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="mb-2 text-2xl font-semibold">Puck previews</h1>
      <p className="mb-6 text-neutral-600">
        Sites converted with{" "}
        <code className="rounded bg-neutral-100 px-1">npm run migrate:to-puck</code>
      </p>
      {sites.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No Puck data yet. Run migrate, then{" "}
          <code>npm run migrate:to-puck -- your-site-slug</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {sites.map((s) => (
            <li key={s.slug}>
              <Link className="text-blue-600 underline" to={`/puck/${s.slug}`}>
                {s.name}
              </Link>
              <span className="ml-2 text-sm text-neutral-500">{s.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

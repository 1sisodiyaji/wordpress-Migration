import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/puck.$site._index";
import {
  loadPuckDatabase,
  loadPuckMeta,
} from "@/puck/load-puck-database";

export async function loader({ params }: Route.LoaderArgs) {
  const site = params.site!;
  const meta = loadPuckMeta(site);
  const database = loadPuckDatabase(site);
  return { site, meta, database };
}

export default function PuckSiteIndex() {
  const { site, meta, database } = useLoaderData<typeof loader>();
  const routes = meta?.routes ?? Object.keys(database ?? {});

  return (
    <div className="mx-auto max-w-3xl p-8 font-sans">
      <p className="mb-2 text-sm text-neutral-500">
        <Link to={`/workspace/${site}`} className="underline">
          Workspace
        </Link>
        {" · "}
        <Link to={`/${site}`} className="underline">
          Live site route
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">Puck migration — {site}</h1>
      <p className="mb-6 text-neutral-600">
        Pages below are driven by{" "}
        <code className="rounded bg-neutral-100 px-1">data/puck/database.json</code>
        , not raw HTML routes alone.
      </p>

      {meta ? (
        <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">Converted</dt>
          <dd>{new Date(meta.convertedAt).toLocaleString()}</dd>
          <dt className="text-neutral-500">Strategy</dt>
          <dd>{meta.strategy}</dd>
          <dt className="text-neutral-500">Pages</dt>
          <dd>{meta.pageCount}</dd>
          <dt className="text-neutral-500">Builder</dt>
          <dd>{meta.pageBuilder ?? "—"}</dd>
          <dt className="text-neutral-500">Source</dt>
          <dd>{meta.wordpressUrl}</dd>
        </dl>
      ) : null}

      <h2 className="mb-3 text-lg font-medium">Preview routes</h2>
      <ul className="space-y-2">
        {routes.map((routePath) => {
          const href =
            routePath === "/"
              ? `/puck/${site}/view`
              : `/puck/${site}/view/${routePath.replace(/^\//, "")}`;
          const page = database?.[routePath];
          const title =
            (page?.root?.props?.title as string | undefined) ?? routePath;
          return (
            <li key={routePath}>
              <Link className="text-blue-600 underline" to={href}>
                {title}
              </Link>
              <span className="ml-2 text-sm text-neutral-500">{routePath}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

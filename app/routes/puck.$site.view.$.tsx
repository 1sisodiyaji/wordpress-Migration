import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/puck.$site.view.$";
import { WpPageShell } from "@/components/wp/WpPageShell";
import { WpShell } from "@/components/wp/WpShell";
import {
  loadPuckDatabase,
  loadPuckMeta,
} from "@/puck/load-puck-database";
import type { WpHtmlShellProps } from "@/puck/wp-migration-types";

function splatToRoute(splat: string): string {
  if (!splat) return "/";
  return `/${splat}`.replace(/\/+$/, "") || "/";
}

export async function loader({ params }: Route.LoaderArgs) {
  const site = params.site!;
  const routePath = splatToRoute(params["*"] ?? "");
  const database = loadPuckDatabase(site);
  const meta = loadPuckMeta(site);
  const page = database?.[routePath];

  if (!page) {
    throw new Response(`No Puck data for route ${routePath}`, { status: 404 });
  }

  const shell = page.content.find((c) => c.type === "WpHtmlShell");
  const shellProps = shell?.props as WpHtmlShellProps | undefined;

  return { site, routePath, page, meta, shellProps };
}

export const meta: Route.MetaFunction = ({ data }) => {
  const title = data?.page?.root?.props?.title;
  return [{ title: title ? `Puck: ${title}` : "Puck preview" }];
};

export default function PuckPagePreview() {
  const { site, routePath, page, shellProps } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950">
        <strong>Puck preview</strong> — rendering from{" "}
        <code>database.json</code> →{" "}
        <code>WpHtmlShell</code>
        {" · "}
        <Link to={`/puck/${site}`} className="underline">
          All routes
        </Link>
      </div>

      {shellProps ? (
        <WpShell>
          <WpPageShell routePath={shellProps.routePath} />
        </WpShell>
      ) : (
        <pre className="overflow-auto p-4 text-xs">
          {JSON.stringify(page, null, 2)}
        </pre>
      )}

      <details className="border-t bg-neutral-50 p-4 text-xs">
        <summary className="cursor-pointer font-medium">
          Puck JSON for {routePath}
        </summary>
        <pre className="mt-2 overflow-auto">{JSON.stringify(page, null, 2)}</pre>
      </details>
    </div>
  );
}

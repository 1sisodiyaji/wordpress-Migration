import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { WpContent } from "@/components/wp/WpContent";
import { WpPageShell } from "@/components/wp/WpPageShell";
import { WpShell } from "@/components/wp/WpShell";
import { resolveWpPage } from "@/api/lib/wp-page.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const site = params.site!;
  const splat = params["*"] ?? "";
  const path = `/${splat}`.replace(/\/+$/, "") || "/";
  const page = resolveWpPage(path, site);

  if (page.kind === "not-found") {
    throw new Response(null, { status: 404, statusText: "Not Found" });
  }

  return { ...page, site };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.title) return [{ title: "WordPress → Remix" }];
  return [{ title: data.title }];
};

export default function SiteCatchAllRoute() {
  const page = useLoaderData<typeof loader>();

  if (page.kind === "shell") {
    return (
      <WpShell>
        <WpPageShell routePath={page.path} />
      </WpShell>
    );
  }

  return (
    <WpShell classList={page.classList}>
      <WpContent html={page.html} />
    </WpShell>
  );
}

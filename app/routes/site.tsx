import { Outlet, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/site";
import { ElementorClientFixes } from "@/components/wp/ElementorClientFixes";
import { ElementorFrontendLoaderServer } from "@/components/wp/ElementorFrontendLoaderServer";
import { ElementorGlobalAssets } from "@/components/wp/ElementorGlobalAssets";
import { WpStyles } from "@/components/wp/WpStyles";
import { SiteProvider } from "@/lib/wp/site-context";
import { getManifest, getStyles } from "@/api/wp/load-migrated";
import { getSite, siteHasData } from "@/api/wp/sites";

export async function loader({ params }: Route.LoaderArgs) {
  const site = params.site!;
  const entry = getSite(site);
  const manifest = getManifest(site);

  if (
    !siteHasData(site) &&
    (entry?.status === "migrating" || entry?.status === "failed")
  ) {
    throw redirect(`/migrate/${site}`);
  }

  if (!manifest) {
    throw new Response("Site not found", { status: 404 });
  }

  if (entry?.stage === "landing" || !entry?.stage) {
    throw redirect(`/workspace/${site}`);
  }

  return {
    site,
    status: "ready" as const,
    entry,
    manifest,
    styles: getStyles(site),
  };
}

export default function SiteLayout() {
  const data = useLoaderData<typeof loader>();

  const isElementor = data.manifest?.pageBuilder === "elementor";
  const htmlClass = data.styles?.htmlClasses?.join(" ") ?? "";

  return (
    <SiteProvider site={data.site}>
      <div className={htmlClass || undefined}>
        <WpStyles />
        <ElementorClientFixes />
        {isElementor ? <ElementorFrontendLoaderServer site={data.site} /> : null}
        {isElementor ? <ElementorGlobalAssets /> : null}
        <Outlet />
      </div>
    </SiteProvider>
  );
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.manifest) return [{ title: "Migrating…" }];
  return [{ title: data.manifest.site.name }];
}

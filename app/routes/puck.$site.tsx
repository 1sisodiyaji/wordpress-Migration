import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/puck.$site";
import { ElementorClientFixes } from "@/components/wp/ElementorClientFixes";
import { ElementorFrontendLoaderServer } from "@/components/wp/ElementorFrontendLoaderServer";
import { ElementorGlobalAssets } from "@/components/wp/ElementorGlobalAssets";
import { WpStyles } from "@/components/wp/WpStyles";
import { SiteProvider } from "@/lib/wp/site-context";
import { getManifest, getStyles } from "@/api/wp/load-migrated";
import { hasPuckDatabase } from "@/puck/load-puck-database";

export async function loader({ params }: Route.LoaderArgs) {
  const site = params.site!;
  const manifest = getManifest(site);

  if (!hasPuckDatabase(site)) {
    throw new Response(
      `No Puck data for "${site}". Run: npm run migrate:to-puck -- ${site}`,
      { status: 404 },
    );
  }

  if (!manifest) {
    throw new Response("Site manifest not found", { status: 404 });
  }

  return {
    site,
    manifest,
    styles: getStyles(site),
    isElementor: manifest.pageBuilder === "elementor",
  };
}

export default function PuckSiteLayout() {
  const data = useLoaderData<typeof loader>();
  const htmlClass = data.styles?.htmlClasses?.join(" ") ?? "";

  return (
    <SiteProvider site={data.site}>
      <div className={htmlClass || undefined}>
        <WpStyles />
        <ElementorClientFixes />
        {data.isElementor ? (
          <ElementorFrontendLoaderServer site={data.site} />
        ) : null}
        {data.isElementor ? <ElementorGlobalAssets /> : null}
        <Outlet />
      </div>
    </SiteProvider>
  );
}

/**
 * Isolated migrated homepage for iframe preview.
 * No platform UI / Tailwind — only the site's own migrated CSS.
 */
import { SiteProvider } from "@/lib/wp/site-context";
import { ElementorClientFixes } from "@/components/wp/ElementorClientFixes";
import { ElementorFrontendLoaderServer } from "@/components/wp/ElementorFrontendLoaderServer";
import { ElementorGlobalAssets } from "@/components/wp/ElementorGlobalAssets";
import { WpHomeShell } from "@/components/wp/WpHomeShell";
import { WpShell } from "@/components/wp/WpShell";
import { WpStyles } from "@/components/wp/WpStyles";
import { getManifest, getStyles } from "@/api/wp/load-migrated";
import { siteHasData } from "@/api/wp/sites";

export async function loader({ params }: { params: { site: string } }) {
  const site = params.site!;
  if (!siteHasData(site)) {
    throw new Response("Preview not ready", { status: 404 });
  }
  return { site, manifest: getManifest(site), styles: getStyles(site) };
}

export default function PreviewFrame({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  const { site, manifest, styles } = loaderData;
  const isElementor = manifest?.pageBuilder === "elementor";
  const htmlClass = styles?.htmlClasses?.join(" ") ?? "";

  return (
    <SiteProvider site={site}>
      <div className={`wp-migrated-root ${htmlClass}`.trim()}>
        <WpStyles />
        <ElementorClientFixes />
        {isElementor ? <ElementorFrontendLoaderServer site={site} /> : null}
        {isElementor ? <ElementorGlobalAssets /> : null}
        <WpShell>
          <WpHomeShell />
        </WpShell>
      </div>
    </SiteProvider>
  );
}

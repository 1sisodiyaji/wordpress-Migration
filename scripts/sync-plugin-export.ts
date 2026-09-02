#!/usr/bin/env npx tsx
/**
 * Inner-loop: plugin PHP on disk → WordPress export → Studio site → GrapeJS project.
 *
 * Does NOT require:
 *   - zipping the plugin
 *   - uploading it in wp-admin
 *   - downloading an export ZIP in the Studio UI
 *
 * Usage:
 *   pnpm plugin:sync
 *   pnpm plugin:sync -- --site radius-ois --skip-generate
 *   pnpm plugin:sync -- --no-media
 */
import "dotenv/config";
import { syncLocalPluginExport } from "../lib/wp-import/sync-local-export";
import { createStudioMeta, patchStudioMeta, readStudioMeta } from "../studio/server/state";

const argv = process.argv.slice(2);
const skipGenerate = argv.includes("--skip-generate");
const copyMedia = !argv.includes("--no-media");
const site = getArg(argv, "--site") ?? process.env.SITE_SLUG ?? "radius-ois";
const name = getArg(argv, "--name") ?? "RADIUS-OIS";

console.log(`
WP Grape Export — local sync
  WordPress : ${process.env.WP_URL ?? "http://localhost:8084"}
  Site slug : ${site}
  Media     : ${copyMedia ? "copy" : "map only"}
  Generate  : ${skipGenerate ? "skip" : "yes"}

Plugin files are bind-mounted. Edit wp-plugin/wp-grape-export and re-run this.
`);

try {
  const result = await syncLocalPluginExport({
    siteSlug: site,
    name,
    copyMedia,
    skipGenerate,
  });
  if (!readStudioMeta(site)) {
    createStudioMeta({
      slug: site,
      name,
      sourceType: "plugin",
      url: process.env.WP_URL ?? "http://localhost:8084",
    });
  }
  patchStudioMeta(site, {
    scrapeStatus: "done",
    hasPluginExport: true,
    generateStatus: skipGenerate ? readStudioMeta(site)?.generateStatus : "done",
    url: process.env.WP_URL ?? "http://localhost:8084",
    error: undefined,
  });
  console.log(`
✅ Sync complete
  Method    : ${result.method}
  Imported  : ${result.source}
  Site      : sites/${result.siteSlug}/
  Generated : ${result.generated ? `projects/${result.siteSlug}/` : "(skipped)"}
  Studio    : http://localhost:5173/project/${result.siteSlug}
  WordPress : http://localhost:8084/

  Editor UI : stop any open editor tab, then in Studio click "Open editor"
              (or run: cd projects/${result.siteSlug} && pnpm dev)
              Hard refresh the editor tab: Ctrl+Shift+R
`);
} catch (err) {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

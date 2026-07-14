#!/usr/bin/env npx tsx
/**
 * Import a wp-grape-export bundle (folder or .zip) into sites/{slug}/data/.
 *
 *   pnpm import:plugin -- --zip ./export.zip --site smartco
 *   pnpm import:plugin -- --dir ./export-folder --site smartco --name "Smart Co"
 *   pnpm import:plugin -- --zip ./export.zip --site smartco --generate --run
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { importPluginExport } from "../../lib/wp-import/import-plugin-export";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const source = getArg(argv, "--zip") ?? getArg(argv, "--dir") ?? getArg(argv, "--source");
  const site = getArg(argv, "--site") ?? getArg(argv, "-s");
  const name = getArg(argv, "--name");
  const shouldGenerate = argv.includes("--generate");
  const shouldRun = argv.includes("--run");

  if (!source || !site) {
    console.error(`
Usage:
  pnpm import:plugin -- --zip <bundle.zip> --site <slug> [--name "Site Name"] [--generate] [--run]
  pnpm import:plugin -- --dir <bundle-folder> --site <slug>

The bundle is produced by the wp-grape-export WordPress plugin
(Tools -> Grape Export, or POST /wp-json/wp-grape-export/v1/export).
`);
    process.exit(1);
  }

  process.env.SITE_SLUG = site;

  console.log(`\nImporting plugin export → sites/${site}/data/`);
  const result = await importPluginExport({ source, siteSlug: site, name });

  console.log(`\n✅ Imported "${result.siteUrl}"`);
  console.log(`   Pages:      ${result.pageCount}`);
  console.log(`   Templates:  ${result.templateCount}`);
  console.log(`   Menus:      ${result.menuCount}`);
  console.log(`   Media:      ${result.mediaCount}`);
  console.log(`   Assets:     ${result.assetsCopied ? "copied" : "map-only (no files)"}`);
  console.log(`   Shortcodes unresolved: ${result.unresolvedShortcodes}`);
  if (result.warnings.length) {
    console.log(`\n⚠ Warnings:`);
    for (const w of result.warnings) console.log(`   - ${w}`);
  }

  if (shouldGenerate) {
    const genArgs = ["generate", "--", "--site", site];
    if (shouldRun) genArgs.push("--run");
    console.log(`\n▶ pnpm ${genArgs.join(" ")}`);
    await runCmd("pnpm", genArgs);
  } else {
    console.log(`\nNext: pnpm generate -- --site ${site} --run`);
  }
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

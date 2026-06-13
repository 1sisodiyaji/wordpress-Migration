import {
  getSite,
  normalizeWordPressUrl,
  readRegistry,
  urlToSlug,
} from "../../app/api/wp/sites";

function getArg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

function printMigrateTargetHelp(): void {
  const sites = readRegistry();
  const list =
    sites.length > 0
      ? sites.map((s) => `  • ${s.slug}  (${s.url})`).join("\n")
      : "  (no projects yet — use the UI home page)";

  console.error(`
Migration target required. Do not rely on WORDPRESS_URL in .env — pass the project explicitly.

  npm run migrate -- --site radius-ois-ai --all
  npm run migrate -- --url https://radius-ois.ai --site radius-ois-ai --landing

Registered projects:
${list}
`);
}

/** CLI must pass --site and/or --url. UI worker always passes both. */
export function requireExplicitMigrateTarget(argv: string[]): void {
  const explicitUrl = getArg(argv, "--url") ?? getArg(argv, "-u");
  const explicitSite = getArg(argv, "--site");

  if (explicitUrl && explicitSite) return;

  if (explicitSite) {
    const entry = getSite(explicitSite);
    if (entry) {
      process.env.SITE_SLUG = explicitSite;
      process.env.WORDPRESS_URL = entry.url;
      return;
    }
    console.error(`Unknown project slug: ${explicitSite}`);
    printMigrateTargetHelp();
    process.exit(1);
  }

  if (explicitUrl) {
    const url = normalizeWordPressUrl(explicitUrl);
    process.env.WORDPRESS_URL = url;
    process.env.SITE_SLUG = urlToSlug(url);
    return;
  }

  printMigrateTargetHelp();
  process.exit(1);
}

export function bootstrapMigrateEnv(argv: string[]): void {
  requireExplicitMigrateTarget(argv);

  const url = process.env.WORDPRESS_URL;
  const site = process.env.SITE_SLUG;

  if (url) {
    process.env.WORDPRESS_URL = normalizeWordPressUrl(url);
  }
  if (site) {
    process.env.SITE_SLUG = site;
  }
}

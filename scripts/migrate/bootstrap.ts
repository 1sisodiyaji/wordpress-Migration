import { normalizeWordPressUrl, urlToSlug } from "../../app/api/wp/sites";

function getArg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

export function bootstrapMigrateEnv(argv: string[]): void {
  const url =
    getArg(argv, "--url") ??
    getArg(argv, "-u") ??
    process.env.WORDPRESS_URL;
  const site =
    getArg(argv, "--site") ??
    process.env.SITE_SLUG ??
    (url ? urlToSlug(normalizeWordPressUrl(url)) : undefined);

  if (url) {
    process.env.WORDPRESS_URL = normalizeWordPressUrl(url);
  }
  if (site) {
    process.env.SITE_SLUG = site;
  }
}

import fs from "node:fs";

export interface WpConfigInfo {
  tablePrefix: string;
  dbName?: string;
  siteUrl?: string;
  homeUrl?: string;
}

/** Best-effort parse of wp-config.php constants. */
export function parseWpConfig(filePath: string): WpConfigInfo {
  const text = fs.readFileSync(filePath, "utf8");
  const info: WpConfigInfo = { tablePrefix: "wp_" };

  const define = (name: string): string | undefined => {
    const re = new RegExp(
      `define\\s*\\(\\s*['"]${name}['"]\\s*,\\s*['"]([^'"]+)['"]`,
      "i",
    );
    return re.exec(text)?.[1];
  };

  info.dbName = define("DB_NAME");
  info.tablePrefix =
    define("table_prefix")?.replace(/['"];?\s*$/, "") ??
    /\$table_prefix\s*=\s*['"]([^'"]+)['"]/i.exec(text)?.[1] ??
    info.tablePrefix;

  const home = define("WP_HOME");
  const siteurl = define("WP_SITEURL");
  if (home) info.homeUrl = home;
  if (siteurl) info.siteUrl = siteurl;

  return info;
}

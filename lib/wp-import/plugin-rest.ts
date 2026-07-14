/**
 * Resolve the WordPress REST API base URL for a site.
 *
 * Many local/docker installs have broken pretty-permalink rewrites (e.g.
 * RewriteBase /smartco/ while the site is served at /). We probe both styles.
 */
export async function resolveWpRestBase(wpUrl: string): Promise<string> {
  const base = wpUrl.replace(/\/+$/, "");

  // Pretty permalinks: /wp-json/...
  try {
    const pretty = await fetch(`${base}/wp-json/wp-grape-export/v1/ping`, {
      signal: AbortSignal.timeout(8000),
    });
    if (pretty.ok) return `${base}/wp-json`;
  } catch {
    /* try fallback */
  }

  // Plain permalinks: index.php?rest_route=/...
  const plain = await fetch(`${base}/index.php?rest_route=/wp-grape-export/v1/ping`, {
    signal: AbortSignal.timeout(8000),
  });
  if (plain.ok) return `${base}/index.php?rest_route=`;

  throw new Error(
    "WP Grape Export plugin not reachable. Activate it under Plugins in wp-admin, then retry.",
  );
}

/** Build a full REST URL for a route path like `/wp-grape-export/v1/export`. */
export function wpRestEndpoint(restBase: string, routePath: string): string {
  const path = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (restBase.endsWith("rest_route=")) {
    return `${restBase}${path}`;
  }
  return `${restBase}${path}`;
}

/** Parse a WordPress REST error body into a readable message. */
export function parseWpRestError(
  status: number,
  body: { message?: string; code?: string } | null,
): string {
  if (body?.message) {
    const code = body.code ? ` (${body.code})` : "";
    return `${body.message}${code}`;
  }
  if (status === 401) {
    return "Authentication failed. Live sites need an Application Password (Users → Profile → Application Passwords), not your normal wp-admin password. Localhost can use the normal password.";
  }
  if (status === 403) {
    return "Permission denied — the user must have Administrator (manage_options) access.";
  }
  return `HTTP ${status}`;
}

/** Normalize Application Passwords (WP shows them with spaces). */
export function normalizeWpAppPassword(password: string): string {
  return password.replace(/\s+/g, "");
}

export type WpWhoAmI = {
  ok?: boolean;
  authHeaderSeen?: boolean;
  loggedIn?: boolean;
  canExport?: boolean;
  userLogin?: string | null;
  isLocalHost?: boolean;
  appPasswordsOn?: boolean | null;
};

/** Explain why remote Basic auth failed using /whoami diagnostics. */
export function explainWpAuthFailure(whoami: WpWhoAmI | null, isLocalUrl: boolean): string {
  if (!whoami) {
    return parseWpRestError(401, null);
  }
  if (!whoami.authHeaderSeen) {
    return "WordPress never received the Authorization header (common on shared hosting). Fix: create an Application Password and ensure HTTPS, or export from wp-admin → Tools → Grape Export and upload the zip in Studio.";
  }
  if (!whoami.loggedIn) {
    if (isLocalUrl) {
      return "Login failed. Check username/password. On localhost the normal wp-admin password works with this plugin.";
    }
    return "Login failed. On live sites you must use an Application Password (Users → Profile → Application Passwords), not your normal login password. Copy the password WP shows (spaces optional).";
  }
  if (!whoami.canExport) {
    return `Logged in as "${whoami.userLogin ?? "user"}" but that account is not an Administrator.`;
  }
  return parseWpRestError(401, null);
}

export function isLocalWpUrl(wpUrl: string): boolean {
  try {
    const host = new URL(wpUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  } catch {
    return /localhost|127\.0\.0\.1/i.test(wpUrl);
  }
}

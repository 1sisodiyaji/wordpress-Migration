/** Classify WordPress-enqueued asset URLs by origin layer. */

export type WpAssetLayer =
  | "core"
  | "theme"
  | "plugin"
  | "uploads"
  | "cache"
  | "external";

export interface WpAssetClassification {
  layer: WpAssetLayer;
  pluginSlug?: string;
  themeSlug?: string;
}

export function classifyWpAssetUrl(url: string): WpAssetClassification {
  const lower = url.toLowerCase();
  if (lower.includes("/wp-includes/")) return { layer: "core" };
  if (lower.includes("/wp-content/mu-plugins/")) {
    const m = url.match(/\/wp-content\/mu-plugins\/([^/]+)/i);
    return { layer: "plugin", pluginSlug: m?.[1] ?? "mu-plugins" };
  }
  if (lower.includes("/wp-content/themes/")) {
    const m = url.match(/\/wp-content\/themes\/([^/]+)/i);
    return { layer: "theme", themeSlug: m?.[1] };
  }
  if (lower.includes("/wp-content/plugins/")) {
    const m = url.match(/\/wp-content\/plugins\/([^/]+)/i);
    return { layer: "plugin", pluginSlug: m?.[1] };
  }
  if (
    lower.includes("/wp-content/cache/") ||
    lower.includes("/wp-content/litespeed/") ||
    lower.includes("/wp-content/autoptimize/")
  ) {
    return { layer: "cache" };
  }
  if (lower.includes("/wp-content/uploads/")) return { layer: "uploads" };
  return { layer: "external" };
}

export interface LayeredStylesheets {
  all: string[];
  core: string[];
  theme: string[];
  plugin: string[];
  uploads: string[];
  cache: string[];
  external: string[];
}

export interface LayeredScript {
  src?: string;
  inline?: string;
  id?: string;
  type?: string;
  layer: WpAssetLayer;
  pluginSlug?: string;
  themeSlug?: string;
}

export interface LayeredScripts {
  all: LayeredScript[];
  core: LayeredScript[];
  theme: LayeredScript[];
  plugin: LayeredScript[];
  uploads: LayeredScript[];
  cache: LayeredScript[];
  external: LayeredScript[];
}

function pushUnique(list: string[], url: string): void {
  if (!list.includes(url)) list.push(url);
}

export function layerStylesheets(urls: string[]): LayeredStylesheets {
  const out: LayeredStylesheets = {
    all: [],
    core: [],
    theme: [],
    plugin: [],
    uploads: [],
    cache: [],
    external: [],
  };
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.all.push(url);
    const { layer } = classifyWpAssetUrl(url);
    pushUnique(out[layer], url);
  }
  return out;
}

export function layerScripts(
  scripts: Array<{ src?: string; inline?: string; id?: string; type?: string }>,
): LayeredScripts {
  const out: LayeredScripts = {
    all: [],
    core: [],
    theme: [],
    plugin: [],
    uploads: [],
    cache: [],
    external: [],
  };
  const seenSrc = new Set<string>();

  for (const script of scripts) {
    const key = script.src ?? `inline:${script.id ?? script.inline?.slice(0, 40) ?? ""}`;
    if (script.src && seenSrc.has(key)) continue;
    if (script.src) seenSrc.add(key);

    const layerInfo = script.src
      ? classifyWpAssetUrl(script.src)
      : ({ layer: "external" as const } satisfies WpAssetClassification);

    const entry: LayeredScript = {
      ...script,
      layer: layerInfo.layer,
      pluginSlug: layerInfo.pluginSlug,
      themeSlug: layerInfo.themeSlug,
    };
    out.all.push(entry);
    out[layerInfo.layer].push(entry);
  }
  return out;
}

export function collectPluginSlugs(stylesheets: LayeredStylesheets, scripts: LayeredScripts): string[] {
  const slugs = new Set<string>();
  for (const url of stylesheets.plugin) {
    const c = classifyWpAssetUrl(url);
    if (c.pluginSlug) slugs.add(c.pluginSlug);
  }
  for (const s of scripts.plugin) {
    if (s.pluginSlug) slugs.add(s.pluginSlug);
  }
  return [...slugs].sort();
}

export function collectThemeSlugs(stylesheets: LayeredStylesheets, scripts: LayeredScripts): string[] {
  const slugs = new Set<string>();
  for (const url of stylesheets.theme) {
    const c = classifyWpAssetUrl(url);
    if (c.themeSlug) slugs.add(c.themeSlug);
  }
  for (const s of scripts.theme) {
    if (s.themeSlug) slugs.add(s.themeSlug);
  }
  return [...slugs].sort();
}

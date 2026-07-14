/**
 * Naming rules for generated React + GrapeJS projects.
 *
 * | Layer            | Convention   | Example (route `/hello-world`) |
 * |------------------|--------------|--------------------------------|
 * | site.json `key`  | kebab-case   | `hello-world`                  |
 * | Component name   | PascalCase   | `PageHelloWorld`               |
 * | File name        | PascalCase   | `PageHelloWorld.tsx`           |
 *
 * Hyphens/underscores in route keys must never appear in component or file names.
 */

/** Turn one route-key segment into PascalCase (`hello-world` → `HelloWorld`). */
export function toPascalCase(segment: string): string {
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** React component name for a page route key (`hello-world` → `PageHelloWorld`). */
export function pageKeyToComponent(key: string): string {
  if (key === "home") return "PageHome";
  const base = key.split("__").map(toPascalCase).join("");
  return base ? `Page${base}` : "PageUnknown";
}

/** Generated page module file name (`hello-world` → `PageHelloWorld.tsx`). */
export function pageKeyToFileName(key: string): string {
  return `${pageKeyToComponent(key)}.tsx`;
}

/** Maps route path to a safe filename key under `pages/`. */
export function routeToPageKey(routePath: string): string {
  if (routePath === "/") return "home";
  return routePath.replace(/^\//, "").replace(/\//g, "__");
}

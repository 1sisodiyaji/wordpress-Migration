import type { WorkspacePane } from "./nav-messages";

/** Injected into proxied / preview HTML so the workspace URL bar tracks navigation. */
export function navigationBeaconScript(pane: WorkspacePane): string {
  return `<script>
(function () {
  var PANE = ${JSON.stringify(pane)};
  function workspacePathFromUrl(url) {
    try {
      var u = new URL(url, location.origin);
      if (u.pathname.indexOf("/workspace/") === 0) {
        return u.pathname + u.search + u.hash;
      }
    } catch (e) {}
    return url;
  }
  function displayUrl() {
    var meta = document.querySelector('meta[name="wp-migrate-display-url"]');
    if (meta && meta.getAttribute("content")) {
      return meta.getAttribute("content");
    }
    if (PANE === "migrated") {
      return workspacePathFromUrl(location.href);
    }
    return location.href;
  }
  function report() {
    try {
      parent.postMessage({ type: "wp-migrate-nav", pane: PANE, url: displayUrl() }, "*");
    } catch (e) {}
  }
  report();
  window.addEventListener("load", report);
  window.addEventListener("popstate", report);
  window.addEventListener("hashchange", report);
  var push = history.pushState;
  var replace = history.replaceState;
  history.pushState = function () { push.apply(this, arguments); report(); };
  history.replaceState = function () { replace.apply(this, arguments); report(); };
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    try {
      var url = PANE === "migrated" ? workspacePathFromUrl(a.href) : a.href;
      parent.postMessage({ type: "wp-migrate-nav", pane: PANE, url: url }, "*");
    } catch (err) {}
  }, true);
})();
</script>`;
}

export function injectNavigationBeacon(html: string, pane: WorkspacePane): string {
  const beacon = navigationBeaconScript(pane);
  if (html.includes("</body>")) {
    return html.replace(/<\/body>/i, `${beacon}\n</body>`);
  }
  return `${html}\n${beacon}`;
}

export function setDisplayUrlMeta(html: string, displayUrl: string): string {
  const escaped = displayUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const tag = `<meta name="wp-migrate-display-url" content="${escaped}">`;
  if (html.includes("</head>")) {
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }
  return `${tag}\n${html}`;
}

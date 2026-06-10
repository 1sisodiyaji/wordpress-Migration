import { useEffect } from "react";
import type { PageShellAssets } from "@/api/wp/types";
import { useSiteSourceUrl } from "@/lib/wp/site-context";

type WindowWithJQuery = Window & { jQuery?: unknown; $?: unknown };

interface ElementorRuntimeProps {
  /** Page-specific scripts/styles from Elementor custom code */
  assets?: PageShellAssets | null;
  /** Site-wide snippet CSS (conditional custom code) */
  globalCss?: string | null;
}

/**
 * Hydrates Elementor custom_code / snippet behavior after React mounts.
 * Scripts from migration manifest only (not arbitrary WP output).
 */
export function ElementorRuntime({ assets, globalCss }: ElementorRuntimeProps) {
  const sourceUrl = useSiteSourceUrl();

  useEffect(() => {
    if (globalCss) {
      const id = "wp-migrated-elementor-global-css";
      if (!document.getElementById(id)) {
        const el = document.createElement("style");
        el.id = id;
        el.textContent = globalCss;
        document.head.appendChild(el);
      }
    }
  }, [globalCss]);

  useEffect(() => {
    if (!assets) return;

    const injected: HTMLElement[] = [];

    for (const style of assets.styles) {
      if (!style.inline) continue;
      const el = document.createElement("style");
      if (style.id) el.id = `wp-migrated-${style.id}`;
      el.textContent = style.inline;
      document.head.appendChild(el);
      injected.push(el);
    }

    const addExternalScript = (
      item: PageShellAssets["scripts"][0],
    ): Promise<void> => {
      return new Promise((resolve) => {
        if (!item.src) return resolve();

        const existing = document.querySelector(
          `script[data-wp-migrated-src="${item.src}"]`,
        );
        if (existing) return resolve();

        const script = document.createElement("script");
        if (item.id) script.id = `wp-migrated-${item.id}`;
        if (item.type) script.type = item.type;
        script.src = item.src;
        script.async = false;
        script.defer = false;
        script.dataset.wpMigratedSrc = item.src;

        const complete = () => {
          script.removeEventListener("load", complete);
          script.removeEventListener("error", complete);
          resolve();
        };

        script.addEventListener("load", complete);
        script.addEventListener("error", (error) => {
          console.warn(
            "[ElementorRuntime] external script failed",
            itemLabel(item),
            error,
          );
          complete();
        });

        document.body.appendChild(script);
        injected.push(script);
      });
    };

    const getScriptType = (inline: string) => {
      const trimmed = inline.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "application/json";
      }
      return undefined;
    };

    const needsJQuery = (inline: string): boolean => {
      const trimmed = inline.trim();
      if (!trimmed) return false;
      return /\b(?:jQuery|\$)\s*(?:\(|\.)/.test(trimmed);
    };

    const ensureJQuery = async (): Promise<void> => {
      const win = window as WindowWithJQuery;
      if (typeof win.jQuery !== "undefined" || typeof win.$ !== "undefined") {
        return;
      }

      const fallbackSrc = `${sourceUrl}/wp-includes/js/jquery/jquery.min.js`;
      await addExternalScript({ src: fallbackSrc, id: "wp-migrated-jquery-fallback" });
    };

    const addInlineScript = (item: PageShellAssets["scripts"][0]) => {
      if (!item.inline) return;

      const script = document.createElement("script");
      if (item.id) script.id = `wp-migrated-${item.id}`;
      const type = getScriptType(item.inline);
      if (type) script.type = type;
      script.textContent = item.inline;
      script.dataset.wpMigrated = "inline";
      document.body.appendChild(script);
      injected.push(script);
    };

    void (async () => {
      const hasJQueryInline = assets.scripts.some(
        (scriptItem) => scriptItem.inline && needsJQuery(scriptItem.inline),
      );

      if (hasJQueryInline) {
        const win = window as WindowWithJQuery;
        if (typeof win.jQuery === "undefined" && typeof win.$ === "undefined") {
          await ensureJQuery();
        }
      }

      for (const scriptItem of assets.scripts) {
        if (scriptItem.src) {
          await addExternalScript(scriptItem);
        }
      }

      for (const scriptItem of assets.scripts) {
        if (!scriptItem.src) {
          try {
            addInlineScript(scriptItem);
          } catch (err) {
            console.warn(
              "[ElementorRuntime] inline script failed",
              itemLabel(scriptItem),
              err,
            );
          }
        }
      }
    })();

    return () => {
      for (const el of injected) {
        el.remove();
      }
    };
  }, [assets, sourceUrl]);

  return null;
}

function itemLabel(item: PageShellAssets["scripts"][0]): string {
  return item.id ?? item.src ?? "inline";
}

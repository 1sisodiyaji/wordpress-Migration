import { useEffect } from "react";
import { criticalScriptUrls } from "@/lib/wp/elementor-critical-js";
import { useLiveCss } from "@/lib/wp/env";
import { useSiteSourceUrl } from "@/lib/wp/site-context";

export interface ElementorScriptBundle {
  scripts: string[];
  inlineScripts: Array<{ id?: string; content: string; type?: string }>;
}

interface ElementorFrontendLoaderProps {
  bundle: ElementorScriptBundle | null;
}

export function ElementorFrontendLoader({ bundle }: ElementorFrontendLoaderProps) {
  const liveCss = useLiveCss();
  const sourceUrl = useSiteSourceUrl();

  useEffect(() => {
    const critical = criticalScriptUrls(sourceUrl);
    const scriptUrls = liveCss
      ? [...(bundle?.scripts ?? []), ...critical]
      : [...critical, ...(bundle?.scripts ?? [])];

    if (!scriptUrls.length) return;

    const unique = [...new Set(scriptUrls)].filter(
      (src) =>
        !src.includes("wp-admin") &&
        !src.includes("comment-reply") &&
        (src.includes("elementor") ||
          src.includes("elementskit") ||
          src.includes("jquery") ||
          src.includes("swiper") ||
          src.includes("essential-addons")),
    );

    if (!unique.length) return;

    const inlineFirst =
      bundle?.inlineScripts.filter(
        (s) =>
          s.content.includes("elementorFrontendConfig") ||
          s.content.includes("ElementorProFrontendConfig") ||
          s.id?.includes("elementor"),
      ) ?? [];

    let cancelled = false;

    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve) => {
        if (document.querySelector(`script[data-elementor-src="${src}"]`)) {
          resolve();
          return;
        }
        const el = document.createElement("script");
        el.src = src;
        el.dataset.elementorSrc = src;
        el.onload = () => resolve();
        el.onerror = () => resolve();
        document.body.appendChild(el);
      });

    void (async () => {
      for (const inline of inlineFirst) {
        if (cancelled) return;
        const id = inline.id ?? "elementor-inline-config";
        if (document.getElementById(id)) continue;
        const el = document.createElement("script");
        el.id = id;
        if (inline.type) el.type = inline.type;
        el.textContent = inline.content;
        document.body.appendChild(el);
      }

      for (const src of unique) {
        if (cancelled) return;
        await loadScript(src);
      }

      const w = window as Window & {
        elementorFrontend?: { init?: () => void };
        jQuery?: (sel: unknown) => { trigger?: (ev: string) => void };
      };
      try {
        w.elementorFrontend?.init?.();
      } catch {
        /* already init */
      }
      w.jQuery?.(window).trigger?.("elementor/frontend/init");
    })();

    return () => {
      cancelled = true;
    };
  }, [bundle, liveCss, sourceUrl]);

  return null;
}

import { getElementorAssets } from "@/api/wp/elementor-assets";
import {
  ElementorFrontendLoader,
  type ElementorScriptBundle,
} from "./ElementorFrontendLoader";

export function ElementorFrontendLoaderServer({ site }: { site: string }) {
  const assets = getElementorAssets(site);
  const bundle: ElementorScriptBundle | null = assets
    ? {
        scripts: assets.scripts.map((s) => s.src),
        inlineScripts: assets.inlineScripts,
      }
    : null;

  return <ElementorFrontendLoader bundle={bundle} />;
}

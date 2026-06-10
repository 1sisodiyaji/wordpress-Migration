import { createContext, useContext } from "react";
import { getWordPressSourceUrl } from "@/api/wp/source-url";

interface SiteContextValue {
  slug: string;
  sourceUrl: string;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({
  site,
  sourceUrl,
  children,
}: {
  site: string;
  sourceUrl?: string;
  children: React.ReactNode;
}) {
  const value: SiteContextValue = {
    slug: site,
    sourceUrl: sourceUrl ?? getWordPressSourceUrl(site),
  };
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteSlug(): string {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteSlug must be used within SiteProvider");
  return ctx.slug;
}

export function useSiteSourceUrl(): string {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteSourceUrl must be used within SiteProvider");
  return ctx.sourceUrl;
}

export function useOptionalSiteSlug(): string | null {
  return useContext(SiteContext)?.slug ?? null;
}

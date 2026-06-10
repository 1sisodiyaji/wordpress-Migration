import { wpFetchAllLight } from "../../../../app/api/wp/client";
import { WP_URL } from "../../../../app/api/wp/config";
import { wpHttpFetch } from "../../../../app/api/wp/http";

interface LightPost {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  meta?: Record<string, unknown>;
}

async function resolveKitId(): Promise<number | undefined> {
  const base = WP_URL.replace(/\/$/, "");

  // Public REST (no auth) — Elementor kit CPT
  try {
    const kits = await wpFetchAllLight<LightPost>("/wp/v2/elementor_library", {
      status: "publish",
      per_page: "100",
    });
    const kit = kits.find(
      (k) =>
        String(k.meta?.["_elementor_template_type"] ?? "").toLowerCase() === "kit" ||
        k.slug === "default-kit" ||
        k.title?.rendered?.toLowerCase().includes("kit"),
    );
    if (kit) return kit.id;
  } catch {
    /* meta may not be in REST */
  }

  // Authenticated Elementor settings endpoint (local dev with app password)
  try {
    const res = await wpHttpFetch(`${base}/wp-json/elementor/v1/settings/elementor_active_kit`);
    if (res.ok) {
      const json = (await res.json()) as { data?: { value?: string | number } };
      const v = json.data?.value;
      const id = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
      if (id) return id;
    }
  } catch {
    /* optional */
  }

  return undefined;
}

/** Fetch Theme Builder templates + custom code snippets from REST. */
export async function fetchElementorMetaFromApi(): Promise<{
  templateIds: number[];
  snippetIds: number[];
  kitId?: number;
}> {
  const templateIds: number[] = [];
  const snippetIds: number[] = [];

  const fetches: Promise<LightPost[]>[] = [
    wpFetchAllLight<LightPost>("/wp/v2/elementor_library", { status: "publish" }).catch(
      () => [],
    ),
    wpFetchAllLight<LightPost>("/wp/v2/elementor_snippet", { status: "publish" }).catch(
      () => [],
    ),
    wpFetchAllLight<LightPost>("/wp/v2/e-floating-buttons", { status: "publish" }).catch(
      () => [],
    ),
  ];

  const [library, snippets, floating] = await Promise.all(fetches);
  templateIds.push(...library.map((t) => t.id), ...floating.map((t) => t.id));
  snippetIds.push(...snippets.map((s) => s.id));

  const kitId = await resolveKitId();

  return { templateIds, snippetIds, kitId };
}

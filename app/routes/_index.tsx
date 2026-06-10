import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { Globe } from "lucide-react";
import type { Route } from "./+types/_index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readRegistry, siteHasData } from "@/api/wp/sites";
import type { SiteEntry } from "@/api/wp/sites";

export async function loader() {
  return {
    sites: readRegistry().map((site) => ({
      ...site,
      hasData: siteHasData(site.slug),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "migrate");

  if (intent === "delete") {
    const slug = String(form.get("slug") ?? "").trim();
    if (!slug) return { error: "Missing project to delete." };
    const { deleteSite } = await import("@/api/wp/sites");
    deleteSite(slug);
    throw redirect("/");
  }

  const url = String(form.get("url") ?? "").trim();
  if (!url) return { error: "Enter a WordPress site URL." };

  const { startMigration } = await import("@/api/migration/start-migration.server");
  const { slug } = startMigration(url);
  throw redirect(`/migrate/${slug}`);
}

function StatusBadge({ site }: { site: SiteEntry & { hasData: boolean } }) {
  const styles = {
    ready: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    migrating: "bg-blue-50 text-blue-700 ring-blue-600/10",
    failed: "bg-red-50 text-red-700 ring-red-600/10",
  }[site.status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      {site.status}
      {site.routes ? ` · ${site.routes} routes` : ""}
    </span>
  );
}

export default function PortalHome({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="platform-ui relative min-h-screen overflow-hidden bg-[#f8fafd] font-sans text-slate-800 antialiased">
      {/* Gemini-style gradient orbs */}
      <div
        aria-hidden
        className="animate-gemini-float pointer-events-none absolute -top-32 left-[15%] size-[28rem] rounded-full bg-blue-400/25 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-gemini-float-reverse pointer-events-none absolute right-[8%] bottom-[12%] size-96 rounded-full bg-violet-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-gemini-float-slow pointer-events-none absolute top-[38%] -left-24 size-80 rounded-full bg-teal-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[18%] right-[22%] size-56 rounded-full bg-rose-300/15 blur-3xl"
      />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-10">
        {/* Hero */}
        <div className="w-full text-center">
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-slate-500 uppercase">
            WordPress → Remix
          </p>
          <h1 className="bg-linear-to-br from-slate-900 via-slate-800 to-blue-700 bg-clip-text text-4xl font-normal tracking-tight text-transparent sm:text-5xl">
            Clone any WordPress site
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-slate-600">
            Paste a live WordPress URL. We mirror styles, pages, and posts into a
            dedicated project you can browse here.
          </p>
        </div>

        {/* Search pill — shadcn Input + Button */}
        <Form method="post" className="mt-10 w-full max-w-2xl">
          <input type="hidden" name="intent" value="migrate" />
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 p-2 pl-5 shadow-lg shadow-slate-200/50 backdrop-blur-md transition-shadow focus-within:border-blue-300 focus-within:shadow-blue-100/60">
            <Globe
              className="size-5 shrink-0 text-slate-400"
              aria-hidden
            />
            <Input
              name="url"
              type="url"
              required
              placeholder="https://your-wordpress-site.com"
              disabled={busy}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              type="submit"
              disabled={busy}
              size="lg"
              className="h-11 shrink-0 rounded-full bg-linear-to-r from-blue-600 to-violet-600 px-6 shadow-md shadow-blue-500/25 hover:from-blue-500 hover:to-violet-500"
            >
              {busy ? "Starting…" : "Migrate"}
            </Button>
          </div>
        </Form>

        {actionData?.error ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {actionData.error}
          </p>
        ) : null}

        {/* Projects */}
        {loaderData.sites.length > 0 ? (
          <section className="mt-12 w-full max-w-2xl">
            <h2 className="mb-3 text-sm font-medium text-slate-500">
              Your projects
            </h2>
            <ul className="max-h-[min(40vh,22rem)] space-y-2 overflow-y-auto pr-1">
              {loaderData.sites.map((site) => (
                <li
                  key={site.slug}
                  className="flex items-stretch gap-2 rounded-2xl"
                >
                  <Link
                    to={
                      site.status === "migrating" || site.status === "failed"
                        ? `/migrate/${site.slug}`
                        : site.hasData
                          ? site.stage === "full"
                            ? `/${site.slug}`
                            : `/workspace/${site.slug}`
                          : `/migrate/${site.slug}`
                    }
                    className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3.5 shadow-sm backdrop-blur-sm transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-100/40"
                  >
                    <div className="min-w-0 text-left">
                      <span className="block truncate font-medium text-slate-800 group-hover:text-blue-700">
                        {site.name}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-slate-500">
                        {site.url}
                      </span>
                    </div>
                    <StatusBadge site={site} />
                  </Link>
                  <Form
                    method="post"
                    className="flex shrink-0"
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          `Delete "${site.name}" and all migrated files? This cannot be undone.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="slug" value={site.slug} />
                    <button
                      type="submit"
                      title="Delete project"
                      className="rounded-2xl border border-red-200 bg-white px-4 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </Form>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-10 text-center text-sm text-slate-400">
            No projects yet — enter a URL above to get started.
          </p>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Elementor & Gutenberg supported · pixel-perfect CSS crawl
        </p>
      </main>
    </div>
  );
}

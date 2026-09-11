import type { PluginImportResult } from "../../Converter/shared/wp-import/import-plugin-export";
import type { SyncLocalExportResult } from "../../Converter/shared/wp-import/sync-local-export";

const CONVERTER_URL = (process.env.CONVERTER_URL ?? "http://localhost:5174").replace(/\/$/, "");

interface ConverterOk {
  ok: true;
  slug?: string;
  projectDir?: string;
  error?: string;
}

async function converterFetch<T>(
  pathname: string,
  body: unknown,
  timeoutMs = 10 * 60 * 1000,
): Promise<T> {
  const url = `${CONVERTER_URL}${pathname}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Converter unreachable at ${CONVERTER_URL}: ${message}`);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error ?? `Converter ${pathname} failed (HTTP ${res.status})`);
  }
  return data;
}

export async function converterGenerate(opts: {
  slug: string;
  port?: number;
}): Promise<ConverterOk & { projectDir: string; slug: string }> {
  return converterFetch("/api/generate", opts);
}

export async function converterImportPlugin(opts: {
  slug: string;
  name: string;
  source: string;
}): Promise<ConverterOk & PluginImportResult & { projectDir: string }> {
  return converterFetch("/api/import/plugin", opts);
}

export async function converterImportLocal(opts: {
  slug: string;
  name: string;
  importPath: string;
}): Promise<ConverterOk> {
  return converterFetch("/api/import/local", opts);
}

export async function converterSyncLocal(opts: {
  slug: string;
  name: string;
  copyMedia?: boolean;
  skipGenerate?: boolean;
}): Promise<ConverterOk & SyncLocalExportResult> {
  return converterFetch("/api/sync-local", opts);
}

export { CONVERTER_URL };

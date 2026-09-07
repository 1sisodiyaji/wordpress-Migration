/**
 * Structured console logging for the Admin/Converter migration pipeline.
 * Also mirrors lines into Projects/{slug}/migration.log when a slug is set.
 */
import { appendMigrationLog, initMigrationLog } from "./wp/migration-log";

type Step =
  | "upload"
  | "unzip"
  | "import"
  | "sync"
  | "convert"
  | "install"
  | "editor"
  | "admin";

const ICONS: Record<Step | "ok" | "fail" | "info", string> = {
  upload: "📤",
  unzip: "📦",
  import: "📥",
  sync: "🔄",
  convert: "⚙️",
  install: "📚",
  editor: "🚀",
  admin: "🎨",
  ok: "✅",
  fail: "❌",
  info: "•",
};

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function line(icon: string, message: string): string {
  return `[${ts()}] ${icon}  ${message}`;
}

function emit(slug: string | undefined, text: string): void {
  console.log(text);
  if (slug) {
    try {
      appendMigrationLog(slug, text);
    } catch {
      /* ignore log write failures */
    }
  }
}

export function pipelineBanner(title: string, slug?: string): void {
  const bar = "─".repeat(56);
  emit(slug, `\n${bar}`);
  emit(slug, line(ICONS.admin, title));
  emit(slug, bar);
}

export function pipelineStep(step: Step, message: string, slug?: string): void {
  emit(slug, line(ICONS[step], message));
}

export function pipelineInfo(message: string, slug?: string): void {
  emit(slug, line(ICONS.info, message));
}

export function pipelineOk(message: string, slug?: string): void {
  emit(slug, line(ICONS.ok, message));
}

export function pipelineFail(message: string, slug?: string): void {
  emit(slug, line(ICONS.fail, message));
}

export function pipelineDetail(label: string, value: string, slug?: string): void {
  emit(slug, line("  ", `${label}: ${value}`));
}

export function pipelineStartMigrationLog(slug: string, source: string): void {
  initMigrationLog(slug, source, true);
}

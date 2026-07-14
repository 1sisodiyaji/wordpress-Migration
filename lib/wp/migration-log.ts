import fs from "node:fs";
import path from "node:path";
import { SITES_ROOT } from "./sites";

export function getMigrationLogPath(slug: string): string {
  return path.join(SITES_ROOT, slug, "migration.log");
}

export function ensureSiteDir(slug: string): void {
  fs.mkdirSync(path.join(SITES_ROOT, slug), { recursive: true });
}

export function initMigrationLog(slug: string, url: string, retry = false): void {
  ensureSiteDir(slug);
  const header = [
    retry ? `\n--- Retry ${new Date().toISOString()} ---` : "",
    `[${new Date().toISOString()}] Migration started`,
    `Source: ${url}`,
    `Site folder: sites/${slug}/`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  if (retry && fs.existsSync(getMigrationLogPath(slug))) {
    fs.appendFileSync(getMigrationLogPath(slug), `\n${header}\n`, "utf8");
  } else {
    fs.writeFileSync(getMigrationLogPath(slug), `${header}\n`, "utf8");
  }
}

export function readMigrationLog(slug: string, maxBytes = 120_000): string {
  const file = getMigrationLogPath(slug);
  if (!fs.existsSync(file)) return "";
  try {
    const stat = fs.statSync(file);
    if (stat.size <= maxBytes) {
      return fs.readFileSync(file, "utf8");
    }
    const start = stat.size - maxBytes;
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const text = buf.toString("utf8");
    const firstNewline = text.indexOf("\n");
    return firstNewline >= 0 ? `…\n${text.slice(firstNewline + 1)}` : `…\n${text}`;
  } catch {
    return "";
  }
}

export function appendMigrationLog(slug: string, line: string): void {
  ensureSiteDir(slug);
  fs.appendFileSync(getMigrationLogPath(slug), `${line}\n`, "utf8");
}

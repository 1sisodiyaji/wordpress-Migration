/**
 * Shared colorful console logger for Admin, Converter, migrate, and CLI tools.
 *
 * Usage:
 *   import { logger, installColorConsole } from "../shared/console-log";
 *   installColorConsole(); // optional: tint raw console.log / warn / error
 *   logger.info("…");
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function envLogLevel(): LogLevel {
  const raw = (process.env.MIGRATE_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

const minLevel = envLogLevel();

export const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightCyan: "\x1b[96m",
};

export function useColor(): boolean {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY || process.stderr.isTTY);
}

export function paint(code: string, text: string, enabled = useColor()): string {
  return enabled ? `${code}${text}${ansi.reset}` : text;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function stampShort(): string {
  return new Date().toISOString().slice(11, 19);
}

function stampFull(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

const LEVEL_STYLE: Record<LogLevel, { label: string; color: string }> = {
  debug: { label: "DEBUG", color: ansi.gray },
  info: { label: "INFO ", color: ansi.brightCyan },
  warn: { label: "WARN ", color: ansi.brightYellow },
  error: { label: "ERROR", color: ansi.brightRed },
};

/** Highlight success / failure / skip phrases in a log line. */
export function colorizeMessage(msg: string, level: LogLevel = "info"): string {
  if (!useColor()) return msg;

  if (
    /Quality PASS|✓ SUCCESS|✅|Converted →|listening on|running at|Batch complete.*"ok":[1-9]/i.test(
      msg,
    )
  ) {
    return paint(ansi.brightGreen + ansi.bold, msg);
  }
  if (/Quality FAIL|✗ FAILED|❌|Fatal |failed|✖/i.test(msg)) {
    return paint(ansi.brightRed + ansi.bold, msg);
  }
  if (/^SKIP |already success|⏭/i.test(msg)) {
    return paint(ansi.yellow, msg);
  }
  if (/^▶ |Starting |Fresh start|Queued |Opening bundle|Landing bundle/i.test(msg)) {
    return paint(ansi.cyan, msg);
  }
  if (/^\[(html|colors|boxes|files|runtime)\]/i.test(msg)) {
    return paint(ansi.magenta, msg);
  }
  if (/delta x|text wp|background wp|border wp|wordpress x|vite x/i.test(msg)) {
    return paint(ansi.dim, msg);
  }
  if (/^⚙️|^📤|^📦|^📥|^🔄|^📚|^🚀|^🎨/.test(msg) || /\[converter\]|\[api\]|\[grape-persist\]/i.test(msg)) {
    return paint(ansi.brightCyan, msg);
  }
  if (level === "error") return paint(ansi.red, msg);
  if (level === "warn") return paint(ansi.yellow, msg);
  return msg;
}

export function formatLevelLine(level: LogLevel, msg: string, extra?: unknown): string {
  const style = LEVEL_STYLE[level];
  const time = paint(ansi.dim, `[${stampShort()}]`);
  const tag = paint(style.color + ansi.bold, style.label);
  const body = colorizeMessage(msg, level);
  if (extra === undefined) return `${time} ${tag} ${body}`;
  const extraText = typeof extra === "string" ? extra : JSON.stringify(extra);
  return `${time} ${tag} ${body} ${paint(ansi.dim, extraText)}`;
}

export function log(level: LogLevel, msg: string, extra?: unknown): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const line = formatLevelLine(level, msg, extra);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, e?: unknown) => log("debug", m, e),
  info: (m: string, e?: unknown) => log("info", m, e),
  warn: (m: string, e?: unknown) => log("warn", m, e),
  error: (m: string, e?: unknown) => log("error", m, e),
};

/** Color a pipeline-style line for the terminal (keep icons; tint message). */
export function colorPipelineLine(raw: string): string {
  if (!useColor()) return raw;
  // "[2026-10-07 10:00:00] ⚙️  message"
  const m = raw.match(/^(\[[^\]]+\])\s+(\S+)\s+(.*)$/);
  if (!m) return colorizeMessage(raw);
  const [, time, icon, message] = m;
  let msgColor = ansi.cyan;
  if (/✅|ok|PASS|Converted|listening|running/i.test(message) || icon === "✅") {
    msgColor = ansi.brightGreen + ansi.bold;
  } else if (/❌|FAIL|failed|✖/i.test(message) || icon === "❌") {
    msgColor = ansi.brightRed + ansi.bold;
  } else if (icon === "•") {
    msgColor = ansi.dim;
  } else if (/🎨|🚀|⚙️/.test(icon)) {
    msgColor = ansi.brightCyan;
  }
  return `${paint(ansi.dim, time!)} ${icon}  ${paint(msgColor, message!)}`;
}

export function formatBannerLine(title: string): string {
  const bar = "─".repeat(56);
  const coloredBar = paint(ansi.dim, bar);
  const head = paint(ansi.brightCyan + ansi.bold, `[${stampFull()}] 🎨  ${title}`);
  return `\n${coloredBar}\n${head}\n${coloredBar}`;
}

type ConsoleMethod = (...args: unknown[]) => void;

let consolePatched = false;

/**
 * Tint raw console.log / warn / error for entrypoints that still call console.*.
 * Safe to call once per process; respects NO_COLOR.
 */
export function installColorConsole(): void {
  if (consolePatched || !useColor()) return;
  consolePatched = true;

  const wrap =
    (orig: ConsoleMethod, level: LogLevel): ConsoleMethod =>
    (...args: unknown[]) => {
      const painted = args.map((arg) => {
        if (typeof arg !== "string") return arg;
        if (arg.includes("\x1b[")) return arg; // already styled
        return colorizeMessage(arg, level);
      });
      orig.apply(console, painted);
    };

  console.log = wrap(console.log.bind(console), "info");
  console.info = wrap(console.info.bind(console), "info");
  console.warn = wrap(console.warn.bind(console), "warn");
  console.error = wrap(console.error.bind(console), "error");
}

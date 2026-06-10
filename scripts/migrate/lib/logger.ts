import { appendMigrationLog } from "../../../app/api/wp/migration-log";

export function installMigrationLogger(slug: string): void {
  const tee =
    (original: typeof console.log) =>
    (...args: unknown[]) => {
      original(...args);
      const line = args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ");
      try {
        appendMigrationLog(slug, line);
      } catch {
        /* ignore log write errors */
      }
    };

  console.log = tee(console.log.bind(console));
  console.warn = tee(console.warn.bind(console));
  console.error = tee(console.error.bind(console));
}

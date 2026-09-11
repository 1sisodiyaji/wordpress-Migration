import fs from "node:fs";
import path from "node:path";

/** Generated sites + registry. Docker sets PROJECTS_ROOT=/app/output. */
export function getProjectsRoot(): string {
  return path.resolve(process.env.PROJECTS_ROOT ?? path.join(process.cwd(), "output"));
}

/** Unpack / scratch dir. Docker sets TMP_DIR=/app/tmp. */
export function getTmpDir(): string {
  const dir = path.resolve(process.env.TMP_DIR ?? path.join(process.cwd(), "tmp"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

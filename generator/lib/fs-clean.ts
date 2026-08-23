import fs from "node:fs";
import path from "node:path";

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

/** Delete files/dirs best-effort (Windows often locks Vite's public/ folder). */
function emptyDirBestEffort(dir: string): void {
  if (!fs.existsSync(dir)) return;
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      const st = fs.lstatSync(full);
      if (st.isDirectory()) {
        emptyDirBestEffort(full);
        try {
          fs.rmdirSync(full);
        } catch {
          /* still has locked children */
        }
      } else {
        fs.unlinkSync(full);
      }
    } catch {
      /* locked — skip */
    }
  }
}

/**
 * Remove a file or directory. On Windows ENOTEMPTY/EBUSY, empty what we can
 * and do not throw — generate can overwrite remaining files.
 */
export function rmPathSafe(target: string): void {
  if (!fs.existsSync(target)) return;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
      return;
    } catch (err) {
      if (!isLockError(err)) throw err;
      emptyDirBestEffort(target);
      try {
        fs.rmSync(target, { recursive: true, force: true });
        return;
      } catch (err2) {
        if (!isLockError(err2) && attempt === 5) throw err2;
        sleep(120 * (attempt + 1));
      }
    }
  }
}

/** Wipe generated project files; keep node_modules so a running Vite server can stay up. */
export function cleanGeneratedProject(projectDir: string): void {
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    return;
  }
  for (const entry of ["src", "public", "index.html", "vite.config.ts", "tsconfig.json", "package.json"]) {
    rmPathSafe(path.join(projectDir, entry));
  }
}

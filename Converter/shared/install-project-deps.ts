import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

function grapesCssPath(projectDir: string): string {
  return path.join(projectDir, "node_modules", "grapesjs", "dist", "css", "grapes.min.css");
}

/**
 * Install generated project deps. Prefer npm — under this repo root, `pnpm install`
 * in `Projects/<slug>` often completes without linking grapesjs (Vite then fails).
 */
function allowNativeBuilds(projectDir: string): void {
  try {
    const pkgPath = path.join(projectDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      pnpm?: { onlyBuiltDependencies?: string[] };
    };
    const only = new Set(pkg.pnpm?.onlyBuiltDependencies ?? []);
    only.add("esbuild");
    pkg.pnpm = { ...(pkg.pnpm ?? {}), onlyBuiltDependencies: [...only] };
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  } catch {
    /* ignore */
  }
  fs.writeFileSync(path.join(projectDir, ".npmrc"), "ignore-scripts=false\n", "utf8");
}

export async function installProjectDeps(projectDir: string): Promise<void> {
  if (!fs.existsSync(path.join(projectDir, "package.json"))) {
    throw new Error(`No package.json in ${projectDir}`);
  }

  allowNativeBuilds(projectDir);

  try {
    await run("npm", ["install"], projectDir);
  } catch {
    await run("pnpm", ["install", "--config.ignore-scripts=false"], projectDir);
  }

  if (!fs.existsSync(grapesCssPath(projectDir))) {
    await run("npm", ["install", "grapesjs@^0.22.8", "--save"], projectDir);
  }

  if (!fs.existsSync(grapesCssPath(projectDir))) {
    throw new Error(
      `Failed to install grapesjs CSS at ${grapesCssPath(projectDir)}. Run: cd ${projectDir} && npm install`,
    );
  }
}

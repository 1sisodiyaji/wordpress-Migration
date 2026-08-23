#!/usr/bin/env npx tsx
/**
 * Generate a React + GrapeJS project from a wp-grape-export bundle.
 *
 *   pnpm generate -- --site radius-ois
 *   pnpm generate -- --site radius-ois --port 3002 --run
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { generateReactGrapeProject, getProjectDir } from "./lib/scaffold";

const argv = process.argv.slice(2);
const site = getArg(argv, "--site") ?? getArg(argv, "-s");
const port = Number(getArg(argv, "--port") ?? "3001");
const shouldRun = argv.includes("--run");

if (!site) {
  console.error(`
Usage:
  pnpm generate -- --site <slug> [--port 3001] [--run]

Import a wp-grape-export ZIP in Studio first, or pull from a local WordPress site.
`);
  process.exit(1);
}

const projectDir = await generateReactGrapeProject({ siteSlug: site, port });

console.log(`\n✅ Generated React + GrapeJS project → projects/${site}/\n`);

if (shouldRun) {
  console.log(`📦 Installing dependencies in projects/${site}/...`);
  await runCmd("pnpm", ["install"], projectDir);
  console.log(`\n🚀 Starting dev server on port ${port}...`);
  console.log(`   http://localhost:${port}\n`);
  const child = spawn("pnpm", ["dev"], { cwd: projectDir, stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.log(`Next: cd projects/${site} && pnpm install && pnpm dev\n`);
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

function runCmd(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

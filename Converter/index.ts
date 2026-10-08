#!/usr/bin/env npx tsx
/**
 * Generate a React + GrapeJS project from a wp-grape-export bundle.
 *
 *   pnpm generate -- --site radius-ois
 *   pnpm generate -- --site radius-ois --port 3002 --run
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { installColorConsole, logger } from "../shared/console-log";
import { installProjectDeps } from "./shared/install-project-deps";
import { generateReactGrapeProject } from "./lib/scaffold";

installColorConsole();

const argv = process.argv.slice(2);
const site = getArg(argv, "--site") ?? getArg(argv, "-s");
const port = Number(getArg(argv, "--port") ?? "8000");
const shouldRun = argv.includes("--run");

if (!site) {
  logger.error(`Usage: pnpm generate -- --site <slug> [--port 3001] [--run]`);
  process.exit(1);
}

const projectDir = await generateReactGrapeProject({ siteSlug: site, port });

logger.info(`✅ Generated React + GrapeJS project → Projects/${site}/`);

if (shouldRun) {
  logger.info(`📦 Installing dependencies in Projects/${site}/...`);
  await installProjectDeps(projectDir);
  logger.info(`🚀 Starting dev server on port ${port}...`);
  logger.info(`http://localhost:${port}`);
  const child = spawn("npm", ["run", "dev"], { cwd: projectDir, stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  logger.info(`Next: cd Projects/${site} && npm install && npm run dev`);
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

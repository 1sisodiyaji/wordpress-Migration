#!/usr/bin/env npx tsx
/**
 * Audit missing CSS/JS after import or convert.
 *
 *   pnpm audit:assets -- --site gym-website
 *   pnpm audit:assets -- --site gym-website --fail
 *   pnpm audit:assets -- --all
 *
 * Writes:
 *   output/<slug>/data/audit/asset-fidelity.json
 *   output/<slug>/data/audit/asset-fidelity-history.jsonl
 *   output/asset-fidelity-history.jsonl
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  formatAssetFidelitySummary,
  runAssetFidelityAudit,
} from "./lib/asset-fidelity-audit";
import { getProjectsRoot } from "./shared/paths";

const argv = process.argv.slice(2);
const site = getArg(argv, "--site") ?? getArg(argv, "-s");
const all = argv.includes("--all");
const fail = argv.includes("--fail");
const phase = (getArg(argv, "--phase") as "post-import" | "post-convert" | undefined) ?? "post-convert";

if (!site && !all) {
  console.error(`
Usage:
  pnpm audit:assets -- --site <slug> [--fail] [--phase post-convert|post-import]
  pnpm audit:assets -- --all [--fail]

Env guardrails (strict by default — any missing design CSS fails):
  ASSET_AUDIT_MAX_MISSING_STYLES=0
  ASSET_AUDIT_MAX_MISSING_SCRIPTS=0
  ASSET_AUDIT_MAX_MISSING_CANVAS_STYLES=0
  ASSET_AUDIT_MAX_MISSING_CANVAS_SCRIPTS=0
  ASSET_AUDIT_MAX_MISSING_STYLE_RATIO=0
  ASSET_AUDIT_FAIL=0          # set to disable hard-fail on convert
`);
  process.exit(1);
}

const slugs = all ? listProjectSlugs() : [site!];
let failed = 0;

for (const slug of slugs) {
  try {
    const report = runAssetFidelityAudit({
      slug,
      phase,
      failOnGuardrail: fail,
    });
    console.log(formatAssetFidelitySummary(report));
    console.log(`  report → output/${slug}/data/audit/asset-fidelity.json\n`);
    if (!report.guardrail.passed) failed += 1;
  } catch (err) {
    failed += 1;
    console.error(`✖ ${slug}: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

if (fail && failed > 0) process.exit(1);

function listProjectSlugs(): string[] {
  const root = getProjectsRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((name) => {
      if (name.startsWith(".") || name === "registry.json") return false;
      return fs.existsSync(path.join(root, name, "data"));
    })
    .sort();
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

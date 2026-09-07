import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Kill a process and its children (needed on Windows: pnpm → node → vite). */
export function killProcessTree(pid: number | undefined | null): void {
  if (!pid || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    /* already exited */
  }
}

/** Read Vite dev port from a generated project (defaults to 3001). */
export function readProjectDevPort(projectDir: string): number {
  const vitePath = path.join(projectDir, "vite.config.ts");
  if (!fs.existsSync(vitePath)) return 3001;
  const match = fs.readFileSync(vitePath, "utf8").match(/port:\s*(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 3001;
}

/** Stop whatever is listening on `port` so the next Vite start serves fresh files. */
export async function killDevPort(port: number): Promise<boolean> {
  if (!Number.isFinite(port) || port < 1) return false;

  if (process.platform === "win32") {
    // netstat + taskkill /T is more reliable than Get-NetTCPConnection here
    // (elevated modules / IPv6 listeners / nested Vite PIDs).
    const script = [
      `$pids = @()`,
      `netstat -ano | ForEach-Object {`,
      `  if ($_ -match 'LISTENING\\s+(\\d+)\\s*$' -and ($_ -match ':${port}\\s' -or $_ -match '\\]:${port}\\s')) {`,
      `    $pids += [int]$Matches[1]`,
      `  }`,
      `}`,
      `$pids = $pids | Where-Object { $_ -gt 0 } | Select-Object -Unique`,
      `if (-not $pids) { exit 1 }`,
      `foreach ($p in $pids) { taskkill /F /T /PID $p 2>$null | Out-Null }`,
      `exit 0`,
    ].join("; ");
    const code = await run("powershell", ["-NoProfile", "-Command", script]);
    return code === 0;
  }

  const code = await run("sh", ["-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`]);
  return code === 0;
}

/**
 * Kill node/vite processes whose command line references `projectDir`
 * (covers orphans Studio no longer tracks after restart).
 */
export async function killProcessesUsingPath(projectDir: string): Promise<boolean> {
  const abs = path.resolve(projectDir);
  if (process.platform === "win32") {
    const needle = abs.replace(/'/g, "''");
    const script = [
      `$needle = '${needle}'`,
      `$hits = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='pnpm.exe' OR Name='cmd.exe'" -ErrorAction SilentlyContinue |`,
      `  Where-Object { $_.CommandLine -and ($_.CommandLine -like ('*' + $needle + '*') -or $_.CommandLine -like ('*' + ($needle -replace '\\\\','/') + '*')) }`,
      `if (-not $hits) { exit 1 }`,
      `$hits | ForEach-Object { taskkill /F /T /PID $_.ProcessId 2>$null | Out-Null }`,
      `exit 0`,
    ].join("; ");
    const code = await run("powershell", ["-NoProfile", "-Command", script]);
    return code === 0;
  }

  const code = await run("sh", [
    "-c",
    `pgrep -f ${JSON.stringify(abs)} | xargs -r kill -9 2>/dev/null || true`,
  ]);
  return code === 0;
}

export async function stopProjectDevServer(projectDir: string): Promise<number | null> {
  const port = readProjectDevPort(projectDir);
  await killProcessesUsingPath(projectDir);
  const killed = await killDevPort(port);
  return killed ? port : null;
}

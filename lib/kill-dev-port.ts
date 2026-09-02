import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
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
    const script = [
      `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
      "if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; exit 0 }",
      "exit 1",
    ].join("; ");
    const code = await run("powershell", ["-NoProfile", "-Command", script]);
    return code === 0;
  }

  const code = await run("sh", ["-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`]);
  return code === 0;
}

export async function stopProjectDevServer(projectDir: string): Promise<number | null> {
  const port = readProjectDevPort(projectDir);
  const killed = await killDevPort(port);
  return killed ? port : null;
}

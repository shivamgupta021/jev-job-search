import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { callCodex } from "../src/answers/codex.js";

afterEach(() => vi.unstubAllEnvs());

it.skipIf(process.platform === "win32")("stops the native child as well as its CLI launcher after a refused tool action", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "jev-codex-process-test-"));
  const launcher = path.join(dir, "codex");
  const pidFile = path.join(dir, "child.pid");
  writeFileSync(launcher, `#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
child.on('spawn', () => {
  writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
  console.log(JSON.stringify({type:'item.started', item:{type:'command_execution', command:'test'}}));
});
setInterval(() => {}, 1000);
`, { mode: 0o700 });
  vi.stubEnv("CODEX_COMMAND", launcher);
  let pid: number | undefined;
  const alive = () => { try { process.kill(pid!, 0); return true; } catch { return false; } };
  try {
    await expect(callCodex("test", "test", "low")).rejects.toThrow(/tool call/);
    pid = Number(readFileSync(pidFile, "utf8"));
    await expect.poll(alive, { timeout: 1500 }).toBe(false);
  } finally {
    if (pid && alive()) process.kill(pid, "SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { askWriter, writerUsage } from "../src/answers/resolve.js";
import { writerBackend } from "../src/config.js";
import { checkClaude, checkClaudeOnline } from "../src/doctor.js";
import { formatCost, summarizeCost } from "../src/log/cost.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn(), spawnSync: vi.fn(() => ({ status: 0, stdout: "codex-cli 0.167.0", stderr: "" })) }));
const answer = '{"verdict":"ready","answers":[]}';
const events = [
  { type: "thread.started", thread_id: "test" },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "1", type: "reasoning", text: "thinking" } },
  { type: "item.completed", item: { id: "2", type: "agent_message", text: answer } },
  { type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10 } },
];
function fakeProcess(output: unknown[], code = 0, chunks?: Buffer[]) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockImplementationOnce((() => {
    child.stdin.on("finish", () => queueMicrotask(() => {
      for (const chunk of chunks ?? [Buffer.from(output.map(e => JSON.stringify(e)).join("\n") + "\n")]) child.stdout.emit("data", chunk);
      child.emit("close", code);
    }));
    return child;
  }) as unknown as typeof spawn);
  return child;
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("Codex writer", () => {
  it("selects Codex explicitly even when an Anthropic key exists", () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
    expect(writerBackend()).toBe("codex");
  });
  it("returns the agent answer and counts cached input only once", async () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    const child = fakeProcess(events);
    const before = { ...writerUsage };
    let input = "";
    child.stdin.on("data", d => input += d.toString());
    expect(await askWriter("candidate facts", "Return JSON from the supplied facts.")).toBe(answer);
    expect(input).toBe("candidate facts");
    expect(writerUsage.calls - before.calls).toBe(1);
    expect(writerUsage.inputTokens - before.inputTokens).toBe(100);
    expect(writerUsage.outputTokens - before.outputTokens).toBe(10);
    const [command, args, options] = vi.mocked(spawn).mock.calls[0]!;
    expect(command).toBe("codex");
    expect(args).toEqual(expect.arrayContaining(["exec", "--json", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "read-only"]));
    expect(args).toContain("features.shell_tool=false");
    expect(args).toContain("web_search=\"disabled\"");
    expect(options?.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(options?.env?.OPENROUTER_API_KEY).toBeUndefined();
    expect(existsSync(options!.cwd as string)).toBe(false);
  });
  it("preserves non-ASCII answers when UTF-8 characters cross stream chunks", async () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    const unicode = Buffer.from(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Montréal" } }) + "\n" + JSON.stringify(events[4]));
    const cut = unicode.indexOf(Buffer.from("é")) + 1;
    fakeProcess([], 0, [unicode.subarray(0, cut), unicode.subarray(cut)]);
    expect(await askWriter("x", "y")).toBe("Montréal");
  });
  it("rejects malformed JSON events", async () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    fakeProcess([], 0, [Buffer.from("not JSON\n")]);
    await expect(askWriter("x", "y")).rejects.toThrow(/invalid event stream/);
  });
  it("uses configured executable and model without putting candidate facts in argv", async () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    vi.stubEnv("CODEX_COMMAND", "/custom/codex");
    vi.stubEnv("CODEX_MODEL", "test-model");
    fakeProcess(events);
    await askWriter("private candidate", "private instructions");
    const [command, args] = vi.mocked(spawn).mock.calls[0]!;
    expect(command).toBe("/custom/codex");
    expect(args).toEqual(expect.arrayContaining(["--model", "test-model"]));
    expect(JSON.stringify(args)).not.toMatch(/private candidate|private instructions/);
  });
  it.each([
    ["failed turn", [{ type: "turn.failed", error: { message: "failed" } }], 0],
    ["missing completion", events.slice(0, -1), 0],
    ["missing answer", [{ type: "turn.completed" }], 0],
    ["nonzero exit", events, 1],
    ["tool invocation", [{ type: "item.started", item: { id: "x", type: "command_execution", command: "anything" } }, ...events], 0],
  ])("rejects %s without returning a usable answer", async (_name, output, code) => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    fakeProcess(output as unknown[], code as number);
    await expect(askWriter("x", "y")).rejects.toThrow();
  });
  it("times out and kills the process", async () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    vi.useFakeTimers();
    const child = fakeProcess(events);
    child.stdin.removeAllListeners("finish");
    // Replace the fake completion with a process that never responds.
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockReturnValueOnce(child as never);
    const pending = expect(askWriter("x", "y")).rejects.toThrow(/did not answer/);
    await vi.advanceTimersByTimeAsync(180_001);
    await pending;
    expect(child.kill).toHaveBeenCalled();
  });
  it("checks Codex instead of requiring Claude during setup", async () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    expect(checkClaude()).toMatchObject({ name: "Codex", ok: true });
    fakeProcess(events.map(e => e.type === "item.completed" && e.item?.type === "agent_message" ? { ...e, item: { ...e.item, text: "ok" } } : e));
    expect(await checkClaudeOnline()).toMatchObject({ name: "Codex answers", ok: true });
  });
  it("does not label Codex usage as Claude or claim its billing is known", () => {
    vi.stubEnv("WRITER_BACKEND", "codex");
    const text = formatCost(summarizeCost([], []));
    expect(text).toContain("Codex");
    expect(text).not.toContain("Claude Code on your subscription");
    expect(text).toMatch(/not reported/i);
  });
});

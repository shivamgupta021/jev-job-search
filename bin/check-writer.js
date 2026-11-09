// A small online check with no profile, OpenRouter key, browser, or application required.
import { loadEnv } from "../src/config.ts";
import { checkClaude, checkClaudeOnline, formatChecks } from "../src/doctor.ts";
loadEnv();
const installed = checkClaude();
const checks = installed.ok ? [installed, await checkClaudeOnline()] : [installed];
console.log(formatChecks(checks).split("\nNext step:")[0]);
console.log(checks.every(check => check.ok) ? "Writer check passed. Continue with docs/CODEX.md." : `Next step: ${checks.find(check => !check.ok).fix}`);
process.exitCode = checks.every(check => check.ok) ? 0 : 1;

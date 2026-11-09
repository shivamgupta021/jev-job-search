# Use this fork with Codex

This fork lets Codex write form answers, tracking notes, resumes and cover letters.
JEV still handles ratings and structured decisions through OpenRouter. The existing
Chrome runner still fills and verifies forms. Claude is not required when
`WRITER_BACKEND=codex` is selected.

## 1. Open the project

Add `/Users/work/Depository/jev-job-search` as a project in the Codex app.
The implementation branch is `feat/codex-writer`.

In a terminal:

```bash
cd /Users/work/Depository/jev-job-search
git branch --show-current
npm ci --ignore-scripts
```

You need Node.js 22 or newer and Google Chrome on macOS. This change does not port
the Chrome paths or scheduler to other operating systems.

## 2. Sign in to the Codex CLI

The desktop app and the command-line executable are separate installations.
Use Codex CLI 0.167.0 or newer; this adapter was tested with 0.167.0.

```bash
npm install -g @openai/codex
codex --version
codex login
codex login status
```

Sign in with your account in the browser. Do not copy authentication files or keys
into the chat. If `codex --version` reports `ENOENT`, reinstall using the command
above. If the executable lives elsewhere, set its absolute path as `CODEX_COMMAND`.

## 3. Select Codex and check it independently

Create `.env` from the example only if you do not already have one:

```bash
cp -n .env.example .env
open -e .env
```

Set:

```dotenv
WRITER_BACKEND=codex
```

Then:

```bash
npm run check:writer
```

Expected: `Codex` and `Codex answers` both show `ok`. This makes one small live
model call. It does not need your resume or an OpenRouter key, open Chrome, or
submit anything. A failure exits with a nonzero status.

Optional settings:

```dotenv
CODEX_COMMAND=codex
CODEX_MODEL=
```

Leave the model blank to use the CLI's built-in default. To pick a model, enter an
ID available to your account. The writer intentionally ignores user `config.toml`,
so set the model here rather than relying on your interactive CLI preference.
It reuses your CLI login and honors `CODEX_HOME` when that environment variable
is set. A managed account policy still applies.

## 4. Add your profile and OpenRouter key

Put your real resume at `documents/resume.pdf`. In the Codex project chat, ask:

> Set up this job search using docs/CODEX.md and my resume. Ask me for missing
> profile details, use the Codex writer, and stop before submitting anything.

Codex should create `data/profile.json`, `data/bank.json`, and
`data/voice.local.md` from your facts. Check the profile summary and sample answer.
The example files contain a fictional person and must not be used as your profile.

Create an OpenRouter key and enter it yourself into `.env` as
`OPENROUTER_API_KEY`. Keep the file private. This is still required for JEV.

```bash
npx jev doctor --online
```

Expected: the writer, JEV, profile and resume checks pass. An empty job queue is
normal before discovery. Codex usage is separate from OpenRouter usage; this
application does not calculate Codex billing.

## 5. Rehearse one application

```bash
npx jev discover --limit 10
npx jev status
npx jev apply --dry --fresh --count 1
```

Pick a Greenhouse, Lever or Ashby job for the first test. You can target one from
the queue with `npx jev apply --dry --fresh JOB_ID`. `--fresh` prevents old writer
answers from hiding whether Codex is being called. A form with no open questions
may not need a writer call at all; `npm run check:writer` tests Codex directly.

Expected: Chrome opens, fields are filled and read back, and the rehearsal ends
without a submission. Check every displayed answer against your profile. A form
held for missing information is a valid outcome, not proof of an adapter failure.
Some boards save unsent drafts as you type, even in a rehearsal. Workday can sign
in using accounts you previously configured; keep it out of the first test.

To leave a form open for inspection:

```bash
npx jev apply --fresh --count 1
```

There is no `--submit` here. Only after inspecting and approving that specific form:

```bash
npx jev submit JOB_ID
```

That last command really sends an application. CAPTCHA, signatures and human
verification steps remain yours to complete.

## Optional: test tailored documents

```bash
npx jev tailor JOB_ID --cover --open
```

Expected: PDFs open and contain only your facts. This generates documents but
submits nothing. Existing validation can refuse a draft; do not bypass it.

## Developer checks

```bash
npm run check-types
npx vitest run tests/codex-writer.test.ts tests/codex-process.test.ts tests/writer.test.ts tests/doctor.test.ts tests/safety.test.ts
npm test
npm audit --omit=dev
```

The adapter tests use a simulated CLI process and make no model requests. The
full upstream suite includes local Chrome fixtures. The live writer check uses
your actual login. Real job-board testing requires your profile and OpenRouter.

Validation on 2026-11-09: all 433 tests and the TypeScript check passed. The live
writer check passed with Codex CLI 0.167.0 and an existing ChatGPT login. A live
fictional-profile check also held an unknown security-clearance answer for review.
No real job application was sent. At the upstream baseline, the dashboard browser
test had a temporary-directory cleanup failure; the final full run passed. The
runtime audit still reports an existing Zod advisory (GHSA-mrhx-c7xc-m3w5), separate
from Codex compatibility. This port does not upgrade the existing Zod dependency.

## How it works

The new transport runs `codex exec --json` in a private temporary directory,
reuses CLI authentication, and passes the existing writer instructions through
a temporary file. It uses an ephemeral session and read-only sandbox, disables
shell, app, browser, computer, image and subagent features, disables web search,
and skips user config and default plugins. It refuses a result if the event stream
reports a tool action, a failed turn, missing completion or an empty answer.
Temporary instructions are removed when the call ends. Existing Zod response
validation and form verification still run after the transport returns.

The original Claude Code and Anthropic API backends remain available. Switch
`WRITER_BACKEND` back to `claude-code` or `api` to use them. The original Claude
slash-command skills are not installed as Codex skills; use the project chat and
CLI commands above. Scheduled operation was not validated as part of this port.

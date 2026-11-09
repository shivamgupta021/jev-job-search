# Working with this fork in Codex

For implementation work, read `CONTRIBUTING.md` and the invariants and conventions
in `CLAUDE.md`. This fork also supports `WRITER_BACKEND=codex`; the upstream
statement that only Claude can write is superseded by this adapter.
Do not start onboarding or apply to jobs while working on code.

For a user asking to set up or use the job search, follow `docs/CODEX.md`.
Use the CLI from this repository. Build their profile from their supplied resume
and the questions in `.claude/skills/setup/questions.md`, asking only what their
materials do not answer. Use the available PDF reader and question tools rather
than assuming Claude tool names. Validate against `src/profile/schema.ts`.
Use their own facts for `data/bank.json` and `data/voice.local.md`; show the profile
summary and a sample written answer for correction. Never treat example data as
facts about the user. The `.claude/skills/` slash commands are not Codex commands.

Never print or request keys in chat. Let the user enter their OpenRouter key in
`.env`. Keep private files ignored. Do not submit an application without explicit
authorization. Start with one rehearsal, inspect its answers, then leave one
verified form open for the user to approve. Preserve all existing truth,
verification, duplicate-submission and human-check gates.

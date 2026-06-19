# AGENTS.md

This file is the Codex entry point for this repository. `CLAUDE.md` is now Claude Code specific and is not part of the Codex workflow. Keep `AGENTS.md` self-contained and update it when Codex-facing project rules change.

## Project Snapshot

- Product: 忆海拾光 / Memory Glimmers
- Main app: `index.html`
- Admin panel: `yihai_admin_v1.html`
- Storage: IndexedDB locally, Supabase for cloud sync
- Deployment: GitHub Pages
- Architecture: single-file app with inline CSS/JS
- Current production app version lives in `index.html` as `APP_VERSION`

## Local Environment

- Repo path: `/Users/chenlian/code`
- Shell: `zsh`
- Python command: `python3`
- Package manager: `npm`
- Local preview: `python3 -m http.server 8080 --directory .`

## First Commands

```bash
npm install
npm run setup:hooks
npm run setup:playwright
```

## Common Commands

```bash
npm test
npm run serve
npm run test:ui-smoke
npm run test:srs-e2e
npm run test:easy
```

## Key Files

- `index.html`: main training app and almost all runtime logic
- `yihai_admin_v1.html`: admin panel and Edge Function monitor
- `tests/run_all.js`: unit test entry
- `tests/_pw_*.js`: Playwright browser, sync, and regression coverage
- `docs/architecture.md`: data model, storage layers, and sync flow
- `docs/srs_design_v6.9.md`: SRS behavior and state machine
- `sql/`: Supabase schema and policies
- `supabase/functions/`: Edge Functions
- `.mcp.json`: project-scoped Supabase MCP config

## Core Rules

- Keep changes surgical. This repo intentionally keeps almost all runtime logic in `index.html`.
- Do not split app logic into new JS or CSS files unless the user explicitly changes the architecture.
- Do not push, release, tag, or deploy unless the user explicitly asks.
- Do not bump `APP_VERSION` unless the task is an explicit release.
- Do not use `confirm()`; use the existing custom dialog flow.
- Prefer the smallest change that solves the requested problem. Do not refactor adjacent code without need.
- Match existing style. Avoid comments unless documenting a non-obvious constraint or workaround in one short line.
- Use camelCase for JS variables, functions, and local keys. Database column names stay snake_case.

## Testing Rules

- Safe default after code changes: `npm test`
- Do not claim a fix is complete without running the relevant verification
- Browser-flow changes must add or update Playwright coverage before implementation changes
- DOM/rendering/async SDK issues are not considered covered by pure Node unit tests alone
- `_writeSrs` or IDB write-path changes require Playwright verification, not just unit tests
- Sync, auth, Supabase, IDB, SRS, or serialization changes must be verified with the impacted integration or end-to-end suite

## Test Selection

- Bug fix: run `npm test`
- UI or browser-flow changes: run the relevant Playwright suite in addition to `npm test`
- Release minimum: `npm test`, `npm run test:ui-smoke`, and `npm run test:srs-e2e`
- Easy mode changes: also run `npm run test:easy`
- Cloud/login changes: also run `npm run test:cloud-sync`
- Cross-device/sync changes: also run `npm run test:cross-device`
- Easy sync propagation changes: also run `npm run test:easy-sync`

## Behavior Constraints

- Single source of version truth: `const APP_VERSION = 'x.y.z'` in `index.html`
- All sync must go through `runSync(options)`
- Per-card upload only writes `sync_trials`; server triggers maintain `sync_card_states` and `easy_card_states`
- `daily_progress` and `last_warmup` are local-only and must not sync across devices
- Supabase calls must be wrapped defensively and gated by the existing sync/session flags
- After mutating in-memory deck metadata, persist with the existing save path such as `saveDeckIndex()`

## Serialization And Media Guardrails

- If touching `saveDeckCards`, `restoreDecks`, `runCardsPhase`, or `runMediaPhase`, verify all three paths:
- local `.yhspack` import renders `<img>`
- refresh preserves media via restore from storage
- cross-device sync renders media after download
- Do not treat in-memory `c.img` presence as sufficient proof; verify the real DOM render path
- `runMediaPhase` background writes must remain batch-oriented, not per-slot network chatter

## Workflow Expectations

- For bug fixes, locate the root cause before editing
- For feature or enhancement work, define the acceptance path before implementation
- Check whether docs need updates before staging changes
- Do not revert unrelated user changes in the worktree
- If the worktree is dirty, limit edits to files required for the task and avoid broad cleanup

## External Capabilities

- GitHub is available in the current Codex environment
- Browser / Playwright is available for local browser validation
- Supabase is configured via project-scoped MCP in `.mcp.json`

## Notes For Codex

- Preserve the established project conventions instead of replacing them with generic Codex defaults
- If future Claude Code guidance diverges, keep Codex behavior governed by this file
